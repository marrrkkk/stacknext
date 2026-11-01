import type {
  NextScopeDatabaseQueryInput,
  NextScopeErrorInput,
  NextScopeIngestEnvelope,
  NextScopeSpanInput,
} from '@nextscope/core'

export const TRACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

export function rootSpan(overrides: Partial<NextScopeSpanInput> = {}): NextScopeSpanInput {
  return {
    traceId: TRACE,
    spanId: '1111111111111111',
    name: 'GET /api/collector-test',
    kind: 'server',
    startTime: Date.now() - 150,
    endTime: Date.now() - 30,
    durationMs: 120,
    status: 'ok',
    serviceName: 'collector-test',
    route: '/api/collector-test',
    method: 'GET',
    statusCode: 200,
    nextSpanType: 'BaseServer.handleRequest',
    attributes: { 'http.method': 'GET', 'http.status_code': 200 },
    events: [],
    resource: { 'service.name': 'collector-test' },
    ...overrides,
  }
}

export function errorEvent(overrides: Partial<NextScopeErrorInput> = {}): NextScopeErrorInput {
  return {
    id: 'test-error',
    message: 'Something failed with password=hunter2',
    name: 'Error',
    stack: 'Error: Something failed\n    at handler (/app/route.ts:1:1)',
    timestamp: Date.now() - 100,
    route: '/api/collector-test',
    method: 'GET',
    requestPath: '/api/collector-test?secret=1',
    routerKind: 'App Router',
    routeType: 'route',
    traceId: TRACE,
    spanId: '1111111111111111',
    attributes: { authorization: 'Bearer supersecret' },
    ...overrides,
  }
}

export function databaseQuery(
  overrides: Partial<NextScopeDatabaseQueryInput> = {},
): NextScopeDatabaseQueryInput {
  return {
    id: 'test-query',
    traceId: TRACE,
    spanId: '1111111111111111',
    timestamp: Date.now() - 120,
    durationMs: 7,
    sql: 'select * from users where id = $1',
    databaseSystem: 'sqlite',
    success: true,
    source: 'drizzle',
    attributes: {},
    ...overrides,
  }
}

export function envelope(
  overrides: Partial<NextScopeIngestEnvelope> = {},
): NextScopeIngestEnvelope {
  return {
    version: 1,
    instance: {
      instanceId: 'collector-test-instance',
      serviceName: 'collector-test',
      projectName: 'collector-test',
      nextVersion: '16.4.3',
      sdkVersion: '0.1.0',
      runtime: 'nodejs',
    },
    spans: [rootSpan()],
    errors: [errorEvent()],
    databaseQueries: [databaseQuery()],
    ...overrides,
  }
}
