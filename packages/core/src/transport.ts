import { randomUUID } from 'crypto'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import {
  STACKNEXT_SCHEMA_VERSION,
  STACKNEXT_SDK_VERSION,
  type StackNextDatabaseQueryInput,
  type StackNextErrorInput,
  type StackNextExporterDiagnostics,
  type StackNextIngestEnvelope,
  type StackNextProviderMode,
  type StackNextSpanInput,
} from './types.js'

const INGEST_PATH = '/__stacknext/v1/ingest'
const DEFAULT_MAX_QUEUE = 5_000
const DEFAULT_BATCH_SIZE = 250
const HEARTBEAT_INTERVAL_MS = 10_000
const MAX_BATCH_BYTES = 1_500_000

export interface StackNextTransportOptions {
  collectorUrl: string
  token: string
  serviceName?: string
  projectName?: string
  nextVersion?: string
  instanceId?: string
  maxQueueSize?: number
  batchSize?: number
  flushIntervalMs?: number
  requestTimeoutMs?: number
  heartbeatIntervalMs?: number
  debug?: boolean
  /** Defaults to `stacknext`; `external` reports that capture is inactive. */
  provider?: StackNextProviderMode
}

export interface TransportSnapshot {
  queuedSpans: number
  queuedErrors: number
  queuedDatabaseQueries: number
  exportedSpans: number
  exportedEvents: number
  droppedSpans: number
  droppedEvents: number
  lastError: string | null
  instanceId: string
  provider: StackNextProviderMode
}

type PostResult = 'ok' | 'retry' | 'too-large'

interface TransportGlobalState {
  __stacknextTransport?: StackNextTransport
  __stacknextTransportKey?: string
}

function globalState(): TransportGlobalState {
  return globalThis as unknown as TransportGlobalState
}

export function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    if (url.username || url.password) return false
    return (
      url.hostname === '127.0.0.1' ||
      url.hostname === 'localhost' ||
      url.hostname === '[::1]' ||
      url.hostname === '::1'
    )
  } catch {
    return false
  }
}

export function transportOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): { options: StackNextTransportOptions } | { error: string } {
  const collectorUrl = env.STACKNEXT_COLLECTOR_URL?.trim()
  const token = env.STACKNEXT_TOKEN?.trim()
  if (!collectorUrl && !token) {
    return { error: 'STACKNEXT_COLLECTOR_URL and STACKNEXT_TOKEN are not set' }
  }
  if (!collectorUrl) return { error: 'STACKNEXT_COLLECTOR_URL is not set' }
  if (!token) return { error: 'STACKNEXT_TOKEN is not set' }
  if (token.length < 16) return { error: 'STACKNEXT_TOKEN is too short' }
  if (!isLoopbackUrl(collectorUrl)) {
    return { error: 'STACKNEXT_COLLECTOR_URL must point to a loopback address' }
  }
  return {
    options: {
      collectorUrl,
      token,
      ...(env.STACKNEXT_PROJECT_NAME ? { projectName: env.STACKNEXT_PROJECT_NAME } : {}),
      ...(env.STACKNEXT_SERVICE_NAME ? { serviceName: env.STACKNEXT_SERVICE_NAME } : {}),
      ...(env.STACKNEXT_NEXT_VERSION ? { nextVersion: env.STACKNEXT_NEXT_VERSION } : {}),
      debug: env.STACKNEXT_DEBUG === '1',
    },
  }
}

/**
 * Returns the process-wide transport. Adapters and the OTel exporter share one
 * bounded queue so instrumentation cannot create multiple competing buffers.
 */
export function getStackNextTransport(
  options?: StackNextTransportOptions,
): StackNextTransport | null {
  const resolved = options ?? (() => {
    const fromEnv = transportOptionsFromEnv()
    return 'options' in fromEnv ? fromEnv.options : null
  })()
  if (!resolved) return null
  const state = globalState()
  const key = `${resolved.collectorUrl}|${resolved.token}|${resolved.serviceName ?? ''}`
  if (state.__stacknextTransport && state.__stacknextTransportKey === key) {
    return state.__stacknextTransport
  }
  if (state.__stacknextTransport) {
    void state.__stacknextTransport.shutdown(1_000)
  }
  const transport = new StackNextTransport(resolved)
  state.__stacknextTransport = transport
  state.__stacknextTransportKey = key
  return transport
}

/** Test helper: detaches the global transport without exporting queued data. */
export function resetGlobalTransportForTests(): void {
  const state = globalState()
  state.__stacknextTransport?.stopTimers()
  state.__stacknextTransport = undefined
  state.__stacknextTransportKey = undefined
}

