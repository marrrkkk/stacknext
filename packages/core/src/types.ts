import type { StackNextConfig } from './config.js'
import type {
  DiagnosticOverview,
  DiagnosticReference,
  DiagnosticReport,
} from './diagnostics.js'

export const STACKNEXT_SCHEMA_VERSION = 1
export const STACKNEXT_SDK_VERSION = '0.10.0'

export const SPAN_KINDS = ['internal', 'server', 'client', 'producer', 'consumer'] as const
export type StackNextSpanKind = (typeof SPAN_KINDS)[number]

export const SPAN_STATUSES = ['unset', 'ok', 'error'] as const
export type StackNextSpanStatus = (typeof SPAN_STATUSES)[number]

export const DATABASE_SOURCES = ['drizzle', 'prisma', 'manual'] as const
export type StackNextDatabaseSource = (typeof DATABASE_SOURCES)[number]

export interface StackNextSpanEvent {
  name: string
  time: number
  attributes: Record<string, unknown>
}

export interface StackNextSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind: StackNextSpanKind
  startTime: number
  endTime: number
  durationMs: number
  status: StackNextSpanStatus
  statusMessage?: string
  serviceName: string
  route?: string
  method?: string
  statusCode?: number
  nextSpanType?: string
  /** Human-readable name Next.js attached to a framework span. */
  nextSpanName?: string
  /** Route pattern from `next.route`, query-free. */
  nextRoute?: string
  /** App Router page from `next.page`, query-free. */
  nextPage?: string
  /** App Router segment from `next.segment`, query-free. */
  nextSegment?: string
  /** Whether Next.js marked a framework span as part of an RSC render. */
  nextRsc?: boolean
  attributes: Record<string, unknown>
  events: StackNextSpanEvent[]
  resource: Record<string, unknown>
  receivedAt: number
}

export interface StackNextError {
  id: string
  fingerprint: string
  message: string
  name: string
  stack?: string
  digest?: string
  timestamp: number
  route?: string
  method?: string
  requestPath?: string
  routerKind?: string
  routeType?: string
  renderSource?: string
  /** Next.js 16 render type, for example dynamic or dynamic-resume. */
  renderType?: string
  traceId?: string
  spanId?: string
  attributes: Record<string, unknown>
  receivedAt: number
}

export interface StackNextDatabaseQuery {
  id: string
  traceId?: string
  /** Active OTel span at query emission; request attribution requires captured span evidence. */
  spanId?: string
  timestamp: number
  durationMs: number | null
  sql: string
  databaseSystem: string
  operation?: string
  success: boolean
  errorMessage?: string
  source: StackNextDatabaseSource
  attributes: Record<string, unknown>
  receivedAt: number
}

export interface StackNextExporterDiagnostics {
  instanceId: string
  exportedSpans: number
  droppedSpans: number
  exportedEvents: number
  droppedEvents: number
  lastError?: string
  queueDepth: number
  timestamp: number
}

export interface StackNextInstance {
  instanceId: string
  serviceName: string
  projectName?: string
  nextVersion?: string
  /** Application Node.js version, used only for capture environment checks. */
  runtimeVersion?: string
  sdkVersion: string
  runtime: 'nodejs'
}

export interface StackNextIngestEnvelope {
  version: 1
  instance: StackNextInstance
  spans: StackNextSpanInput[]
  errors: StackNextErrorInput[]
  databaseQueries: StackNextDatabaseQueryInput[]
  diagnostics?: StackNextExporterDiagnostics
}

/** Wire format: server-maintained fields such as receivedAt are excluded. */
export type StackNextSpanInput = Omit<StackNextSpan, 'receivedAt'>
export type StackNextErrorInput = Omit<StackNextError, 'fingerprint' | 'receivedAt'>
export type StackNextDatabaseQueryInput = Omit<StackNextDatabaseQuery, 'receivedAt'>

export type RequestStatusClass = '2xx' | '3xx' | '4xx' | '5xx' | 'none'

export interface RequestSummary {
  /** @deprecated Always equals `traceId`. Use `traceId`. */
  id: string
  traceId: string
  name: string
  method: string | null
  route: string | null
  statusCode: number | null
  statusClass: RequestStatusClass
  durationMs: number | null
  timestamp: number
  endTime: number | null
  spanCount: number
  errorCount: number
  databaseQueryCount: number
  fetchCount: number
  failed: boolean
  slow: boolean
  serviceName: string
}

