import { randomUUID } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import {
  NEXTSCOPE_SCHEMA_VERSION,
  NEXTSCOPE_SDK_VERSION,
  type NextScopeDatabaseQueryInput,
  type NextScopeErrorInput,
  type NextScopeExporterDiagnostics,
  type NextScopeIngestEnvelope,
  type NextScopeSpanInput,
} from './types.js'

const INGEST_PATH = '/__nextscope/v1/ingest'
const DEFAULT_MAX_QUEUE = 5_000
const DEFAULT_BATCH_SIZE = 250
const HEARTBEAT_INTERVAL_MS = 10_000

export interface NextScopeTransportOptions {
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
}

interface TransportGlobalState {
  __nextscopeTransport?: NextScopeTransport
  __nextscopeTransportKey?: string
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
): { options: NextScopeTransportOptions } | { error: string } {
  const collectorUrl = env.NEXTSCOPE_COLLECTOR_URL?.trim()
  const token = env.NEXTSCOPE_TOKEN?.trim()
  if (!collectorUrl && !token) {
    return { error: 'NEXTSCOPE_COLLECTOR_URL and NEXTSCOPE_TOKEN are not set' }
  }
  if (!collectorUrl) return { error: 'NEXTSCOPE_COLLECTOR_URL is not set' }
  if (!token) return { error: 'NEXTSCOPE_TOKEN is not set' }
  if (token.length < 16) return { error: 'NEXTSCOPE_TOKEN is too short' }
  if (!isLoopbackUrl(collectorUrl)) {
    return { error: 'NEXTSCOPE_COLLECTOR_URL must point to a loopback address' }
  }
  return {
    options: {
      collectorUrl,
      token,
      ...(env.NEXTSCOPE_PROJECT_NAME ? { projectName: env.NEXTSCOPE_PROJECT_NAME } : {}),
      ...(env.NEXTSCOPE_SERVICE_NAME ? { serviceName: env.NEXTSCOPE_SERVICE_NAME } : {}),
      ...(env.NEXTSCOPE_NEXT_VERSION ? { nextVersion: env.NEXTSCOPE_NEXT_VERSION } : {}),
      debug: env.NEXTSCOPE_DEBUG === '1',
    },
  }
}

/**
 * Returns the process-wide transport. Adapters and the OTel exporter share one
 * bounded queue so instrumentation cannot create multiple competing buffers.
 */
export function getNextScopeTransport(
  options?: NextScopeTransportOptions,
): NextScopeTransport | null {
  const resolved = options ?? (() => {
    const fromEnv = transportOptionsFromEnv()
    return 'options' in fromEnv ? fromEnv.options : null
  })()
  if (!resolved) return null
  const state = globalState()
  const key = `${resolved.collectorUrl}|${resolved.token}|${resolved.serviceName ?? ''}`
  if (state.__nextscopeTransport && state.__nextscopeTransportKey === key) {
    return state.__nextscopeTransport
  }
  if (state.__nextscopeTransport) {
    void state.__nextscopeTransport.shutdown(1_000)
  }
  const transport = new NextScopeTransport(resolved)
  state.__nextscopeTransport = transport
  state.__nextscopeTransportKey = key
  return transport
}

/** Test helper: detaches the global transport without exporting queued data. */
export function resetGlobalTransportForTests(): void {
  const state = globalState()
  state.__nextscopeTransport?.stopTimers()
  state.__nextscopeTransport = undefined
  state.__nextscopeTransportKey = undefined
}

/**
 * Bounded, asynchronous event forwarder. Application requests only enqueue
 * plain objects; network I/O always happens on timers and never blocks them.
 */
export class NextScopeTransport {
  readonly instanceId: string
  readonly options: Required<
    Pick<
      NextScopeTransportOptions,
      | 'collectorUrl'
      | 'token'
      | 'maxQueueSize'
      | 'batchSize'
      | 'flushIntervalMs'
      | 'requestTimeoutMs'
      | 'heartbeatIntervalMs'
    >
  > &
    NextScopeTransportOptions

  private readonly spanQueue: NextScopeSpanInput[] = []
  private readonly errorQueue: NextScopeErrorInput[] = []
  private readonly queryQueue: NextScopeDatabaseQueryInput[] = []
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

