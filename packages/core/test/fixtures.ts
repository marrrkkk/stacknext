import type {
  NextScopeDatabaseQueryInput,
  NextScopeErrorInput,
  NextScopeIngestEnvelope,
  NextScopeInstance,
  NextScopeSpanInput,
} from '../src/index.js'

export const TRACE_ID = '0123456789abcdef0123456789abcdef'
export const ROOT_SPAN_ID = '1111111111111111'
export const CHILD_SPAN_ID = '2222222222222222'
export const DB_SPAN_ID = '3333333333333333'

export const instance: NextScopeInstance = {
  instanceId: 'test-instance',
  serviceName: 'test-app',
  projectName: 'test-project',
  sdkVersion: '0.1.0',
  runtime: 'nodejs',
}

export function rootSpan(overrides: Partial<NextScopeSpanInput> = {}): NextScopeSpanInput {
  return {
    traceId: TRACE_ID,
    spanId: ROOT_SPAN_ID,
    name: 'GET /api/test',
    kind: 'server',
    startTime: 1_000,
    endTime: 1_120,
    durationMs: 120,
    status: 'ok',
    serviceName: 'test-app',
    route: '/api/test',
    method: 'GET',
    statusCode: 200,
    nextSpanType: 'BaseServer.handleRequest',
    attributes: {
      'http.method': 'GET',
      'http.route': '/api/test',
      'http.status_code': 200,
      'http.target': '/api/test?token=super-secret',
      authorization: 'Bearer abcdefghijklmnop',
    },
    events: [],
    resource: { 'service.name': 'test-app', 'host.name': 'private-host' },
    ...overrides,
  }
}

export function fetchSpan(overrides: Partial<NextScopeSpanInput> = {}): NextScopeSpanInput {
  return {
    traceId: TRACE_ID,
    spanId: CHILD_SPAN_ID,
    parentSpanId: ROOT_SPAN_ID,
    name: 'fetch GET http://example.test/profile?access_token=secret',
    kind: 'client',
    startTime: 1_020,
    endTime: 1_085,
    durationMs: 65,
    status: 'ok',
    serviceName: 'test-app',
    nextSpanType: 'AppRender.fetch',
    attributes: {
      'http.url': 'http://example.test/profile?access_token=secret',
      'http.status_code': 200,
    },
    events: [],
    resource: { 'service.name': 'test-app' },
    ...overrides,
  }
}

export function databaseQuery(
  overrides: Partial<NextScopeDatabaseQueryInput> = {},
): NextScopeDatabaseQueryInput {
  return {
    id: 'query-1',
    traceId: TRACE_ID,
    spanId: ROOT_SPAN_ID,
    timestamp: 1_030,
    durationMs: 12,
    sql: 'select id, name from users where id = $1',
    databaseSystem: 'postgresql',
    success: true,
    source: 'drizzle',
    attributes: {},
    ...overrides,
  }
}

export function errorEvent(overrides: Partial<NextScopeErrorInput> = {}): NextScopeErrorInput {
  return {
    id: 'error-1',
    message: 'Database connection failed for postgres://user:hunter2@db.test/app',
    name: 'Error',
    stack: 'Error: failed\n    at handler (/app/route.ts:10:2)',
    timestamp: 1_050,
    route: '/api/test',
    method: 'GET',
    requestPath: '/api/test?token=super-secret',
    routerKind: 'App Router',
    routeType: 'route',
    traceId: TRACE_ID,
    spanId: ROOT_SPAN_ID,
    attributes: { cookie: 'session=secret' },
    ...overrides,
  }
}

export function envelope(
  overrides: Partial<NextScopeIngestEnvelope> = {},
): NextScopeIngestEnvelope {
  return {
    version: 1,
    instance,
    spans: [rootSpan(), fetchSpan()],
    errors: [errorEvent()],
    databaseQueries: [databaseQuery()],
    ...overrides,
  }
}
