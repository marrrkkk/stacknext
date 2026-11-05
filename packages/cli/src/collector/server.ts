import { createReadStream } from 'node:fs'
import { access, readFile, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import path from 'node:path'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import {
  DIAGNOSTIC_CATEGORIES,
  DIAGNOSTIC_RULE_IDS,
  DIAGNOSTIC_SEVERITIES,
  DIAGNOSTIC_STATUSES,
  TelemetryStore,
  computeCoverage,
  diagnosticReference,
  ingestEnvelopeSchema,
  nextOtelVerboseStatus,
  type ApiErrorResponse,
  type ConnectionInfo,
  type CoverageReport,
  type DiagnosticCategory,
  type DiagnosticFilters,
  type DiagnosticReport,
  type DiagnosticRuleId,
  type DiagnosticSeverity,
  type DiagnosticSnapshot,
  type DiagnosticStatus,
  type ErrorListResponse,
  type ErrorDetailResponse,
  type ExportResponse,
  type HealthResponse,
  type NextOtelVerboseStatus,
  type StackNextConfig,
  type StackNextIngestEnvelope,
  type StackNextInstance,
  type OverviewResponse,
  type PageResult,
  type RequestFilters,
  type DatabaseFilters,
  type ErrorFilters,
  type DatabaseQueryListItem,
  type TraceDetail,
  type TraceListResult,
  type StackNextExporterDiagnostics,
  type SnapshotDetailResponse,
  type SnapshotListResponse,
  type SnapshotPayload,
  type SnapshotSummary,
} from '@stacknext/core'
import {
  SnapshotStorageError,
  createSnapshotPayload,
  createSnapshotView,
  importSnapshot,
  listSnapshots,
  loadSnapshotPayload,
  removeSnapshot,
  rotateAutomaticSnapshots,
  saveSnapshot,
  snapshotExport,
  snapshotPath,
  snapshotSummary,
  isSnapshotId,
} from '@stacknext/core/snapshots'
import {
  diagnosticOverview as buildDiagnosticOverview,
  generateDiagnosticReport,
  getDiagnosticDetail,
  listDiagnosticFindings,
} from '@stacknext/diagnostics'
import {
  completeRunRequestSchema,
  createRunRequestSchema,
  listAllBaselines,
  listAllComparisons,
  listAllRuns,
  loadBaseline,
  loadComparison,
  loadRun,
  RegressionStorageError,
  submitSampleRequestSchema,
  type BaselineSummary,
  type ComparisonSummaryItem,
  type RunSummary,
  type StoredRecords,
} from '@stacknext/regression'
import { TestRunRegistry } from './test-runs.js'
import { CLI_VERSION } from '../version.js'

const VERSION = CLI_VERSION
const MAX_BODY_BYTES = 2 * 1024 * 1024
const SESSION_COOKIE = 'stacknext_session'
const SESSION_TTL_MS = 24 * 60 * 60 * 1_000
const CONNECTION_STALE_MS = 20_000
const CONNECTION_RETENTION_MS = 10 * 60 * 1_000
const MAX_SSE_CLIENTS = 50
const SSE_HEARTBEAT_MS = 15_000
const MAX_SESSIONS = 100
const AUTO_ERROR_COOLDOWN_MS = 60_000
const MAX_SNAPSHOT_BODY_BYTES = 64 * 1024
const MAX_SNAPSHOT_CACHE_ENTRIES = 3

interface SnapshotCacheEntry {
  mtimeMs: number
  bytes: number
  payload: SnapshotPayload
  store: TelemetryStore
}

export interface StartCollectorOptions {
  port: number
  token: string
  projectName: string
  config: StackNextConfig
  dashboardDir: string | null
  version?: string
  host?: string
  log?: (message: string) => void
  autoPort?: boolean
  sseHeartbeatMs?: number
  /** Project whose saved runs, baselines and comparisons are served read-only. */
  projectDir?: string
  /** Overrides environment/config inference, mainly for tests and `stacknext dev`. */
  nextOtelVerbose?: NextOtelVerboseStatus
}

export interface CollectorHandle {
  port: number
  url: string
  token: string
  store: TelemetryStore
  health: () => HealthResponse
  /** Saves the current sample before shutdown when snapshots.autoOnExit is on. */
  saveSnapshotOnExit: () => Promise<SnapshotSummary | null>
  close: () => Promise<void>
}

interface ConnectionRecord {
  info: Omit<ConnectionInfo, 'connected'>
  lastSeen: number
}

interface SseClient {
  res: ServerResponse
}

interface ParsedCookies {
  [key: string]: string
}

function securityHeaders(): Record<string, string> {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'cross-origin-resource-policy': 'same-origin',
  }
}

function dashboardCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  if (response.headersSent) return
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    ...securityHeaders(),
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    ...extraHeaders,
  })
  response.end(body)
}

function sendError(
  response: ServerResponse,
  status: number,
  message: string,
  issues?: string[],
): void {
  const payload: ApiErrorResponse = issues ? { error: message, issues } : { error: message }
  sendJson(response, status, payload)
}

function parseCookies(header: string | undefined): ParsedCookies {
  if (!header) return {}
  const cookies: ParsedCookies = {}
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    const key = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (key) cookies[key] = decodeURIComponent(value)
  }
  return cookies
}

function hashToken(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function tokensEqual(candidate: string, expected: string): boolean {
  const left = hashToken(candidate)
  const right = hashToken(expected)
  return timingSafeEqual(left, right)
}

function hostAllowed(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false
  let hostname: string
  try {
    hostname = new URL(`http://${hostHeader}`).hostname
  } catch {
    return false
  }
  return (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '[::1]' ||
    hostname === '::1'
  )
}

function originAllowed(origin: string, port: number): boolean {
  try {
    const url = new URL(origin)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      (url.hostname === '127.0.0.1' ||
        url.hostname === 'localhost' ||
        url.hostname === '[::1]' ||
        url.hostname === '::1') &&
      (url.port === '' || url.port === String(port))
    )
  } catch {
    return false
  }
}

function queryNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function queryBoolean(value: string | null): boolean | undefined {
  if (value === null) return undefined
  return value === '1' || value === 'true'
}

function filtersFromSearch(searchParams: URLSearchParams): RequestFilters {
  const sort = searchParams.get('sort')
  return {
    ...(queryNumber(searchParams.get('limit')) !== undefined
      ? { limit: queryNumber(searchParams.get('limit')) }
      : {}),
    ...(queryNumber(searchParams.get('offset')) !== undefined
      ? { offset: queryNumber(searchParams.get('offset')) }
      : {}),
    ...(searchParams.get('q') ? { q: searchParams.get('q') ?? undefined } : {}),
    ...(searchParams.get('method') ? { method: searchParams.get('method') ?? undefined } : {}),
    ...(searchParams.get('status') ? { status: searchParams.get('status') ?? undefined } : {}),
    ...(queryBoolean(searchParams.get('slow')) !== undefined
      ? { slow: queryBoolean(searchParams.get('slow')) }
      : {}),
    ...(queryNumber(searchParams.get('minDuration')) !== undefined
      ? { minDuration: queryNumber(searchParams.get('minDuration')) }
      : {}),
    ...(queryBoolean(searchParams.get('httpOnly')) !== undefined
      ? { httpOnly: queryBoolean(searchParams.get('httpOnly')) }
      : {}),
    ...(sort === 'recent' || sort === 'oldest' || sort === 'slowest' ? { sort } : {}),
  }
}