/**
 * Bounded, asynchronous event forwarder. Application requests only enqueue
 * plain objects; network I/O always happens on timers and never blocks them.
 */
export class StackNextTransport {
  readonly instanceId: string
  readonly options: Required<
    Pick<
      StackNextTransportOptions,
      | 'collectorUrl'
      | 'token'
      | 'maxQueueSize'
      | 'batchSize'
      | 'flushIntervalMs'
      | 'requestTimeoutMs'
      | 'heartbeatIntervalMs'
    >
  > &
    StackNextTransportOptions

  private readonly spanQueue: StackNextSpanInput[] = []
  private readonly errorQueue: StackNextErrorInput[] = []
  private readonly queryQueue: StackNextDatabaseQueryInput[] = []
  private exportedSpans = 0
  private droppedSpans = 0
  private exportedEvents = 0
  private droppedEvents = 0
  private lastError: string | null = null
  private timer: NodeJS.Timeout | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private flushing = false
  private heartbeatInFlight = false
  private retryDelayMs = 0
  private closed = false
  private stopping = false

  constructor(options: StackNextTransportOptions) {
    if (!isLoopbackUrl(options.collectorUrl)) {
      throw new Error('StackNext transport only accepts loopback collector URLs')
    }
    this.instanceId = options.instanceId ?? randomUUID()
    this.options = {
      ...options,
      maxQueueSize: options.maxQueueSize ?? DEFAULT_MAX_QUEUE,
      batchSize: options.batchSize ?? DEFAULT_BATCH_SIZE,
      flushIntervalMs: options.flushIntervalMs ?? 250,
      requestTimeoutMs: options.requestTimeoutMs ?? 2_000,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS,
    }
    this.scheduleFlush()
    this.heartbeatTimer = setInterval(() => {
      if (this.stopping || this.closed) return
      if (this.spanQueue.length + this.errorQueue.length + this.queryQueue.length === 0) {
        void this.sendHeartbeat()
      } else {
        void this.flush()
      }
    }, this.options.heartbeatIntervalMs)
    this.heartbeatTimer.unref?.()
  }

  enqueueSpan(span: StackNextSpanInput): void {
    if (this.closed) return
    this.spanQueue.push(span)
    this.trimQueues()
    this.scheduleFlush()
  }

  enqueueError(error: StackNextErrorInput): void {
    if (this.closed) return
    this.errorQueue.push(error)
    this.trimQueues()
    this.scheduleFlush()
  }

  enqueueDatabaseQuery(query: StackNextDatabaseQueryInput): void {
    if (this.closed) return
    this.queryQueue.push(query)
    this.trimQueues()
    this.scheduleFlush()
  }

  private trimQueues(): void {
    while (
      this.spanQueue.length + this.errorQueue.length + this.queryQueue.length >
      this.options.maxQueueSize
    ) {
      if (this.spanQueue.length > 0) {
        this.spanQueue.shift()
        this.droppedSpans += 1
        this.droppedEvents += 1
      } else if (this.errorQueue.length > 0) {
        this.errorQueue.shift()
        this.droppedEvents += 1
      } else {
        this.queryQueue.shift()
        this.droppedEvents += 1
      }
    }
  }

  private scheduleFlush(): void {
    if (this.closed || this.stopping || this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, Math.max(this.retryDelayMs, this.options.flushIntervalMs))
    this.timer.unref?.()
  }

  /** Sends a heartbeat immediately so the collector learns the provider mode. */
  announce(): void {
    if (this.closed || this.stopping) return
    void this.sendHeartbeat()
  }

