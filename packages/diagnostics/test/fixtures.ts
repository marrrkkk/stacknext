import {
  parseStackNextConfig,
  type DatabaseQueryListItem,
  type DiagnosticSnapshot,
  type ErrorListItem,
  type StackNextConfig,
  type StackNextSpan,
  type RequestSummary,
} from '@stacknext/core'

export const TRACE_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
export const TRACE_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

export function config(
  overrides: Parameters<typeof parseStackNextConfig>[0] = {},
): StackNextConfig {
  return parseStackNextConfig(overrides)
}

export function span(overrides: Partial<StackNextSpan> = {}): StackNextSpan {
  return {
    traceId: TRACE_A,
    spanId: '1111111111111111',
    name: 'GET /api/test',
    kind: 'server',
    startTime: 1_000,
    endTime: 1_120,
    durationMs: 120,
    status: 'ok',
    serviceName: 'diagnostics-test',
    route: '/api/test',
    method: 'GET',
    statusCode: 200,
    nextSpanType: 'BaseServer.handleRequest',
    attributes: {},
    events: [],
    resource: {},
    receivedAt: 1_121,
    ...overrides,
  }
}

export function request(overrides: Partial<RequestSummary> = {}): RequestSummary {
  return {
    id: TRACE_A,
    traceId: TRACE_A,
    name: 'GET /api/test',
    method: 'GET',
    route: '/api/test',
    statusCode: 200,
    statusClass: '2xx',
    durationMs: 120,
    timestamp: 1_000,
    endTime: 1_120,
    spanCount: 1,
    errorCount: 0,
    databaseQueryCount: 0,
    fetchCount: 0,
    failed: false,
    slow: false,
    serviceName: 'diagnostics-test',
    ...overrides,
  }
}

export function query(
  overrides: Partial<DatabaseQueryListItem> = {},
): DatabaseQueryListItem {
  return {
    id: 'query-1',
    traceId: TRACE_A,
    spanId: '1111111111111111',
    timestamp: 1_010,
    durationMs: 12,
    sql: 'select id, name from users where id = $1',
    databaseSystem: 'postgresql',
    operation: 'select',
    success: true,
    source: 'drizzle',
    attributes: {},
    receivedAt: 1_011,
    resolvedTraceId: TRACE_A,
    route: '/api/test',
    ...overrides,
  }
}

export function error(overrides: Partial<ErrorListItem> = {}): ErrorListItem {
  return {
    id: 'error-1',
    fingerprint: 'store-fingerprint',
    name: 'Error',
    message: 'Database connection failed for user [redacted]',
    stack: 'Error: failed\n    at handler (/app/route.ts:10:2)',
    timestamp: 1_020,
    route: '/api/test',
    method: 'GET',
    requestPath: '/api/test',
    routerKind: 'App Router',
    routeType: 'route',
    traceId: TRACE_A,
    spanId: '1111111111111111',
    attributes: {},
    receivedAt: 1_021,
    resolvedTraceId: TRACE_A,
    ...overrides,
  }
}

export function snapshot(
  overrides: Partial<Omit<DiagnosticSnapshot, 'revision'>> & {
    revision?: number
  } = {},
): DiagnosticSnapshot {
  const spans = overrides.spans ?? []
  const errors = overrides.errors ?? []
  const databaseQueries = overrides.databaseQueries ?? []
  const requests = overrides.requests ?? []
  const times = [
    ...spans.map((entry) => entry.startTime),
    ...errors.map((entry) => entry.timestamp),
    ...databaseQueries.map((entry) => entry.timestamp),
  ]
  return {
    revision: overrides.revision ?? 1,
    spans,
    errors,
    databaseQueries,
    requests,
    firstEventTime: times.length > 0 ? Math.min(...times) : null,
    lastEventTime: times.length > 0 ? Math.max(...times) : null,
    retentionMs: overrides.retentionMs ?? 600_000,
  }
}