function databaseFiltersFromSearch(searchParams: URLSearchParams): DatabaseFilters {
  return {
    ...(queryNumber(searchParams.get('limit')) !== undefined
      ? { limit: queryNumber(searchParams.get('limit')) }
      : {}),
    ...(queryNumber(searchParams.get('offset')) !== undefined
      ? { offset: queryNumber(searchParams.get('offset')) }
      : {}),
    ...(searchParams.get('q') ? { q: searchParams.get('q') ?? undefined } : {}),
    ...(queryNumber(searchParams.get('minDuration')) !== undefined
      ? { minDuration: queryNumber(searchParams.get('minDuration')) }
      : {}),
    ...(searchParams.get('traceId') ? { traceId: searchParams.get('traceId') ?? undefined } : {}),
    ...(searchParams.get('databaseSystem')
      ? { databaseSystem: searchParams.get('databaseSystem') ?? undefined }
      : {}),
  }
}

function errorFiltersFromSearch(searchParams: URLSearchParams): ErrorFilters {
  return {
    ...(queryNumber(searchParams.get('limit')) !== undefined
      ? { limit: queryNumber(searchParams.get('limit')) }
      : {}),
    ...(queryNumber(searchParams.get('offset')) !== undefined
      ? { offset: queryNumber(searchParams.get('offset')) }
      : {}),
    ...(searchParams.get('q') ? { q: searchParams.get('q') ?? undefined } : {}),
    ...(searchParams.get('route') ? { route: searchParams.get('route') ?? undefined } : {}),
    ...(searchParams.get('name') ? { name: searchParams.get('name') ?? undefined } : {}),
  }
}

function oneOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | undefined {
  if (!value) return undefined
  return allowed.includes(value as T) ? (value as T) : undefined
}

function diagnosticFiltersFromSearch(searchParams: URLSearchParams): {
  filters: DiagnosticFilters
  error?: string
} {
  const categoryValue = searchParams.get('category')
  const severityValue = searchParams.get('severity')
  const statusValue = searchParams.get('status')
  const ruleValue = searchParams.get('ruleId')
  const category = oneOf<DiagnosticCategory>(categoryValue, DIAGNOSTIC_CATEGORIES)
  const severity = oneOf<DiagnosticSeverity>(severityValue, DIAGNOSTIC_SEVERITIES)
  const status = oneOf<DiagnosticStatus>(statusValue, DIAGNOSTIC_STATUSES)
  const ruleId = oneOf<DiagnosticRuleId>(ruleValue, DIAGNOSTIC_RULE_IDS)
  if (categoryValue && !category) return { filters: {}, error: 'Invalid diagnostic category' }
  if (severityValue && !severity) return { filters: {}, error: 'Invalid diagnostic severity' }
  if (statusValue && !status) return { filters: {}, error: 'Invalid diagnostic status' }
  if (ruleValue && !ruleId) return { filters: {}, error: 'Invalid diagnostic rule id' }
  return {
    filters: {
      ...(queryNumber(searchParams.get('limit')) !== undefined
        ? { limit: queryNumber(searchParams.get('limit')) }
        : {}),
      ...(queryNumber(searchParams.get('offset')) !== undefined
        ? { offset: queryNumber(searchParams.get('offset')) }
        : {}),
      ...(category ? { category } : {}),
      ...(severity ? { severity } : {}),
      ...(status ? { status } : {}),
      ...(ruleId ? { ruleId } : {}),
      ...(searchParams.get('route') ? { route: searchParams.get('route') ?? undefined } : {}),
      ...(searchParams.get('traceId')
        ? { traceId: searchParams.get('traceId') ?? undefined }
        : {}),
      ...(searchParams.get('q') ? { q: searchParams.get('q') ?? undefined } : {}),
      ...(queryNumber(searchParams.get('since')) !== undefined
        ? { since: queryNumber(searchParams.get('since')) }
        : {}),
      ...(queryNumber(searchParams.get('until')) !== undefined
        ? { until: queryNumber(searchParams.get('until')) }
        : {}),
    },
  }
}

async function readBody(
  request: IncomingMessage,
  limit: number,
): Promise<{ ok: true; body: string } | { ok: false; tooLarge: boolean }> {
  const contentLength = Number(request.headers['content-length'] ?? '0')
  if (Number.isFinite(contentLength) && contentLength > limit) {
    request.resume()
    return { ok: false, tooLarge: true }
  }
  const chunks: Buffer[] = []
  let total = 0
  let tooLarge = false
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > limit) {
      tooLarge = true
      continue
    }
    chunks.push(buffer)
  }
  if (tooLarge) return { ok: false, tooLarge: true }
  return { ok: true, body: Buffer.concat(chunks).toString('utf8') }
}

function contentTypeFor(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.webmanifest':
      return 'application/manifest+json'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.ico':
      return 'image/x-icon'
    case '.webp':
      return 'image/webp'
    case '.woff2':
      return 'font/woff2'
    case '.txt':
      return 'text/plain; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

export async function resolveDashboardDir(): Promise<string> {
  const candidates: string[] = []
  if (process.env.STACKNEXT_DASHBOARD_DIR) {
    candidates.push(path.resolve(process.env.STACKNEXT_DASHBOARD_DIR))
  }
  try {
    const require = createRequire(import.meta.url)
    const packageJsonPath = require.resolve('@stacknext/dashboard/package.json')
    candidates.push(path.join(path.dirname(packageJsonPath), 'dist'))
  } catch {
    // Workspace fallback below.
  }
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  candidates.push(path.resolve(moduleDir, '../../../dashboard/dist'))
  candidates.push(path.resolve(moduleDir, '../../dashboard/dist'))
  candidates.push(path.resolve(process.cwd(), 'packages/dashboard/dist'))
  for (const candidate of candidates) {
    try {
      await access(path.join(candidate, 'index.html'))
      return candidate
    } catch {
      // Keep searching.
    }
  }
  throw new Error(
    'Dashboard build not found. Run "pnpm build" (or "pnpm --filter @stacknext/dashboard build") before starting StackNext.',
  )
}

function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException): void => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = (): void => {
      server.off('error', onError)
      const address = server.address()
      if (typeof address === 'object' && address !== null) resolve(address.port)
      else reject(new Error('Collector did not bind a TCP port'))
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}