  constructor(options: NextScopeTransportOptions) {
    if (!isLoopbackUrl(options.collectorUrl)) {
      throw new Error('NextScope transport only accepts loopback collector URLs')
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

  enqueueSpan(span: NextScopeSpanInput): void {
    if (this.closed) return
    this.spanQueue.push(span)
    this.trimQueues()
    this.scheduleFlush()
  }

  enqueueError(error: NextScopeErrorInput): void {
    if (this.closed) return
    this.errorQueue.push(error)
    this.trimQueues()
    this.scheduleFlush()
  }

  enqueueDatabaseQuery(query: NextScopeDatabaseQueryInput): void {
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

  stopTimers(): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.timer = null
    this.heartbeatTimer = null
  }

  private buildBatch(): NextScopeIngestEnvelope | null {
    const spans = this.spanQueue.slice(0, Math.min(500, this.options.batchSize))
    const errors = this.errorQueue.slice(0, Math.min(25, this.options.batchSize))
    const queries = this.queryQueue.slice(0, Math.min(100, this.options.batchSize))
    if (spans.length === 0 && errors.length === 0 && queries.length === 0) {
      return null
    }
    return {
      version: NEXTSCOPE_SCHEMA_VERSION,
      instance: {
        instanceId: this.instanceId,
        serviceName: this.options.serviceName ?? this.options.projectName ?? 'next-app',
        ...(this.options.projectName ? { projectName: this.options.projectName } : {}),
        ...(this.options.nextVersion ? { nextVersion: this.options.nextVersion } : {}),
        sdkVersion: NEXTSCOPE_SDK_VERSION,
        runtime: 'nodejs',
      },
      spans,
      errors,
      databaseQueries: queries,
      diagnostics: this.diagnosticsSnapshot(),
    }
  }

  private diagnosticsSnapshot(): NextScopeExporterDiagnostics {
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
      const accepted = await this.post(batch)
      if (!accepted) {
        this.retryDelayMs = Math.min(10_000, Math.max(500, this.retryDelayMs * 2 || 500))
        return false
      }
      this.retryDelayMs = 0
      this.spanQueue.splice(0, batch.spans.length)
      this.errorQueue.splice(0, batch.errors.length)
      this.queryQueue.splice(0, batch.databaseQueries.length)
      this.exportedSpans += batch.spans.length
      this.exportedEvents += batch.errors.length + batch.databaseQueries.length
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

  private async sendHeartbeat(): Promise<void> {
    if (this.heartbeatInFlight || this.flushing || this.stopping || this.closed) return
    this.heartbeatInFlight = true
    try {
      await this.post(this.emptyEnvelope())
    } finally {
      this.heartbeatInFlight = false
    }
  }

  private emptyEnvelope(): NextScopeIngestEnvelope {
    return {
      version: NEXTSCOPE_SCHEMA_VERSION,
      instance: {
        instanceId: this.instanceId,
        serviceName: this.options.serviceName ?? this.options.projectName ?? 'next-app',
        ...(this.options.projectName ? { projectName: this.options.projectName } : {}),
        ...(this.options.nextVersion ? { nextVersion: this.options.nextVersion } : {}),
        sdkVersion: NEXTSCOPE_SDK_VERSION,
        runtime: 'nodejs',
      },
      spans: [],
      errors: [],
      databaseQueries: [],
      diagnostics: this.diagnosticsSnapshot(),
    }
  }

  private post(envelope: NextScopeIngestEnvelope): Promise<boolean> {
    const url = new URL(INGEST_PATH, this.options.collectorUrl)
    const body = JSON.stringify(envelope)
    const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest
    return new Promise((resolve) => {
      let settled = false
      const finish = (success: boolean): void => {
        if (settled) return
        settled = true
        resolve(success)
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
            'user-agent': `nextscope-sdk/${NEXTSCOPE_SDK_VERSION}`,
          },
          timeout: this.options.requestTimeoutMs,
        },
        (response) => {
          response.resume()
          response.on('end', () => {
            if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
              this.lastError = null
              finish(true)
            } else {
              this.lastError = `collector responded with HTTP ${response.statusCode ?? 'unknown'}`
              finish(false)
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
          console.error(`[nextscope] export failed: ${this.lastError}`)
        }
        finish(false)
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
    }
  }
}