  stopTimers(): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.timer = null
    this.heartbeatTimer = null
  }

  private buildBatch(): { envelope: StackNextIngestEnvelope; body: string } | null {
    let spanLimit = Math.min(500, this.options.batchSize)
    let errorLimit = Math.min(25, this.options.batchSize)
    let queryLimit = Math.min(100, this.options.batchSize)
    for (;;) {
      const spans = this.spanQueue.slice(0, spanLimit)
      const errors = this.errorQueue.slice(0, errorLimit)
      const queries = this.queryQueue.slice(0, queryLimit)
      if (spans.length === 0 && errors.length === 0 && queries.length === 0) {
        return null
      }
      const envelope: StackNextIngestEnvelope = {
        version: STACKNEXT_SCHEMA_VERSION,
        instance: {
          instanceId: this.instanceId,
          serviceName: this.options.serviceName ?? this.options.projectName ?? 'next-app',
          ...(this.options.projectName ? { projectName: this.options.projectName } : {}),
          ...(this.options.nextVersion ? { nextVersion: this.options.nextVersion } : {}),
          runtimeVersion: process.version,
          sdkVersion: STACKNEXT_SDK_VERSION,
          runtime: 'nodejs',
          ...(this.options.provider === 'external'
            ? { provider: 'external' as const }
            : {}),
        },
        spans,
        errors,
        databaseQueries: queries,
        diagnostics: this.diagnosticsSnapshot(),
      }
      const body = JSON.stringify(envelope)
      if (Buffer.byteLength(body, 'utf8') <= MAX_BATCH_BYTES) {
        return { envelope, body }
      }
      if (spanLimit <= 1 && errorLimit <= 1 && queryLimit <= 1) {
        // A single schema-valid item is already below the collector's hard
        // limit. Return it so the collector can surface a real error.
        return { envelope, body }
      }
      if (spanLimit >= errorLimit && spanLimit >= queryLimit && spanLimit > 1) {
        spanLimit = Math.max(1, Math.floor(spanLimit / 2))
      } else if (errorLimit >= queryLimit && errorLimit > 1) {
        errorLimit = Math.max(1, Math.floor(errorLimit / 2))
      } else if (queryLimit > 1) {
        queryLimit = Math.max(1, Math.floor(queryLimit / 2))
      } else if (spanLimit > 1) {
        spanLimit = Math.max(1, Math.floor(spanLimit / 2))
      } else {
        errorLimit = Math.max(1, Math.floor(errorLimit / 2))
      }
    }
  }

  private diagnosticsSnapshot(): StackNextExporterDiagnostics {
    return {
      instanceId: this.instanceId,
      exportedSpans: this.exportedSpans,
      droppedSpans: this.droppedSpans,
      exportedEvents: this.exportedEvents,
      droppedEvents: this.droppedEvents,
      ...(this.lastError ? { lastError: this.lastError } : {}),
      queueDepth:
        this.spanQueue.length + this.errorQueue.length + this.queryQueue.length,
      timestamp: Date.now(),
    }
  }

  async flush(): Promise<boolean> {
    if (this.flushing || this.closed) return false
    this.flushing = true
    try {
      const batch = this.buildBatch()
      if (!batch) {
        if (this.lastError) {
          // Send a heartbeat with diagnostics so the collector can clear or
          // surface the exporter failure after connectivity returns.
          const heartbeat = this.emptyEnvelope()
          await this.post(heartbeat)
        }
        return true
      }
      const accepted = await this.post(batch.envelope, batch.body)
      if (accepted === 'too-large') {
        const droppedSpans = this.removeSent(this.spanQueue, batch.envelope.spans)
        const droppedErrors = this.removeSent(this.errorQueue, batch.envelope.errors)
        const droppedQueries = this.removeSent(
          this.queryQueue,
          batch.envelope.databaseQueries,
        )
        this.droppedSpans += droppedSpans
        this.droppedEvents += droppedErrors + droppedQueries
        this.lastError = 'collector rejected the batch as too large (HTTP 413); dropped it'
        this.retryDelayMs = 0
        if (
          this.spanQueue.length + this.errorQueue.length + this.queryQueue.length > 0
        ) {
          this.scheduleFlush()
        }
        return true
      }
      if (accepted !== 'ok') {
        this.retryDelayMs = Math.min(10_000, Math.max(500, this.retryDelayMs * 2 || 500))
        return false
      }
      this.retryDelayMs = 0
      const removedSpans = this.removeSent(this.spanQueue, batch.envelope.spans)
      const removedErrors = this.removeSent(this.errorQueue, batch.envelope.errors)
      const removedQueries = this.removeSent(
        this.queryQueue,
        batch.envelope.databaseQueries,
      )
      this.exportedSpans += removedSpans
      this.exportedEvents += removedErrors + removedQueries
      if (
        this.spanQueue.length + this.errorQueue.length + this.queryQueue.length > 0
      ) {
        this.scheduleFlush()
      }
      return true
    } finally {
      this.flushing = false
    }
  }

  /**
   * Removes only the exact queue entries that were acknowledged. Queue trims
   * can run while a request is in flight, so count-based splicing could delete
   * newer telemetry that was never sent.
   */
  private removeSent<T>(queue: T[], sent: T[]): number {
    if (sent.length === 0) return 0
    const acknowledged = new Set(sent)
    let write = 0
    for (let read = 0; read < queue.length; read += 1) {
      const item = queue[read]
      if (item !== undefined && acknowledged.has(item)) continue
      queue[write] = item as T
      write += 1
    }
    const removed = queue.length - write
    queue.length = write
    return removed
  }

  private async sendHeartbeat(): Promise<void> {
    if (this.heartbeatInFlight || this.flushing || this.stopping || this.closed) return
    this.heartbeatInFlight = true
    try {
      await this.post(this.emptyEnvelope())
    } finally {
      this.heartbeatInFlight = false
    }
  }

  private emptyEnvelope(): StackNextIngestEnvelope {
    return {
      version: STACKNEXT_SCHEMA_VERSION,
      instance: {
        instanceId: this.instanceId,
        serviceName: this.options.serviceName ?? this.options.projectName ?? 'next-app',
        ...(this.options.projectName ? { projectName: this.options.projectName } : {}),
        ...(this.options.nextVersion ? { nextVersion: this.options.nextVersion } : {}),
        runtimeVersion: process.version,
        sdkVersion: STACKNEXT_SDK_VERSION,
        runtime: 'nodejs',
        ...(this.options.provider === 'external'
          ? { provider: 'external' as const }
          : {}),
      },
      spans: [],
      errors: [],
      databaseQueries: [],
      diagnostics: this.diagnosticsSnapshot(),
    }
  }

  private post(envelope: StackNextIngestEnvelope, body = JSON.stringify(envelope)): Promise<PostResult> {
    const url = new URL(INGEST_PATH, this.options.collectorUrl)
    const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest
    return new Promise((resolve) => {
      let settled = false
      const finish = (result: PostResult): void => {
        if (settled) return
        settled = true
        resolve(result)
      }
      const request = requestFn(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.options.token}`,
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
            'user-agent': `stacknext-sdk/${STACKNEXT_SDK_VERSION}`,
          },
          timeout: this.options.requestTimeoutMs,
        },
        (response) => {
          response.resume()
          response.on('end', () => {
            if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
              this.lastError = null
              finish('ok')
            } else if (response.statusCode === 413) {
              this.lastError = 'collector rejected the batch with HTTP 413'
              finish('too-large')
            } else {
              this.lastError = `collector responded with HTTP ${response.statusCode ?? 'unknown'}`
              finish('retry')
            }
          })
        },
      )
      request.on('timeout', () => {
        this.lastError = 'collector request timed out'
        request.destroy(new Error('timeout'))
      })
      request.on('error', (error) => {
        this.lastError = error.message.slice(0, 500)
        if (this.options.debug) {
          console.error(`[stacknext] export failed: ${this.lastError}`)
        }
        finish('retry')
      })
      request.end(body)
    })
  }

  async shutdown(timeoutMs = 2_000): Promise<void> {
    if (this.closed || this.stopping) return
    this.stopping = true
    const deadline = Date.now() + timeoutMs
    this.stopTimers()
    while (
      (this.spanQueue.length > 0 ||
        this.errorQueue.length > 0 ||
        this.queryQueue.length > 0) &&
      Date.now() < deadline
    ) {
      const flushed = await this.flush()
      if (!flushed) break
    }
    if (this.spanQueue.length + this.errorQueue.length + this.queryQueue.length > 0) {
      this.droppedSpans += this.spanQueue.length
      this.droppedEvents += this.errorQueue.length + this.queryQueue.length
      this.spanQueue.length = 0
      this.errorQueue.length = 0
      this.queryQueue.length = 0
    }
    this.closed = true
  }

  async forceFlush(): Promise<void> {
    const deadline = Date.now() + this.options.requestTimeoutMs
    while (
      (this.spanQueue.length > 0 ||
        this.errorQueue.length > 0 ||
        this.queryQueue.length > 0) &&
      Date.now() < deadline
    ) {
      const flushed = await this.flush()
      if (!flushed) break
    }
  }

  snapshot(): TransportSnapshot {
    return {
      queuedSpans: this.spanQueue.length,
      queuedErrors: this.errorQueue.length,
      queuedDatabaseQueries: this.queryQueue.length,
      exportedSpans: this.exportedSpans,
      exportedEvents: this.exportedEvents,
      droppedSpans: this.droppedSpans,
      droppedEvents: this.droppedEvents,
      lastError: this.lastError,
      instanceId: this.instanceId,
      provider: this.options.provider ?? 'stacknext',
    }
  }
}