export async function startCollector(options: StartCollectorOptions): Promise<CollectorHandle> {
  const host = options.host ?? '127.0.0.1'
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('StackNext collector may only bind to a loopback address')
  }
  if (options.token.length < 16) {
    throw new Error('Collector token must be at least 16 characters')
  }
  const log = options.log ?? (() => undefined)
  const store = new TelemetryStore({
    maxSpans: options.config.collector.maxSpans,
    retentionMs: options.config.collector.retentionMs,
  })
  const verboseStatus =
    options.nextOtelVerbose ??
    nextOtelVerboseStatus(
      options.config.instrumentation.verbose,
      process.env.NEXT_OTEL_VERBOSE,
    )
  const startedAt = Date.now()
  const sessions = new Map<string, number>()
  const connections = new Map<string, ConnectionRecord>()
  const sseClients = new Set<SseClient>()
  const serverStats = {
    rejectedRequests: 0,
    droppedPayload: 0,
    droppedMalformed: 0,
  }
  let sequence = 0
  let port = options.port
  let dashboardUrl = `http://${host}:${port}`
  let diagnosticCache: { revision: number; report: DiagnosticReport } | null = null

  const getConnections = (now: number): ConnectionInfo[] => {
    const output: ConnectionInfo[] = []
    for (const [instanceId, record] of connections) {
      if (now - record.lastSeen > CONNECTION_RETENTION_MS) {
        connections.delete(instanceId)
        continue
      }
      output.push({
        ...record.info,
        connected: now - record.lastSeen <= CONNECTION_STALE_MS,
      })
    }
    return output.sort((a, b) => b.lastSeen - a.lastSeen)
  }

  const getHealth = (): HealthResponse => {
    const now = Date.now()
    const summary = store.summary(options.config.slowRequestMs)
    const storeStats = store.getStats()
    const connectionList = getConnections(now)
    const diagnostics = connectionList
      .map((connection) => connection.diagnostics)
      .filter((entry): entry is StackNextExporterDiagnostics => entry !== undefined)
    const lastError =
      diagnostics
        .map((entry) => entry.lastError)
        .filter((entry): entry is string => Boolean(entry))
        .sort()
        .at(-1) ?? null
    return {
      status: 'ok',
      name: 'stacknext',
      version: options.version ?? VERSION,
      projectName: options.projectName,
      dashboardUrl,
      startedAt,
      uptimeMs: now - startedAt,
      time: now,
      connected: connectionList.some((connection) => connection.connected),
      connections: connectionList,
      instrumentation: {
        nextOtelVerbose: verboseStatus,
      },
      counts: {
        requests: summary.totalRequests,
        failedRequests: summary.failedRequests,
        slowRequests: summary.slowRequests,
        spans: summary.spanCount,
        errors: summary.errorCount,
        databaseQueries: summary.databaseQueryCount,
      },
      sample: {
        firstEventTime: summary.firstEventTime,
        lastEventTime: summary.lastEventTime,
        retentionMs: store.retentionMs,
      },
      store: storeStats,
      server: {
        ...serverStats,
        sseClients: sseClients.size,
      },
      exporter: {
        droppedSpans: diagnostics.reduce((sum, entry) => sum + entry.droppedSpans, 0),
        droppedEvents: diagnostics.reduce((sum, entry) => sum + entry.droppedEvents, 0),
        lastError,
      },
      config: options.config,
    }
  }

  const getCoverage = (): CoverageReport => {
    const now = Date.now()
    return computeCoverage({
      projectName: options.projectName,
      collectorVersion: options.version ?? VERSION,
      now,
      config: options.config,
      connections: getConnections(now),
      verbose: verboseStatus,
      evidence: store.getCoverageEvidence(),
    })
  }

  const getDiagnosticState = (): {
    report: DiagnosticReport
    snapshot: DiagnosticSnapshot
  } => {
    const now = Date.now()
    const snapshot = store.getDiagnosticSnapshot(options.config.slowRequestMs)
    const connectionList = getConnections(now)
    if (!diagnosticCache || diagnosticCache.revision !== snapshot.revision) {
      diagnosticCache = {
        revision: snapshot.revision,
        report: generateDiagnosticReport(snapshot, {
          projectName: options.projectName,
          collectorVersion: options.version ?? VERSION,
          config: options.config.diagnostics,
          slowRequestMs: options.config.slowRequestMs,
          generatedAt: now,
          connected: connectionList.some((connection) => connection.connected),
          connectedInstances: connectionList.filter((connection) => connection.connected).length,
        }),
      }
    }
    const cached = diagnosticCache.report
    return {
      snapshot,
      report: {
        ...cached,
        generatedAt: now,
        sample: {
          ...cached.sample,
          connected: connectionList.some((connection) => connection.connected),
          connectedInstances: connectionList.filter((connection) => connection.connected).length,
        },
      },
    }
  }

  const getDiagnosticReport = (): DiagnosticReport => getDiagnosticState().report

  const snapshotCache = new Map<string, SnapshotCacheEntry>()
  let autoSaveQueue: Promise<void> = Promise.resolve()
  let lastAutoErrorSnapshotAt = 0

  const projectDir = options.projectDir
  const snapshotMaxBytes = options.config.snapshots.maxBytes

  const snapshotHasData = (payload: SnapshotPayload): boolean =>
    payload.spans.length > 0 ||
    payload.errors.length > 0 ||
    payload.databaseQueries.length > 0

  const saveCurrentSnapshot = async (
    source: SnapshotPayload['source'],
    saveOptions: { label?: string; allowEmpty?: boolean } = {},
  ): Promise<SnapshotSummary | null> => {
    if (!projectDir) {
      throw new SnapshotStorageError(
        'invalid',
        'Snapshot storage needs a project directory. Start StackNext with "stacknext dev" from the app directory.',
      )
    }
    const payload = createSnapshotPayload({
      store,
      source,
      projectName: options.projectName,
      collectorVersion: options.version ?? VERSION,
      config: options.config,
      slowRequestMs: options.config.slowRequestMs,
      ...(saveOptions.label ? { label: saveOptions.label } : {}),
    })
    if (!saveOptions.allowEmpty && !snapshotHasData(payload)) return null
    const saved = await saveSnapshot(projectDir, payload, { maxBytes: snapshotMaxBytes })
    if (source === 'exit' || source === 'error') {
      await rotateAutomaticSnapshots(projectDir, options.config.snapshots.autoKeep).catch(
        (error) => {
          log(
            `could not rotate automatic snapshots: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        },
      )
    }
    return saved
  }

  const enqueueAutoErrorSnapshot = (): void => {
    if (!options.config.snapshots.autoOnError) return
    const now = Date.now()
    if (now - lastAutoErrorSnapshotAt < AUTO_ERROR_COOLDOWN_MS) return
    lastAutoErrorSnapshotAt = now
    autoSaveQueue = autoSaveQueue
      .then(async () => {
        const saved = await saveCurrentSnapshot('error')
        if (saved) log(`automatic error snapshot saved (${saved.id})`)
      })
      .catch((error) => {
        log(
          `automatic error snapshot failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      })
  }

  const snapshotView = async (id: string): Promise<SnapshotCacheEntry> => {
    if (!projectDir) {
      throw new SnapshotStorageError('not-found', 'Snapshot storage is not available.')
    }
    if (!isSnapshotId(id)) {
      throw new SnapshotStorageError('invalid', `Invalid snapshot id "${id}".`)
    }
    const file = snapshotPath(projectDir, id)
    let info
    try {
      info = await stat(file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new SnapshotStorageError('not-found', 'Snapshot not found.')
      }
      throw error
    }
    const cached = snapshotCache.get(id)
    if (cached && cached.mtimeMs === info.mtimeMs) {
      snapshotCache.delete(id)
      snapshotCache.set(id, cached)
      return cached
    }
    const payload = await loadSnapshotPayload(projectDir, id, { maxBytes: snapshotMaxBytes })
    const entry: SnapshotCacheEntry = {
      mtimeMs: info.mtimeMs,
      bytes: info.size,
      payload,
      store: createSnapshotView(payload),
    }
    snapshotCache.set(id, entry)
    while (snapshotCache.size > MAX_SNAPSHOT_CACHE_ENTRIES) {
      const oldest = snapshotCache.keys().next().value
      if (oldest === undefined) break
      snapshotCache.delete(oldest)
    }
    return entry
  }

  const sendSnapshotError = (response: ServerResponse, error: unknown): void => {
    if (error instanceof SnapshotStorageError) {
      if (error.code === 'not-found') {
        sendError(response, 404, error.message)
      } else if (error.code === 'too-large') {
        sendError(response, 413, error.message)
      } else if (error.code === 'exists') {
        sendError(response, 409, error.message)
      } else {
        sendError(response, 422, error.message)
      }
      return
    }
    log(
      `snapshot operation failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    sendError(response, 500, 'Snapshot operation failed')
  }

  const handleSnapshotWrite = async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<void> => {
    if (!isReadAuthorized(request)) {
      serverStats.rejectedRequests += 1
      sendError(response, 401, 'Unauthorized')
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/snapshots/import') {
      if (!projectDir) {
        sendSnapshotError(
          response,
          new SnapshotStorageError(
            'invalid',
            'Snapshot storage needs a project directory. Start StackNext with "stacknext dev" from the app directory.',
          ),
        )
        return
      }
      const contentType = String(request.headers['content-type'] ?? '')
      if (!contentType.toLowerCase().includes('application/json')) {
        sendError(response, 415, 'Content-Type must be application/json')
        return
      }
      const body = await readBody(request, snapshotMaxBytes)
      if (!body.ok) {
        sendError(response, 413, `Snapshot import exceeds ${snapshotMaxBytes} bytes.`)
        return
      }
      try {
        const snapshot = await importSnapshot(projectDir, body.body, {
          maxBytes: snapshotMaxBytes,
        })
        sendJson(response, 201, { snapshot })
      } catch (error) {
        sendSnapshotError(response, error)
      }
      return
    }
    if (request.method === 'DELETE') {
      const id = decodeURIComponent(url.pathname.slice('/api/snapshots/'.length))
      if (!isSnapshotId(id)) {
        sendError(response, 400, 'Invalid snapshot id')
        return
      }
      if (!projectDir) {
        sendError(response, 404, 'Snapshot not found')
        return
      }
      try {
        const removed = await removeSnapshot(projectDir, id)
        snapshotCache.delete(id)
        if (!removed) {
          sendError(response, 404, 'Snapshot not found')
          return
        }
        sendJson(response, 200, { deleted: true, id })
      } catch (error) {
        sendSnapshotError(response, error)
      }
      return
    }

    const contentType = String(request.headers['content-type'] ?? '')
    if (!contentType.toLowerCase().includes('application/json')) {
      sendError(response, 415, 'Content-Type must be application/json')
      return
    }
    const body = await readBody(request, MAX_SNAPSHOT_BODY_BYTES)
    if (!body.ok) {
      sendError(response, 413, `Snapshot request exceeds ${MAX_SNAPSHOT_BODY_BYTES} bytes`)
      return
    }
    let label: string | undefined
    if (body.body.trim() !== '') {
      let parsed: unknown
      try {
        parsed = JSON.parse(body.body)
      } catch {
        sendError(response, 400, 'Malformed JSON payload')
        return
      }
      if (parsed && typeof parsed === 'object' && 'label' in parsed) {
        const value = (parsed as { label?: unknown }).label
        if (value !== undefined && value !== null) {
          if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) {
            sendError(response, 422, 'Snapshot label must be 1-200 characters')
            return
          }
          label = value.trim()
        }
      }
    }
    try {
      const saved = await saveCurrentSnapshot('manual', {
        ...(label ? { label } : {}),
      })
      if (!saved) {
        sendError(response, 409, 'No telemetry in the current sample to save')
        return
      }
      sendJson(response, 201, { snapshot: saved })
    } catch (error) {
      sendSnapshotError(response, error)
    }
  }

  const handleSnapshotApi = async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    id: string,
    suffix: string,
  ): Promise<void> => {
    try {
      if (suffix === '' || suffix === '/') {
        const entry = await snapshotView(id)
        const detail: SnapshotDetailResponse = {
          snapshot: snapshotSummary(entry.payload, entry.bytes),
          config: entry.payload.config,
          limitations: entry.payload.limitations,
          traces: entry.store.listTraces(
            { limit: 20 },
            options.config.slowRequestMs,
          ).items,
          errors: entry.store.listErrors({ limit: 20 }).items,
          databaseQueries: entry.store.listDatabaseQueries({ limit: 20 }).items,
        }
        sendJson(response, 200, detail)
        return
      }
      if (suffix === '/export') {
        const entry = await snapshotView(id)
        sendJson(response, 200, snapshotExport(entry.payload), {
          'content-disposition': `attachment; filename="stacknext-${entry.payload.projectName.replace(/[^a-z0-9_-]+/gi, '-')}-${id}.json"`,
        })
        return
      }
      if (suffix === '/traces') {
        const entry = await snapshotView(id)
        sendJson(
          response,
          200,
          entry.store.listTraces(
            filtersFromSearch(url.searchParams),
            options.config.slowRequestMs,
          ),
        )
        return
      }
      if (suffix.startsWith('/traces/')) {
        const traceId = decodeURIComponent(suffix.slice('/traces/'.length))
        if (!/^[0-9a-f]{32}$/i.test(traceId)) {
          sendError(response, 400, 'Invalid trace id')
          return
        }
        const entry = await snapshotView(id)
        const detail = entry.store.getTrace(traceId, options.config.slowRequestMs)
        if (!detail) {
          sendError(response, 404, 'Trace not found in snapshot')
          return
        }
        sendJson(response, 200, detail)
        return
      }
      if (suffix === '/errors') {
        const entry = await snapshotView(id)
        const result = entry.store.listErrors(errorFiltersFromSearch(url.searchParams))
        const payload: ErrorListResponse = {
          items: result.items,
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          groups: result.groups,
        }
        sendJson(response, 200, payload)
        return
      }
      if (suffix.startsWith('/errors/')) {
        const errorId = decodeURIComponent(suffix.slice('/errors/'.length))
        if (!errorId || errorId.length > 128) {
          sendError(response, 400, 'Invalid error id')
          return
        }
        const entry = await snapshotView(id)
        const detail = entry.store.getError(errorId, options.config.slowRequestMs)
        if (!detail) {
          sendError(response, 404, 'Error not found in snapshot')
          return
        }
        const payload: ErrorDetailResponse = detail
        sendJson(response, 200, payload)
        return
      }
      if (suffix === '/database') {
        const entry = await snapshotView(id)
        const result: PageResult<DatabaseQueryListItem> =
          entry.store.listDatabaseQueries(databaseFiltersFromSearch(url.searchParams))
        sendJson(response, 200, result)
        return
      }
      sendError(response, 404, 'Not found')
    } catch (error) {
      sendSnapshotError(response, error)
    }
  }

  const testRuns = new TestRunRegistry({
    slowRequestMs: options.config.slowRequestMs,
    isConnected: () => getConnections(Date.now()).some((connection) => connection.connected),
    getDiagnosticReport,
    lookupTrace: (traceId) =>
      store.getTrace(traceId, options.config.slowRequestMs) ?? null,
  })

  const traceWithDiagnostics = (detail: TraceDetail): TraceDetail => {
    const references = listDiagnosticFindings(getDiagnosticReport(), {
      traceId: detail.traceId,
      limit: 200,
    }).items.map(diagnosticReference)
    return { ...detail, diagnostics: references }
  }

  const recordConnection = (
    instance: StackNextInstance,
    diagnostics: StackNextExporterDiagnostics | undefined,
    now: number,
  ): void => {
    const existing = connections.get(instance.instanceId)
    connections.set(instance.instanceId, {
      info: {
        instanceId: instance.instanceId,
        serviceName: instance.serviceName,
        ...(instance.projectName ?? options.projectName
          ? { projectName: instance.projectName ?? options.projectName }
          : {}),
        ...(instance.nextVersion ? { nextVersion: instance.nextVersion } : {}),
        ...(instance.runtimeVersion ? { runtimeVersion: instance.runtimeVersion } : {}),
        sdkVersion: instance.sdkVersion,
        lastSeen: now,
        ...(diagnostics ? { diagnostics } : existing?.info.diagnostics
          ? { diagnostics: existing.info.diagnostics }
          : {}),
      },
      lastSeen: now,
    })
    if (connections.size > 20) {
      const oldest = [...connections.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen)[0]
      if (oldest) connections.delete(oldest[0])
    }
  }

  const broadcast = (event: string, payload: unknown): void => {
    const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
    for (const client of sseClients) {
      try {
        client.res.write(message)
      } catch {
        sseClients.delete(client)
      }
    }
  }

  const heartbeatInterval = setInterval(() => {
    for (const client of sseClients) {
      try {
        client.res.write(': heartbeat\n\n')
      } catch {
        sseClients.delete(client)
      }
    }
  }, options.sseHeartbeatMs ?? SSE_HEARTBEAT_MS)
  heartbeatInterval.unref()

  const sessionForRequest = (request: IncomingMessage, response: ServerResponse): string => {
    const cookies = parseCookies(request.headers.cookie)
    const existing = cookies[SESSION_COOKIE]
    const now = Date.now()
    if (existing && sessions.has(existing)) {
      const createdAt = sessions.get(existing) ?? 0
      if (now - createdAt <= SESSION_TTL_MS) return existing
      sessions.delete(existing)
    }
    const session = randomBytes(32).toString('base64url')
    sessions.set(session, now)
    if (sessions.size > MAX_SESSIONS) {
      const oldest = [...sessions.entries()].sort((a, b) => a[1] - b[1])[0]
      if (oldest) sessions.delete(oldest[0])
    }
    response.setHeader(
      'set-cookie',
      `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
    )
    return session
  }

  const hasSession = (request: IncomingMessage): boolean => {
    const cookies = parseCookies(request.headers.cookie)
    const session = cookies[SESSION_COOKIE]
    if (!session) return false
    const createdAt = sessions.get(session)
    return createdAt !== undefined && Date.now() - createdAt <= SESSION_TTL_MS
  }

  const isReadAuthorized = (request: IncomingMessage): boolean => {
    const authorization = request.headers.authorization
    if (authorization?.startsWith('Bearer ')) {
      return tokensEqual(authorization.slice('Bearer '.length), options.token)
    }
    return hasSession(request)
  }

  const isIngestAuthorized = (request: IncomingMessage): boolean => {
    const authorization = request.headers.authorization
    if (!authorization?.startsWith('Bearer ')) return false
    return tokensEqual(authorization.slice('Bearer '.length), options.token)
  }

  const serveIndex = async (response: ServerResponse, cookies: boolean): Promise<void> => {
    if (!options.dashboardDir) {
      const html =
        '<!doctype html><html><head><meta charset="utf-8"><title>StackNext</title></head><body style="font-family:system-ui;background:#0b0d10;color:#e6e8eb;padding:3rem"><h1>Dashboard build not found</h1><p>Run <code>pnpm build</code>, then restart <code>stacknext dev</code>.</p></body></html>'
      response.writeHead(503, {
        ...securityHeaders(),
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': dashboardCsp(),
      })
      response.end(html)
      return
    }
    const file = path.join(options.dashboardDir, 'index.html')
    const html = await readFile(file)
    if (cookies) {
      // Set-Cookie is attached by sessionForRequest before this function runs.
      response.setHeader('set-cookie', response.getHeader('set-cookie') ?? [])
    }
    response.writeHead(200, {
      ...securityHeaders(),
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': dashboardCsp(),
      'content-length': html.length,
    })
    response.end(html)
  }

  const serveStatic = async (
    pathname: string,
    request: IncomingMessage,
    response: ServerResponse,
    setSession: boolean,
  ): Promise<boolean> => {
    if (!options.dashboardDir) return false
    if (pathname === '/' || !path.extname(pathname)) {
      if (setSession) sessionForRequest(request, response)
      await serveIndex(response, true)
      return true
    }
    const decoded = decodeURIComponent(pathname)
    const relative = decoded.replace(/^\/+/, '')
    const resolved = path.resolve(options.dashboardDir, relative)
    const root = path.resolve(options.dashboardDir)
    if (!resolved.startsWith(`${root}${path.sep}`)) {
      sendError(response, 403, 'Forbidden')
      return true
    }
    try {
      const info = await stat(resolved)
      if (!info.isFile()) return false
      const headers: Record<string, string | number> = {
        ...securityHeaders(),
        'content-type': contentTypeFor(resolved),
        'content-length': info.size,
        'cache-control': relative.startsWith('assets/')
          ? 'public, max-age=31536000, immutable'
          : 'no-store',
      }
      response.writeHead(200, headers)
      if (request.method === 'HEAD') {
        response.end()
        return true
      }
      const stream = createReadStream(resolved)
      stream.on('error', () => {
        if (!response.headersSent) sendError(response, 500, 'Could not read asset')
        else response.destroy()
      })
      stream.pipe(response)
      return true
    } catch {
      return false
    }
  }

  const handleIngest = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    if (!isIngestAuthorized(request)) {
      serverStats.rejectedRequests += 1
      sendError(response, 401, 'Unauthorized')
      return
    }
    const contentType = String(request.headers['content-type'] ?? '')
    if (!contentType.toLowerCase().includes('application/json')) {
      serverStats.rejectedRequests += 1
      sendError(response, 415, 'Content-Type must be application/json')
      return
    }
    const body = await readBody(request, MAX_BODY_BYTES)
    if (!body.ok) {
      serverStats.rejectedRequests += 1
      serverStats.droppedPayload += 1
      sendError(response, 413, `Payload exceeds ${MAX_BODY_BYTES} bytes`)
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(body.body)
    } catch {
      serverStats.rejectedRequests += 1
      serverStats.droppedMalformed += 1
      sendError(response, 400, 'Malformed JSON payload')
      return
    }
    const result = ingestEnvelopeSchema.safeParse(parsed)
    if (!result.success) {
      serverStats.rejectedRequests += 1
      serverStats.droppedMalformed += 1
      sendError(
        response,
        422,
        'Telemetry payload failed validation',
        result.error.issues.map((issue) => issue.path.join('.') || '(root)'),
      )
      return
    }
    const envelope = result.data as StackNextIngestEnvelope
    const now = Date.now()
    store.ingest(envelope, now)
    recordConnection(envelope.instance, envelope.diagnostics, now)
    const accepted = {
      spans: envelope.spans.length,
      errors: envelope.errors.length,
      databaseQueries: envelope.databaseQueries.length,
    }
    if (accepted.spans + accepted.errors + accepted.databaseQueries > 0) {
      sequence += 1
      broadcast('telemetry', {
        type: 'telemetry',
        sequence,
        accepted,
        time: now,
      })
    }
    if (envelope.errors.length > 0) enqueueAutoErrorSnapshot()
    sendJson(
      response,
      202,
      { ok: true, accepted, serverTime: now },
      { 'x-stacknext-sequence': String(sequence) },
    )
  }

  const handleTestRunWrite = async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<void> => {
    if (!isIngestAuthorized(request)) {
      serverStats.rejectedRequests += 1
      sendError(response, 401, 'Unauthorized')
      return
    }
    const contentType = String(request.headers['content-type'] ?? '')
    if (!contentType.toLowerCase().includes('application/json')) {
      serverStats.rejectedRequests += 1
      sendError(response, 415, 'Content-Type must be application/json')
      return
    }
    const body = await readBody(request, MAX_BODY_BYTES)
    if (!body.ok) {
      serverStats.rejectedRequests += 1
      serverStats.droppedPayload += 1
      sendError(response, 413, `Payload exceeds ${MAX_BODY_BYTES} bytes`)
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(body.body)
    } catch {
      serverStats.rejectedRequests += 1
      serverStats.droppedMalformed += 1
      sendError(response, 400, 'Malformed JSON payload')
      return
    }

    if (url.pathname === '/api/test-runs') {
      const result = createRunRequestSchema.safeParse(parsed)
      if (!result.success) {
        sendError(
          response,
          422,
          'Test run payload failed validation',
          result.error.issues.map((issue) => issue.path.join('.') || '(root)'),
        )
        return
      }
      const run = testRuns.create(result.data)
      sendJson(response, 201, { run })
      return
    }

    const sampleMatch = /^\/api\/test-runs\/(run-[0-9a-f]{16})\/samples$/.exec(
      url.pathname,
    )
    if (sampleMatch?.[1]) {
      const result = submitSampleRequestSchema.safeParse(parsed)
      if (!result.success) {
        sendError(
          response,
          422,
          'Captured sample payload failed validation',
          result.error.issues.map((issue) => issue.path.join('.') || '(root)'),
        )
        return
      }
      const submitted = testRuns.submit(sampleMatch[1], result.data)
      if (!submitted.ok) {
        if (submitted.code === 'not-found') {
          sendError(response, 404, 'Test run not found')
        } else if (submitted.code === 'duplicate-sample') {
          sendError(response, 409, 'Sample id already exists for this scenario')
        } else {
          sendError(response, 409, 'Test run is no longer accepting samples')
        }
        return
      }
      sendJson(response, 200, {
        sample: submitted.sample,
        run: submitted.run,
      })
      return
    }

    const completeMatch = /^\/api\/test-runs\/(run-[0-9a-f]{16})\/complete$/.exec(
      url.pathname,
    )
    if (completeMatch?.[1]) {
      const result = completeRunRequestSchema.safeParse(parsed)
      if (!result.success) {
        sendError(
          response,
          422,
          'Test run completion payload failed validation',
          result.error.issues.map((issue) => issue.path.join('.') || '(root)'),
        )
        return
      }
      const run = testRuns.complete(completeMatch[1], result.data)
      if (!run) {
        sendError(response, 404, 'Test run not found')
        return
      }
      sendJson(response, 200, { run })
      return
    }

    sendError(response, 404, 'Not found')
  }

  const handleSse = (request: IncomingMessage, response: ServerResponse): void => {
    if (sseClients.size >= MAX_SSE_CLIENTS) {
      sendError(response, 429, 'Too many live dashboard connections')
      return
    }
    response.writeHead(200, {
      ...securityHeaders(),
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    response.write(
      `event: ready\ndata: ${JSON.stringify({ type: 'ready', sequence, time: Date.now() })}\n\n`,
    )
    const client: SseClient = { res: response }
    sseClients.add(client)
    request.on('close', () => {
      sseClients.delete(client)
    })
  }

  const pageItems = <T>(items: T[], searchParams: URLSearchParams, invalid = 0): {
    items: T[]
    total: number
    limit: number
    offset: number
    invalid: number
  } => {
    const limit = Math.min(Math.max(queryNumber(searchParams.get('limit')) ?? 50, 1), 200)
    const offset = Math.max(queryNumber(searchParams.get('offset')) ?? 0, 0)
    return {
      items: items.slice(offset, offset + limit),
      total: items.length,
      limit,
      offset,
      invalid,
    }
  }

  const savedRuns = async (): Promise<StoredRecords<RunSummary>> => {
    if (!options.projectDir) return { items: [], invalid: 0 }
    try {
      return await listAllRuns(options.projectDir)
    } catch (error) {
      log(`could not list saved test runs: ${error instanceof Error ? error.message : String(error)}`)
      return { items: [], invalid: 0 }
    }
  }

  const savedBaselines = async (): Promise<StoredRecords<BaselineSummary>> => {
    if (!options.projectDir) return { items: [], invalid: 0 }
    return listAllBaselines(options.projectDir)
  }

  const savedComparisons = async (): Promise<StoredRecords<ComparisonSummaryItem>> => {
    if (!options.projectDir) return { items: [], invalid: 0 }
    return listAllComparisons(options.projectDir)
  }

  const sendStorageError = (
    response: ServerResponse,
    error: unknown,
    label: string,
  ): void => {
    if (error instanceof RegressionStorageError) {
      if (error.code === 'not-found') {
        sendError(response, 404, `${label} not found`)
        return
      }
      sendError(response, 422, error.message)
      return
    }
    log(
      `could not read ${label.toLowerCase()}: ${error instanceof Error ? error.message : String(error)}`,
    )
    sendError(response, 500, `Could not read ${label.toLowerCase()}`)
  }

  const handleApi = async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<void> => {
    const pathname = url.pathname
    if (pathname === '/api/ping') {
      sendJson(response, 200, {
        ok: true,
        name: 'stacknext',
        version: options.version ?? VERSION,
      })
      return
    }
    if (pathname === '/api/stream') {
      if (!isReadAuthorized(request)) {
        sendError(response, 401, 'Unauthorized')
        return
      }
      handleSse(request, response)
      return
    }
    if (!isReadAuthorized(request)) {
      serverStats.rejectedRequests += 1
      sendError(response, 401, 'Unauthorized')
      return
    }

    if (pathname === '/api/health') {
      sendJson(response, 200, getHealth())
      return
    }
    if (pathname === '/api/summary') {
      const payload: OverviewResponse = {
        health: getHealth(),
        summary: store.summary(options.config.slowRequestMs),
        coverage: getCoverage(),
        diagnosticOverview: buildDiagnosticOverview(getDiagnosticReport()),
      }
      sendJson(response, 200, payload)
      return
    }
    if (pathname === '/api/coverage') {
      sendJson(response, 200, getCoverage())
      return
    }
    if (pathname === '/api/test-runs') {
      try {
        const live = testRuns.list()
        const seen = new Set(live.map((run) => run.id))
        const disk = await savedRuns()
        const all = [...live, ...disk.items.filter((run) => !seen.has(run.id))].sort(
          (left, right) =>
            right.createdAt - left.createdAt ||
            (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
        )
        sendJson(response, 200, pageItems(all, url.searchParams, disk.invalid))
      } catch (error) {
        sendStorageError(response, error, 'Test runs')
      }
      return
    }
    if (pathname.startsWith('/api/test-runs/')) {
      const id = decodeURIComponent(pathname.slice('/api/test-runs/'.length))
      if (!/^run-[0-9a-f]{16}$/.test(id)) {
        sendError(response, 400, 'Invalid test run id')
        return
      }
      const live = testRuns.get(id)
      if (live) {
        sendJson(response, 200, live)
        return
      }
      if (!options.projectDir) {
        sendError(response, 404, 'Test run not found')
        return
      }
      try {
        sendJson(response, 200, await loadRun(options.projectDir, id))
      } catch (error) {
        sendStorageError(response, error, 'Test run')
      }
      return
    }
    if (pathname === '/api/baselines') {
      if (!options.projectDir) {
        sendJson(response, 200, pageItems<BaselineSummary>([], url.searchParams))
        return
      }
      try {
        const records = await savedBaselines()
        sendJson(response, 200, pageItems(records.items, url.searchParams, records.invalid))
      } catch (error) {
        sendStorageError(response, error, 'Baselines')
      }
      return
    }
    if (pathname.startsWith('/api/baselines/')) {
      const id = decodeURIComponent(pathname.slice('/api/baselines/'.length))
      if (!/^base-[0-9a-f]{16}$/.test(id)) {
        sendError(response, 400, 'Invalid baseline id')
        return
      }
      if (!options.projectDir) {
        sendError(response, 404, 'Baseline not found')
        return
      }
      try {
        sendJson(response, 200, await loadBaseline(options.projectDir, id))
      } catch (error) {
        sendStorageError(response, error, 'Baseline')
      }
      return
    }
    if (pathname === '/api/comparisons') {
      if (!options.projectDir) {
        sendJson(response, 200, pageItems<ComparisonSummaryItem>([], url.searchParams))
        return
      }
      try {
        const records = await savedComparisons()
        sendJson(response, 200, pageItems(records.items, url.searchParams, records.invalid))
      } catch (error) {
        sendStorageError(response, error, 'Comparisons')
      }
      return
    }
    if (pathname.startsWith('/api/comparisons/')) {
      const id = decodeURIComponent(pathname.slice('/api/comparisons/'.length))
      if (!/^cmp-[0-9a-f]{16}$/.test(id)) {
        sendError(response, 400, 'Invalid comparison id')
        return
      }
      if (!options.projectDir) {
        sendError(response, 404, 'Comparison not found')
        return
      }
      try {
        sendJson(response, 200, await loadComparison(options.projectDir, id))
      } catch (error) {
        sendStorageError(response, error, 'Comparison')
      }
      return
    }
    if (pathname === '/api/diagnostics') {
      const parsed = diagnosticFiltersFromSearch(url.searchParams)
      if (parsed.error) {
        sendError(response, 400, parsed.error)
        return
      }
      const state = getDiagnosticState()
      sendJson(response, 200, listDiagnosticFindings(state.report, parsed.filters))
      return
    }
    if (pathname.startsWith('/api/diagnostics/')) {
      const id = decodeURIComponent(pathname.slice('/api/diagnostics/'.length))
      if (!/^diag-[0-9a-f]{8}-[0-9a-f]{8}$/.test(id)) {
        sendError(response, 400, 'Invalid diagnostic id')
        return
      }
      const state = getDiagnosticState()
      const detail = getDiagnosticDetail(state.report, id, state.snapshot)
      if (!detail) {
        sendError(response, 404, 'Diagnostic not found')
        return
      }
      sendJson(response, 200, detail)
      return
    }
    if (pathname === '/api/config') {
      sendJson(response, 200, {
        config: options.config,
        projectName: options.projectName,
        version: options.version ?? VERSION,
        instrumentation: {
          nextOtelVerbose: verboseStatus,
        },
        limitations: [
          'Next.js built-in spans are limited to the operations Next.js exposes through OpenTelemetry.',
          'Server Components are not individually traced; route render spans are captured instead.',
          'Server Actions are not automatically identified by name. Use withStackNextAction() for successful actions.',
          'Drizzle Logger does not expose query duration; durations are null for Drizzle queries.',
          'Edge Runtime and production deployments are not supported.',
        ],
      })
      return
    }
    if (pathname === '/api/requests') {
      sendJson(
        response,
        200,
        store.listRequests(filtersFromSearch(url.searchParams), options.config.slowRequestMs),
      )
      return
    }
    if (pathname === '/api/traces') {
      const result: TraceListResult = store.listTraces(
        filtersFromSearch(url.searchParams),
        options.config.slowRequestMs,
      )
      sendJson(response, 200, result)
      return
    }
    if (pathname.startsWith('/api/traces/')) {
      const traceId = pathname.slice('/api/traces/'.length)
      if (!/^[0-9a-f]{32}$/i.test(traceId)) {
        sendError(response, 400, 'Invalid trace id')
        return
      }
      const detail = store.getTrace(traceId, options.config.slowRequestMs)
      if (!detail) {
        sendError(response, 404, 'Trace not found')
        return
      }
      sendJson(response, 200, traceWithDiagnostics(detail))
      return
    }
    if (pathname === '/api/errors') {
      const result = store.listErrors(errorFiltersFromSearch(url.searchParams))
      const payload: ErrorListResponse = {
        items: result.items,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        groups: result.groups,
      }
      sendJson(response, 200, payload)
      return
    }
    if (pathname.startsWith('/api/errors/')) {
      const id = decodeURIComponent(pathname.slice('/api/errors/'.length))
      if (!id || id.length > 128) {
        sendError(response, 400, 'Invalid error id')
        return
      }
      const detail = store.getError(id, options.config.slowRequestMs)
      if (!detail) {
        sendError(response, 404, 'Error not found')
        return
      }
      const payload: ErrorDetailResponse = detail
      sendJson(response, 200, payload)
      return
    }
    if (pathname === '/api/database') {
      const result: PageResult<DatabaseQueryListItem> = store.listDatabaseQueries(
        databaseFiltersFromSearch(url.searchParams),
      )
      sendJson(response, 200, result)
      return
    }
    if (pathname === '/api/snapshots') {
      if (!projectDir) {
        const empty: SnapshotListResponse = {
          items: [],
          total: 0,
          limit: 50,
          offset: 0,
          invalid: 0,
        }
        sendJson(response, 200, empty)
        return
      }
      try {
        const page = await listSnapshots(projectDir, {
          ...(queryNumber(url.searchParams.get('limit')) !== undefined
            ? { limit: queryNumber(url.searchParams.get('limit')) }
            : {}),
          ...(queryNumber(url.searchParams.get('offset')) !== undefined
            ? { offset: queryNumber(url.searchParams.get('offset')) }
            : {}),
        })
        const payload: SnapshotListResponse = page
        sendJson(response, 200, payload)
      } catch (error) {
        sendSnapshotError(response, error)
      }
      return
    }
    if (pathname.startsWith('/api/snapshots/')) {
      const match = /^\/api\/snapshots\/([^/]+)(\/.*)?$/.exec(pathname)
      const id = match?.[1] ? decodeURIComponent(match[1]) : ''
      if (!isSnapshotId(id)) {
        sendError(response, 400, 'Invalid snapshot id')
        return
      }
      await handleSnapshotApi(request, response, url, id, match?.[2] ?? '')
      return
    }
    if (pathname === '/api/export') {
      const data = store.exportAll()
      const payload: ExportResponse = {
        format: 'stacknext-export',
        version: 1,
        exportedAt: Date.now(),
        projectName: options.projectName,
        collectorVersion: options.version ?? VERSION,
        config: options.config,
        spans: data.spans,
        errors: data.errors,
        databaseQueries: data.databaseQueries,
        stats: {
          requests: store.summary(options.config.slowRequestMs).totalRequests,
          errors: data.errors.length,
          databaseQueries: data.databaseQueries.length,
          spans: data.spans.length,
        },
        diagnostics: getDiagnosticReport(),
        limitations: [
          'Bodies, headers, cookies and SQL bind parameters are not stored.',
          'Drizzle Logger does not expose query duration.',
          'Edge Runtime is not supported.',
        ],
      }
      sendJson(response, 200, payload, {
        'content-disposition': `attachment; filename="stacknext-${options.projectName.replace(/[^a-z0-9_-]+/gi, '-')}-${Date.now()}.json"`,
      })
      return
    }
    sendError(response, 404, 'Not found')
  }

  const requestHandler = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    response.setHeader('x-stacknext', options.version ?? VERSION)
    if (!hostAllowed(request.headers.host)) {
      serverStats.rejectedRequests += 1
      sendError(response, 403, 'Invalid Host header')
      return
    }
    const origin = request.headers.origin
    if (origin && !originAllowed(origin, port)) {
      serverStats.rejectedRequests += 1
      sendError(response, 403, 'Cross-origin requests are not allowed')
      return
    }
    if (request.headers['sec-fetch-site'] === 'cross-site') {
      serverStats.rejectedRequests += 1
      sendError(response, 403, 'Cross-site requests are not allowed')
      return
    }
    const url = new URL(request.url ?? '/', `http://${host}:${port}`)
    try {
      if (url.pathname === '/__stacknext/v1/ingest') {
        if (request.method !== 'POST') {
          response.setHeader('allow', 'POST')
          sendError(response, 405, 'Method not allowed')
          return
        }
        await handleIngest(request, response)
        return
      }
      if (url.pathname.startsWith('/api/')) {
        const testRunWrite =
          url.pathname === '/api/test-runs' ||
          url.pathname.startsWith('/api/test-runs/')
        const snapshotWrite =
          url.pathname === '/api/snapshots' ||
          url.pathname.startsWith('/api/snapshots/')
        if (request.method === 'POST' && testRunWrite) {
          await handleTestRunWrite(request, response, url)
          return
        }
        if (request.method === 'POST' && url.pathname === '/api/snapshots/import') {
          await handleSnapshotWrite(request, response, url)
          return
        }
        if (
          request.method === 'POST' &&
          (url.pathname === '/api/snapshots' || url.pathname === '/api/snapshots/')
        ) {
          await handleSnapshotWrite(request, response, url)
          return
        }
        if (request.method === 'DELETE' && /^\/api\/snapshots\/[^/]+\/?$/.test(url.pathname)) {
          await handleSnapshotWrite(request, response, url)
          return
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.setHeader(
            'allow',
            testRunWrite
              ? 'GET, HEAD, POST'
              : snapshotWrite
                ? 'GET, HEAD, POST, DELETE'
                : 'GET, HEAD',
          )
          sendError(response, 405, 'Method not allowed')
          return
        }
        await handleApi(request, response, url)
        if (request.method === 'HEAD') request.resume()
        return
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('allow', 'GET, HEAD')
        sendError(response, 405, 'Method not allowed')
        return
      }
      const served = await serveStatic(url.pathname, request, response, true)
      if (!served) {
        if (url.pathname.includes('.')) {
          sendError(response, 404, 'Asset not found')
        } else {
          sessionForRequest(request, response)
          await serveIndex(response, true)
        }
      }
    } catch (error) {
      log(
        `collector request failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      if (!response.headersSent) {
        sendError(response, 500, 'Internal collector error')
      } else {
        response.destroy()
      }
    }
  }

  const server = createServer((request, response) => {
    void requestHandler(request, response)
  })
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  server.keepAliveTimeout = 5_000

  const maxPortAttempts = options.autoPort === false ? 1 : 25
  let lastError: unknown = null
  let actualPort: number | null = null
  for (let attempt = 0; attempt < maxPortAttempts; attempt += 1) {
    try {
      actualPort = await listen(server, port, host)
      break
    } catch (error) {
      lastError = error
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
      if (port === 0) throw error
      port += 1
    }
  }
  if (actualPort === null) {
    throw new Error(
      `Could not find an available dashboard port near ${options.port}: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    )
  }
  port = actualPort
  dashboardUrl = `http://${host === '127.0.0.1' ? '127.0.0.1' : host}:${port}`

  const saveSnapshotOnExit = async (): Promise<SnapshotSummary | null> => {
    if (!options.config.snapshots.autoOnExit) return null
    await autoSaveQueue
    try {
      const saved = await saveCurrentSnapshot('exit')
      if (saved) log(`exit snapshot saved (${saved.id})`)
      return saved
    } catch (error) {
      log(
        `exit snapshot failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      return null
    }
  }

  let closing = false
  const close = async (): Promise<void> => {
    if (closing) return
    closing = true
    clearInterval(heartbeatInterval)
    for (const client of sseClients) {
      try {
        client.res.write(
          `event: shutdown\ndata: ${JSON.stringify({ type: 'shutdown', time: Date.now() })}\n\n`,
        )
        client.res.end()
      } catch {
        // Ignore clients that already disconnected.
      }
    }
    sseClients.clear()
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        server.closeAllConnections()
        resolve()
      }, 2_000)
      timeout.unref()
      server.close(() => {
        clearTimeout(timeout)
        resolve()
      })
      server.closeIdleConnections()
    })
    store.clear()
    sessions.clear()
    connections.clear()
  }

  return {
    port,
    url: dashboardUrl,
    token: options.token,
    store,
    health: getHealth,
    saveSnapshotOnExit,
    close,
  }
}