export interface TraceSummary {
  traceId: string
  rootName: string
  rootSpanId: string | null
  serviceName: string
  startTime: number
  endTime: number
  durationMs: number
  spanCount: number
  errorCount: number
  databaseQueryCount: number
  failed: boolean
  request: RequestSummary | null
}

export type TraceWarningCode =
  | 'missing-parent'
  | 'unmeasured-query-duration'
  | 'no-request-root'
  | 'clock-skew'

export interface TraceWarning {
  code: TraceWarningCode
  message: string
  spanId?: string
}

export interface TraceDetail {
  traceId: string
  request: RequestSummary | null
  spans: StackNextSpan[]
  errors: StackNextError[]
  databaseQueries: StackNextDatabaseQuery[]
  startTime: number
  endTime: number
  durationMs: number
  missingParentSpanIds: string[]
  /** Additive warnings for incomplete or misleading trace evidence. */
  warnings: TraceWarning[]
  /** Deterministic diagnostic findings that reference this trace (0.4+). */
  diagnostics?: DiagnosticReference[]
}

export const COVERAGE_STATUSES = [
  'observed',
  'active',
  'configured',
  'not-observed',
  'unsupported',
  'unknown',
] as const
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number]

export const COVERAGE_CATEGORIES = [
  'framework',
  'database',
  'errors',
  'custom',
  'runtime',
] as const
export type CoverageCategory = (typeof COVERAGE_CATEGORIES)[number]

export interface CoverageEvidenceSummary {
  spanTypes: string[]
  count: number
  lastSeen: number | null
}

export interface CoverageItem {
  id: string
  label: string
  category: CoverageCategory
  status: CoverageStatus
  /** Whether the feature is enabled by config; null when it cannot be known. */
  configured: boolean | null
  observed: boolean
  description: string
  evidence: CoverageEvidenceSummary
  limitations: string[]
}

export interface CoverageSample {
  firstEventTime: number | null
  lastEventTime: number | null
  retentionMs: number
  requests: number
  spans: number
  errors: number
  databaseQueries: number
  connectedInstances: number
  connected: boolean
}

export interface CoverageReport {
  projectName: string
  generatedAt: number
  collectorVersion: string
  sample: CoverageSample
  statusCounts: Record<CoverageStatus, number>
  items: CoverageItem[]
  notes: string[]
  limitations: string[]
}

export interface RequestFilters {
  limit?: number
  offset?: number
  q?: string
  method?: string
  status?: string
  slow?: boolean
  minDuration?: number
  /** Restrict results to traces that have an HTTP request root. */
  httpOnly?: boolean
  sort?: 'recent' | 'oldest' | 'slowest'
}

export interface ErrorFilters {
  limit?: number
  offset?: number
  q?: string
  route?: string
  name?: string
}

export interface DatabaseFilters {
  limit?: number
  offset?: number
  q?: string
  minDuration?: number
  traceId?: string
  databaseSystem?: string
}

export interface ErrorGroup {
  fingerprint: string
  name: string
  message: string
  route: string | null
  count: number
  firstSeen: number
  lastSeen: number
  latestErrorId: string
  traceId: string | null
}

export interface ErrorListItem extends StackNextError {
  resolvedTraceId: string | null
}

export interface DatabaseQueryListItem extends StackNextDatabaseQuery {
  resolvedTraceId: string | null
  route: string | null
}

export interface PageResult<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface StoreSummary {
  lastReceivedAt: number | null
  totalRequests: number
  failedRequests: number
  slowRequests: number
  avgDurationMs: number | null
  p95DurationMs: number | null
  spanCount: number
  errorCount: number
  databaseQueryCount: number
  fetchCount: number
  slowestRequests: RequestSummary[]
  recentErrors: ErrorListItem[]
  firstEventTime: number | null
  lastEventTime: number | null
}

export interface TraceListResult {
  items: TraceSummary[]
  total: number
  limit: number
  offset: number
}

export interface ConnectionInfo {
  instanceId: string
  serviceName: string
  projectName?: string
  nextVersion?: string
  runtimeVersion?: string
  sdkVersion: string
  lastSeen: number
  connected: boolean
  diagnostics?: StackNextExporterDiagnostics
}

export type NextOtelVerboseSource =
  | 'config'
  | 'environment'
  | 'disabled'
  | 'unknown'

