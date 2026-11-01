import type { NextScopeConfig } from './config.js'

export const NEXTSCOPE_SCHEMA_VERSION = 1
export const NEXTSCOPE_SDK_VERSION = '0.1.0'

export const SPAN_KINDS = ['internal', 'server', 'client', 'producer', 'consumer'] as const
export type NextScopeSpanKind = (typeof SPAN_KINDS)[number]

export const SPAN_STATUSES = ['unset', 'ok', 'error'] as const
export type NextScopeSpanStatus = (typeof SPAN_STATUSES)[number]

export const DATABASE_SOURCES = ['drizzle', 'prisma', 'manual'] as const
export type NextScopeDatabaseSource = (typeof DATABASE_SOURCES)[number]

export interface NextScopeSpanEvent {
  name: string
  time: number
  attributes: Record<string, unknown>
}

export interface NextScopeSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind: NextScopeSpanKind
  startTime: number
  endTime: number
  durationMs: number
  status: NextScopeSpanStatus
  statusMessage?: string
  serviceName: string
  route?: string
  method?: string
  statusCode?: number
  nextSpanType?: string
  attributes: Record<string, unknown>
  events: NextScopeSpanEvent[]
  resource: Record<string, unknown>
  receivedAt: number
}

export interface NextScopeError {
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
  traceId?: string
  spanId?: string
  attributes: Record<string, unknown>
  receivedAt: number
}

export interface NextScopeDatabaseQuery {
  id: string
  traceId?: string
  spanId?: string
  timestamp: number
  durationMs: number | null
  sql: string
  databaseSystem: string
  operation?: string
  success: boolean
  errorMessage?: string
  source: NextScopeDatabaseSource
  attributes: Record<string, unknown>
  receivedAt: number
}

export interface NextScopeExporterDiagnostics {
  instanceId: string
  exportedSpans: number
  droppedSpans: number
  exportedEvents: number
  droppedEvents: number
  lastError?: string
  queueDepth: number
  timestamp: number
}

export interface NextScopeInstance {
  instanceId: string
  serviceName: string
  projectName?: string
  nextVersion?: string
  sdkVersion: string
  runtime: 'nodejs'
}

export interface NextScopeIngestEnvelope {
  version: 1
  instance: NextScopeInstance
  spans: NextScopeSpanInput[]
  errors: NextScopeErrorInput[]
  databaseQueries: NextScopeDatabaseQueryInput[]
  diagnostics?: NextScopeExporterDiagnostics
}

/** Wire format: server-maintained fields such as receivedAt are excluded. */
export type NextScopeSpanInput = Omit<NextScopeSpan, 'receivedAt'>
export type NextScopeErrorInput = Omit<NextScopeError, 'fingerprint' | 'receivedAt'>
export type NextScopeDatabaseQueryInput = Omit<NextScopeDatabaseQuery, 'receivedAt'>

export type RequestStatusClass = '2xx' | '3xx' | '4xx' | '5xx' | 'none'

export interface RequestSummary {
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

export interface TraceDetail {
  traceId: string
  request: RequestSummary | null
  spans: NextScopeSpan[]
  errors: NextScopeError[]
  databaseQueries: NextScopeDatabaseQuery[]
  startTime: number
  endTime: number
  durationMs: number
  missingParentSpanIds: string[]
}

export interface RequestFilters {
  limit?: number
  offset?: number
  q?: string
  method?: string
  status?: string
  slow?: boolean
  minDuration?: number
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

export interface ErrorListItem extends NextScopeError {
  resolvedTraceId: string | null
}

export interface DatabaseQueryListItem extends NextScopeDatabaseQuery {
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
  sdkVersion: string
  lastSeen: number
  connected: boolean
  diagnostics?: NextScopeExporterDiagnostics
}

export interface HealthResponse {
  status: 'ok'
  name: 'nextscope'
  version: string
  projectName: string
  dashboardUrl: string
  startedAt: number
  uptimeMs: number
  time: number
  connected: boolean
  connections: ConnectionInfo[]
  counts: {
    requests: number
    failedRequests: number
    slowRequests: number
    spans: number
    errors: number
    databaseQueries: number
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
  config: NextScopeConfig
}

export interface OverviewResponse {
  health: HealthResponse
  summary: StoreSummary
}

export interface ErrorListResponse extends PageResult<ErrorListItem> {
  groups: ErrorGroup[]
}

export interface ErrorDetailResponse {
  error: ErrorListItem
  trace: TraceDetail | null
}

export interface ExportResponse {
  format: 'nextscope-export'
  version: 1
  exportedAt: number
  projectName: string
  collectorVersion: string
  config: NextScopeConfig
  spans: NextScopeSpan[]
  errors: NextScopeError[]
  databaseQueries: NextScopeDatabaseQuery[]
  stats: {
    requests: number
    errors: number
    databaseQueries: number
    spans: number
  }
  limitations: string[]
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