export interface NextOtelVerboseStatus {
  enabled: boolean
  source: NextOtelVerboseSource
}

export interface HealthResponse {
  status: 'ok'
  name: 'stacknext'
  version: string
  projectName: string
  dashboardUrl: string
  startedAt: number
  uptimeMs: number
  time: number
  connected: boolean
  connections: ConnectionInfo[]
  instrumentation: {
    nextOtelVerbose: NextOtelVerboseStatus
  }
  counts: {
    requests: number
    failedRequests: number
    slowRequests: number
    spans: number
    errors: number
    databaseQueries: number
  }
  /** Current live sample window. Additive in StackNext 0.7. */
  sample: {
    /** Newest collector receive time, used for retention expiry. */
    lastReceivedAt: number | null
    firstEventTime: number | null
    lastEventTime: number | null
    retentionMs: number
  }
  store: {
    spansReceived: number
    errorsReceived: number
    databaseQueriesReceived: number
    dropped: {
      capacity: number
      retention: number
    }
    limits: {
      maxSpans: number
      maxErrors: number
      maxDatabaseQueries: number
      retentionMs: number
    }
  }
  server: {
    rejectedRequests: number
    droppedPayload: number
    droppedMalformed: number
    sseClients: number
  }
  exporter: {
    droppedSpans: number
    droppedEvents: number
    lastError: string | null
  }
  config: StackNextConfig
}

export interface OverviewResponse {
  health: HealthResponse
  summary: StoreSummary
  /** Additive instrumentation coverage metadata (StackNext 0.3+). */
  coverage?: CoverageReport
  /** Additive deterministic diagnostic overview (StackNext 0.4+). */
  diagnosticOverview?: DiagnosticOverview
}

export interface ErrorListResponse extends PageResult<ErrorListItem> {
  groups: ErrorGroup[]
}

export interface ErrorDetailResponse {
  error: ErrorListItem
  trace: TraceDetail | null
}

export interface ExportResponse {
  format: 'stacknext-export'
  version: 1
  exportedAt: number
  projectName: string
  collectorVersion: string
  config: StackNextConfig
  spans: StackNextSpan[]
  errors: StackNextError[]
  databaseQueries: StackNextDatabaseQuery[]
  stats: {
    requests: number
    errors: number
    databaseQueries: number
    spans: number
  }
  /** Additive deterministic diagnostic report (StackNext 0.4+). */
  diagnostics?: DiagnosticReport
  limitations: string[]
}

export const SNAPSHOT_SOURCES = ['manual', 'exit', 'error', 'import'] as const
export type SnapshotSource = (typeof SNAPSHOT_SOURCES)[number]

export interface SnapshotStats {
  requests: number
  errors: number
  databaseQueries: number
  spans: number
}

export interface SnapshotSample {
  firstEventTime: number | null
  lastEventTime: number | null
  retentionMs: number
}

export interface SnapshotSummary {
  id: string
  createdAt: number
  source: SnapshotSource
  projectName: string
  collectorVersion: string
  label?: string
  sample: SnapshotSample
  stats: SnapshotStats
  /** Serialized payload size in bytes. */
  bytes: number
}

/** Frozen, redacted telemetry stored under .stacknext/snapshots. */
export interface SnapshotPayload {
  format: 'stacknext-snapshot'
  version: 1
  id: string
  createdAt: number
  source: SnapshotSource
  projectName: string
  collectorVersion: string
  label?: string
  config: StackNextConfig
  sample: SnapshotSample
  spans: StackNextSpan[]
  errors: StackNextError[]
  databaseQueries: StackNextDatabaseQuery[]
  stats: SnapshotStats
  limitations: string[]
}

export interface SnapshotListResponse extends PageResult<SnapshotSummary> {
  invalid: number
}

export interface SnapshotDetailResponse {
  snapshot: SnapshotSummary
  config: StackNextConfig
  limitations: string[]
  traces: TraceSummary[]
  errors: ErrorListItem[]
  databaseQueries: DatabaseQueryListItem[]
}

export interface ApiErrorResponse {
  error: string
  issues?: string[]
}

export interface CollectorDroppedStats {
  capacity: number
  payload: number
  malformed: number
  retention: number
}

export interface CollectorStats {
  startedAt: number
  uptimeMs: number
  spansReceived: number
  errorsReceived: number
  databaseQueriesReceived: number
  rejectedRequests: number
  dropped: CollectorDroppedStats
}
