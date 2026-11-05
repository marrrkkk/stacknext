import { describe, expect, it } from 'vitest'
import type {
  DiagnosticFinding,
  DiagnosticReport,
  DiagnosticSnapshot,
  RequestSummary,
  StackNextSpan,
} from '@stacknext/core'
import {
  countFindings,
  diagnosticOverview,
  generateDiagnosticReport,
  getDiagnosticDetail,
  listDiagnosticFindings,
  type DiagnosticEngineOptions,
} from '../src/engine.js'
import { diagnosticSpanCategory, spanThresholdMs } from '../src/classify.js'
import {
  TRACE_B,
  config,
  error,
  query,
  request,
  snapshot,
  span,
} from './fixtures.js'

function options(
  overrides: Partial<DiagnosticEngineOptions> = {},
): DiagnosticEngineOptions {
  return {
    projectName: 'diagnostics-test',
    collectorVersion: '0.6.1',
    config: config().diagnostics,
    slowRequestMs: config().slowRequestMs,
    generatedAt: 10_000,
    connected: true,
    connectedInstances: 1,
    ...overrides,
  }
}

function reportFor(
  value: DiagnosticSnapshot,
  overrides: Partial<DiagnosticEngineOptions> = {},
): DiagnosticReport {
  return generateDiagnosticReport(value, options(overrides))
}

function byRule(
  report: DiagnosticReport,
  ruleId: DiagnosticFinding['ruleId'],
): DiagnosticFinding[] {
  return report.findings.filter((finding) => finding.ruleId === ruleId)
}

function traceIdFor(index: number): string {
  return (index + 1).toString(16).padStart(32, '0')
}

function spanIdFor(index: number): string {
  return (index + 1).toString(16).padStart(16, '0')
}

function root(
  index: number,
  route: string,
  durationMs: number,
  overrides: Partial<StackNextSpan> = {},
): StackNextSpan {
  return span({
    traceId: traceIdFor(index),
    spanId: spanIdFor(index),
    name: `GET ${route}`,
    route,
    durationMs,
    startTime: 1_000 + index * 10_000,
    ...overrides,
  })
}

function child(
  parent: StackNextSpan,
  overrides: Partial<StackNextSpan> & { spanId: string },
): StackNextSpan {
  return span({
    traceId: parent.traceId,
    parentSpanId: parent.spanId,
    name: 'db.select tasks',
    kind: 'internal',
    nextSpanType: undefined,
    route: parent.route,
    method: parent.method,
    statusCode: parent.statusCode,
    startTime: parent.startTime + 20,
    durationMs: 300,
    attributes: { 'db.system': 'sqlite' },
    ...overrides,
  })
}

function requestFor(
  rootSpan: StackNextSpan,
  overrides: Partial<RequestSummary> = {},
): RequestSummary {
  return request({
    id: rootSpan.traceId,
    traceId: rootSpan.traceId,
    name: rootSpan.name,
    method: rootSpan.method ?? 'GET',
    route: rootSpan.route ?? null,
    statusCode: rootSpan.statusCode ?? null,
    durationMs: rootSpan.durationMs,
    timestamp: rootSpan.startTime,
    endTime: rootSpan.endTime,
    ...overrides,
  })
}

describe('diagnostic rule classification', () => {
  it('classifies database, fetch, custom, framework and other spans', () => {
    expect(
      diagnosticSpanCategory(span({ attributes: { 'db.system': 'sqlite' } })),
    ).toBe('database')
    expect(
      diagnosticSpanCategory(
        span({
          kind: 'client',
          nextSpanType: 'AppRender.fetch',
          attributes: { 'http.url': 'https://example.test/api' },
        }),
      ),
    ).toBe('http')
    expect(
      diagnosticSpanCategory(
        span({
          attributes: { 'stacknext.span.kind': 'custom' },
          nextSpanType: undefined,
          kind: 'internal',
          parentSpanId: '2222222222222222',
        }),
      ),
    ).toBe('custom')
    expect(diagnosticSpanCategory(span())).toBe('framework')
    expect(
      diagnosticSpanCategory(
        span({
          kind: 'internal',
          parentSpanId: '2222222222222222',
          nextSpanType: undefined,
        }),
      ),
    ).toBe('other')
  })

  it('selects thresholds by category', () => {
    const diagnostics = config({
      diagnostics: {
        slowSpans: {
          databaseMs: 10,
          httpMs: 20,
          customMs: 30,
          frameworkMs: 40,
          otherMs: 50,
        },
      },
    }).diagnostics
    expect(spanThresholdMs('database', diagnostics)).toBe(10)
    expect(spanThresholdMs('http', diagnostics)).toBe(20)
    expect(spanThresholdMs('custom', diagnostics)).toBe(30)
    expect(spanThresholdMs('framework', diagnostics)).toBe(40)
    expect(spanThresholdMs('other', diagnostics)).toBe(50)
  })
})

describe('possible N+1 queries', () => {
  it('aggregates the same SQL shape across traces by canonical route', () => {
    const traces = [0, 1, 2].map((index) => root(index, '/api/n-plus-one', 320))
    const queries = traces.flatMap((trace, traceIndex) =>
      Array.from({ length: 5 }, (_, queryIndex) =>
        query({
          id: `query-${traceIndex}-${queryIndex}`,
          traceId: trace.traceId,
          resolvedTraceId: trace.traceId,
          spanId: trace.spanId,
          route: undefined,
          sql: `select * from tasks where project_id = ${queryIndex + 1}`,
          timestamp: trace.startTime + queryIndex,
        }),
      ),
    )
    const report = reportFor(
      snapshot({ spans: traces, databaseQueries: queries, requests: traces.map((trace) => requestFor(trace)) }),
    )
    const findings = byRule(report, 'n-plus-one-queries')
    expect(findings).toHaveLength(1)
    const finding = findings[0]!
    expect(finding.status).toBe('possible')
    expect(finding.severity).toBe('warning')
    expect(finding.category).toBe('database')
    expect(finding.route).toBe('/api/n-plus-one')
    expect(finding.affectedTraceCount).toBe(3)
    expect(finding.traceIds).toHaveLength(3)
    expect(finding.title).toContain('15 similar')
    expect(finding.evidence.queries).toHaveLength(5)
    expect(finding.evidence.traces).toHaveLength(3)
    expect(finding.evidence.queries[0]?.sqlFingerprint).toBe(
      'select * from tasks where project_id = ?',
    )
    expect(JSON.stringify(finding)).not.toContain('project_id = 1')
    expect(finding.detail).toContain('cannot confirm')
    expect(finding.limitations.join(' ')).toContain('intentional')
  })

  it('keeps separate routes apart and ignores queries without a request root', () => {
    const first = root(0, '/api/a', 300)
    const second = root(1, '/api/b', 300)
    const queries = [
      ...Array.from({ length: 5 }, (_, index) =>
        query({
          id: `a-${index}`,
          traceId: first.traceId,
          resolvedTraceId: first.traceId,
          spanId: first.spanId,
          route: undefined,
          sql: 'select * from tasks where id = ?',
          timestamp: first.startTime + index,
        }),
      ),
      ...Array.from({ length: 5 }, (_, index) =>
        query({
          id: `b-${index}`,
          traceId: second.traceId,
          resolvedTraceId: second.traceId,
          spanId: second.spanId,
          route: undefined,
          sql: 'select * from tasks where id = ?',
          timestamp: second.startTime + index,
        }),
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        query({
          id: `detached-${index}`,
          traceId: traceIdFor(9),
          resolvedTraceId: traceIdFor(9),
          route: undefined,
          sql: 'select * from detached where id = ?',
        }),
      ),
    ]
    const report = reportFor(
      snapshot({
        spans: [first, second],
        databaseQueries: queries,
        requests: [requestFor(first), requestFor(second)],
      }),
    )
    const findings = byRule(report, 'n-plus-one-queries')
    expect(findings.map((finding) => finding.route).sort()).toEqual(['/api/a', '/api/b'])
    expect(report.notes.join(' ')).not.toContain('detached')
  })

  it('honors repeatedQueryMin and reports full matching counts with capped evidence', () => {
    const trace = root(0, '/api/n-plus-one', 400)
    const below = reportFor(
      snapshot({
        spans: [trace],
        databaseQueries: Array.from({ length: 4 }, (_, index) =>
          query({
            id: `q-${index}`,
            traceId: trace.traceId,
            resolvedTraceId: trace.traceId,
            spanId: trace.spanId,
            route: undefined,
          }),
        ),
        requests: [requestFor(trace)],
      }),
    )
    expect(byRule(below, 'n-plus-one-queries')).toHaveLength(0)

    const report = reportFor(
      snapshot({
        spans: [trace],
        databaseQueries: Array.from({ length: 15 }, (_, index) =>
          query({
            id: `q-${index}`,
            traceId: trace.traceId,
            resolvedTraceId: trace.traceId,
            spanId: trace.spanId,
            route: undefined,
            timestamp: trace.startTime + index,
            sql: `select * from tasks where id = ${index}`,
          }),
        ),
        requests: [requestFor(trace)],
      }),
    )
    const finding = byRule(report, 'n-plus-one-queries')[0]!
    expect(finding.evidence.queries).toHaveLength(10)
    expect(finding.evidence.measurements).toContainEqual({
      label: 'matching queries',
      value: 15,
    })
    expect(finding.evidence.measurements).toContainEqual({
      label: 'matching traces',
      value: 1,
    })
  })
})

describe('slow requests and slow spans', () => {
  it('groups slow requests by method and route and attributes self time', () => {
    const traces = [0, 1, 2].map((index) => root(index, '/api/slow-db', 900 + index * 100))
    const children = traces.map((trace, index) =>
      child(trace, {
        spanId: `dddddddddddddd${index}`,
        durationMs: 850 + index * 100,
      }),
    )
    const report = reportFor(
      snapshot({
        spans: [...traces, ...children],
        requests: traces.map((trace) => requestFor(trace)),
      }),
      { slowRequestMs: 500 },
    )
    const findings = byRule(report, 'slow-request')
    expect(findings).toHaveLength(1)
    const finding = findings[0]!
    expect(finding.route).toBe('/api/slow-db')
    expect(finding.method).toBe('GET')
    expect(finding.affectedTraceCount).toBe(3)
    expect(finding.evidence.contributors.length).toBeGreaterThan(0)
    expect(finding.evidence.contributors[0]?.label).toContain('db.select')
    expect(finding.evidence.traces).toHaveLength(3)
    expect(finding.evidence.measurements).toContainEqual({
      label: 'slow requests',
      value: 3,
    })
    expect(byRule(report, 'slow-span')).toHaveLength(0)
  })

  it('reports slow operations by self time when the request is not slow', () => {
    const traces = [0, 1].map((index) => root(index, '/api/slow-db', 400))
    const children = traces.map((trace, index) =>
      child(trace, {
        spanId: `eeeeeeeeeeeeee${index}`,
        startTime: trace.startTime + 50,
        durationMs: 300,
      }),
    )
    const report = reportFor(
      snapshot({
        spans: [...traces, ...children],
        requests: traces.map((trace) => requestFor(trace)),
      }),
      { slowRequestMs: 500 },
    )
    const findings = byRule(report, 'slow-span')
    expect(findings).toHaveLength(1)
    const finding = findings[0]!
    expect(finding.title).toContain('Slow database operation')
    expect(finding.affectedTraceCount).toBe(2)
    expect(finding.evidence.spans).toHaveLength(2)
    expect(finding.evidence.spans[0]?.selfDurationMs).toBe(300)
    expect(finding.evidence.spans[0]?.nextPhase).toBe('database')
    expect(finding.detail).toContain('request threshold')
    expect(finding.evidence.measurements).toContainEqual({
      label: 'self time',
      value: 300,
      unit: 'ms',
    })
  })

  it('does not treat zero or negative durations as slow', () => {
    const trace = root(0, '/api/test', 0)
    const report = reportFor(
      snapshot({
        spans: [
          trace,
          span({
            traceId: trace.traceId,
            spanId: '0000000000000011',
            parentSpanId: trace.spanId,
            kind: 'internal',
            nextSpanType: undefined,
            attributes: { 'stacknext.span.kind': 'custom' },
            durationMs: 0,
          }),
          span({
            traceId: trace.traceId,
            spanId: '0000000000000002',
            parentSpanId: trace.spanId,
            kind: 'internal',
            nextSpanType: undefined,
            attributes: { 'stacknext.span.kind': 'custom' },
            durationMs: -1,
          }),
        ],
        requests: [requestFor(trace)],
      }),
    )
    expect(byRule(report, 'slow-span')).toHaveLength(0)
  })

  it('uses the configured slow span thresholds', () => {
    const trace = root(0, '/api/custom', 200)
    const custom = child(trace, {
      spanId: 'ffffffffffffffff',
      name: 'custom.work',
      durationMs: 100,
      attributes: { 'stacknext.span.kind': 'custom' },
    })
    const value = snapshot({
      spans: [trace, custom],
      requests: [requestFor(trace)],
    })
    expect(byRule(reportFor(value), 'slow-span')).toHaveLength(0)
    const tuned = config({
      diagnostics: { slowSpans: { customMs: 100 } },
    }).diagnostics
    expect(byRule(reportFor(value, { config: tuned }), 'slow-span')).toHaveLength(1)
  })
})

describe('repeated external HTTP', () => {
  it('aggregates repeated endpoints by route across traces', () => {
    const traces = [0, 1, 2].map((index) => root(index, '/api/repeated-fetch', 250))
    const fetches = traces.flatMap((trace, traceIndex) =>
      [1, 2, 3].map((id, fetchIndex) =>
        span({
          traceId: trace.traceId,
          spanId: `abababababab${traceIndex}${fetchIndex}`,
          parentSpanId: trace.spanId,
          name: `fetch GET https://api.example.test/users/${id}?token=secret`,
          kind: 'client',
          nextSpanType: 'AppRender.fetch',
          route: trace.route,
          method: trace.method,
          statusCode: 200,
          startTime: trace.startTime + 20 + fetchIndex,
          endTime: trace.startTime + 40 + fetchIndex,
          durationMs: 20,
          attributes: {
            'http.url': `https://user:password@api.example.test/users/${id}?token=secret`,
            'http.method': 'GET',
            'next.fetch.cache_status': 'skip',
          },
        }),
      ),
    )
    const report = reportFor(
      snapshot({
        spans: [...traces, ...fetches],
        requests: traces.map((trace) => requestFor(trace)),
      }),
    )
    const findings = byRule(report, 'repeated-external-http')
    expect(findings).toHaveLength(1)
    const finding = findings[0]!
    expect(finding.status).toBe('possible')
    expect(finding.category).toBe('http')
    expect(finding.route).toBe('/api/repeated-fetch')
    expect(finding.affectedTraceCount).toBe(3)
    expect(finding.evidence.spans).toHaveLength(3)
    expect(finding.evidence.traces).toHaveLength(3)
    expect(finding.evidence.measurements).toContainEqual({
      label: 'endpoint',
      value: 'api.example.test/users/:id',
    })
    expect(finding.evidence.measurements).toContainEqual({
      label: 'cache statuses',
      value: 'skip: 9',
    })
    expect(JSON.stringify(finding)).not.toContain('password')
    expect(JSON.stringify(finding)).not.toContain('token=secret')
  })

  it('honors repeatedHttpMin and ignores detached fetch traces', () => {
    const trace = root(0, '/api/repeated-fetch', 250)
    const two = reportFor(
      snapshot({
        spans: [
          trace,
          span({
            traceId: trace.traceId,
            spanId: 'a',
            parentSpanId: trace.spanId,
            name: 'fetch GET https://api.example.test/a',
            kind: 'client',
            nextSpanType: 'AppRender.fetch',
            route: trace.route,
            attributes: { 'http.url': 'https://api.example.test/a' },
          }),
          span({
            traceId: trace.traceId,
            spanId: 'b',
            parentSpanId: trace.spanId,
            name: 'fetch GET https://api.example.test/a',
            kind: 'client',
            nextSpanType: 'AppRender.fetch',
            route: trace.route,
            attributes: { 'http.url': 'https://api.example.test/a' },
          }),
        ],
        requests: [requestFor(trace)],
      }),
    )
    expect(byRule(two, 'repeated-external-http')).toHaveLength(0)

    const detached = root(1, '/api/detached', 200)
    const detachedFetches = [1, 2, 3].map((index) =>
      span({
        traceId: 'dddddddddddddddddddddddddddddddd',
        spanId: `c${index}`,
        name: 'fetch GET https://detached.example.test/data',
        kind: 'client',
        nextSpanType: 'AppRender.fetch',
        route: undefined,
        nextRoute: undefined,
        attributes: { 'http.url': 'https://detached.example.test/data' },
      }),
    )
    const report = reportFor(
      snapshot({
        spans: [detached, ...detachedFetches],
        requests: [requestFor(detached)],
      }),
    )
    expect(byRule(report, 'repeated-external-http')).toHaveLength(0)
    expect(report.sample.tracesWithoutRequestRoot).toBe(1)
    expect(report.notes.join(' ')).toContain('no captured request root')
  })
})

describe('request errors and server responses', () => {
  it('reports a single error with route context and the deepest error span', () => {
    const trace = root(0, '/api/error', 250, { status: 'error', statusCode: 500 })
    const handler = child(trace, {
      spanId: '9999999999999991',
      name: 'route handler',
      durationMs: 200,
      status: 'error',
      nextSpanType: 'AppRouteRouteHandlers.runHandler',
      attributes: {},
    })
    const report = reportFor(
      snapshot({
        spans: [trace, handler],
        requests: [requestFor(trace)],
        errors: [
          error({
            id: 'e1',
            route: '/api/error',
            requestPath: '/api/error',
            traceId: trace.traceId,
            resolvedTraceId: trace.traceId,
            spanId: trace.spanId,
            routeType: 'route',
            renderType: 'dynamic',
            timestamp: trace.startTime + 30,
          }),
        ],
      }),
    )
    const findings = byRule(report, 'error-fingerprint')
    expect(findings).toHaveLength(1)
    const finding = findings[0]!
    expect(finding.affectedTraceCount).toBe(1)
    expect(finding.evidence.spans[0]?.spanId).toBe(handler.spanId)
    expect(finding.evidence.errors[0]?.spanId).toBe(handler.spanId)
    expect(finding.evidence.errors[0]?.routeType).toBe('route')
    expect(finding.evidence.errors[0]?.renderType).toBe('dynamic')
    expect(finding.evidence.errors[0]?.statusCode).toBe(500)
    expect(finding.detail).toContain('renderType=dynamic')
    expect(finding.evidence.traces).toHaveLength(1)
  })

  it('groups repeated errors per route and keeps different routes apart', () => {
    const first = root(0, '/api/error', 200, { status: 'error', statusCode: 500 })
    const second = root(1, '/api/error', 200, { status: 'error', statusCode: 500 })
    const third = root(2, '/api/other-error', 200, { status: 'error', statusCode: 500 })
    const report = reportFor(
      snapshot({
        spans: [first, second, third],
        requests: [requestFor(first), requestFor(second), requestFor(third)],
        errors: [
          error({ id: 'e1', route: '/api/error', traceId: first.traceId, resolvedTraceId: first.traceId }),
          error({ id: 'e2', route: '/api/error', traceId: second.traceId, resolvedTraceId: second.traceId, timestamp: 1_030 }),
          error({ id: 'e3', route: '/api/other-error', traceId: third.traceId, resolvedTraceId: third.traceId }),
        ],
      }),
    )
    const findings = byRule(report, 'error-fingerprint')
    expect(findings).toHaveLength(2)
    const repeated = findings.find((finding) => finding.route === '/api/error')!
    expect(repeated.title).toContain('Repeated request error')
    expect(repeated.affectedTraceCount).toBe(2)
    expect(repeated.evidence.errors).toHaveLength(2)
    expect(repeated.evidence.measurements).toContainEqual({
      label: 'occurrences',
      value: 2,
    })
    expect(repeated.evidence.measurements).toContainEqual({
      label: 'repeated threshold',
      value: 2,
    })
    expect(findings.some((finding) => finding.title.startsWith('Request error:'))).toBe(true)
  })

  it('does not group errors when errorGrouping is disabled', () => {
    const report = reportFor(
      snapshot({
        errors: [
          error({ id: 'e1' }),
          error({ id: 'e2', timestamp: 1_030 }),
        ],
      }),
      { config: config({ diagnostics: { errorGrouping: false } }).diagnostics },
    )
    expect(byRule(report, 'error-fingerprint')).toHaveLength(2)
  })

  it('ignores Next.js control-flow errors and notes them', () => {
    const report = reportFor(
      snapshot({
        errors: [
          error({ id: 'e1', digest: 'NEXT_NOT_FOUND', route: '/missing' }),
          error({ id: 'e2', message: 'NEXT_REDIRECT;replace;/login;307;', route: '/private' }),
        ],
      }),
    )
    expect(byRule(report, 'error-fingerprint')).toHaveLength(0)
    expect(report.sample.ignoredControlFlowErrors).toBe(2)
    expect(report.notes.join(' ')).toContain('control-flow error')
  })

  it('reports 5xx responses without a correlated error record', () => {
    const traces = [0, 1].map((index) =>
      root(index, '/api/server-error', 120, { statusCode: 503, status: 'error' }),
    )
    const report = reportFor(
      snapshot({
        spans: traces,
        requests: traces.map((trace) => requestFor(trace)),
      }),
    )
    const findings = byRule(report, 'server-error-response')
    expect(findings).toHaveLength(1)
    const finding = findings[0]!
    expect(finding.route).toBe('/api/server-error')
    expect(finding.method).toBe('GET')
    expect(finding.affectedTraceCount).toBe(2)
    expect(finding.evidence.measurements).toContainEqual({
      label: 'status code',
      value: 503,
    })
    expect(finding.evidence.errors).toHaveLength(0)
    expect(report.sample.serverErrorsWithoutError).toBe(2)
  })

  it('does not report a 5xx response that already has a correlated error', () => {
    const trace = root(0, '/api/error', 200, { status: 'error', statusCode: 500 })
    const report = reportFor(
      snapshot({
        spans: [trace],
        requests: [requestFor(trace)],
        errors: [
          error({
            id: 'e1',
            route: '/api/error',
            traceId: trace.traceId,
            resolvedTraceId: trace.traceId,
          }),
        ],
      }),
    )
    expect(byRule(report, 'server-error-response')).toHaveLength(0)
    expect(byRule(report, 'error-fingerprint')).toHaveLength(1)
  })
})

describe('report generation', () => {
  it('is deterministic for the same snapshot and options', () => {
    const trace = root(0, '/api/slow', 900)
    const value = snapshot({
      spans: [trace, child(trace, { spanId: 'dddddddddddddd01', durationMs: 800 })],
      requests: [requestFor(trace)],
      errors: [error({ id: 'e1' }), error({ id: 'e2', timestamp: 1_030 })],
    })
    const first = reportFor(value)
    const second = reportFor(value)
    expect(second).toEqual(first)
  })

  it('sorts findings by severity, recency and id', () => {
    const trace = root(0, '/api/test', 900, { startTime: 1_100 })
    const report = reportFor(
      snapshot({
        spans: [trace],
        requests: [requestFor(trace)],
        errors: [error({ id: 'e1' }), error({ id: 'e2', timestamp: 1_030 })],
      }),
    )
    expect(report.findings[0]?.severity).toBe('error')
    const warningIds = report.findings
      .filter((finding) => finding.severity === 'warning')
      .map((finding) => finding.id)
    expect(warningIds).toEqual([...warningIds].sort())
  })

  it('reports counts, sample integrity metadata and bounded notes', () => {
    const trace = root(0, '/api/test', 400)
    const missingParent = child(trace, {
      spanId: 'bbbbbbbbbbbbbb01',
      parentSpanId: 'missing-parent',
      durationMs: 100,
    })
    const detached = span({
      traceId: TRACE_B,
      spanId: 'cccccccccccccc01',
      name: 'fetch GET https://detached.example.test/data',
      kind: 'client',
      nextSpanType: 'AppRender.fetch',
      route: undefined,
      nextRoute: undefined,
      parentSpanId: 'deadbeefdeadbeef',
      attributes: { 'http.url': 'https://detached.example.test/data' },
    })
    const value = snapshot({
      spans: [trace, missingParent, detached],
      errors: [
        error({ id: 'e1', route: '/api/test', traceId: trace.traceId, resolvedTraceId: trace.traceId }),
        error({ id: 'e2', route: '/api/test', traceId: trace.traceId, resolvedTraceId: trace.traceId, timestamp: 1_030 }),
      ],
      databaseQueries: [query({ durationMs: null })],
      requests: [requestFor(trace)],
    })
    const report = reportFor(value)
    expect(report.format).toBe('stacknext-diagnostics')
    expect(report.version).toBe(1)
    expect(report.engineVersion).toBe('0.6.1')
    expect(report.ruleSetVersion).toBe(2)
    expect(report.projectName).toBe('diagnostics-test')
    expect(report.sample).toMatchObject({
      requests: 1,
      requestTraces: 1,
      spans: 3,
      errors: 2,
      databaseQueries: 1,
      connected: true,
      connectedInstances: 1,
      tracesWithoutRequestRoot: 1,
      tracesWithMissingParents: 1,
      ignoredControlFlowErrors: 0,
      serverErrorsWithoutError: 0,
    })
    expect(report.sample.unattributedSpans).toBeGreaterThan(0)
    expect(report.counts).toEqual(countFindings(report.findings))
    expect(report.counts.bySeverity.error).toBe(1)
    expect(report.notes.join(' ')).toContain('no measured duration')
    expect(report.notes.join(' ')).toContain('no captured request root')
    expect(report.notes.join(' ')).toContain('parent is not in the sample')
    expect(report.limitations.join(' ')).toContain('not confirmed root causes')
  })

  it('returns explicit notes for an empty sample and disabled diagnostics', () => {
    const empty = reportFor(snapshot())
    expect(empty.findings).toEqual([])
    expect(empty.notes.join(' ')).toContain('No telemetry')
    expect(empty.counts.total).toBe(0)

    const disabled = config({ diagnostics: { enabled: false } }).diagnostics
    const report = reportFor(
      snapshot({
        errors: [error({ id: 'e1' }), error({ id: 'e2', timestamp: 1_030 })],
      }),
      { config: disabled },
    )
    expect(report.findings).toEqual([])
    expect(report.notes).toEqual(['Diagnostics are disabled by configuration.'])
  })

  it('caps findings at maxFindings and explains the cap', () => {
    const traces = Array.from({ length: 12 }, (_, index) => root(index, `/api/slow-${index}`, 900))
    const limited = config({ diagnostics: { maxFindings: 10 } }).diagnostics
    const report = reportFor(
      snapshot({ spans: traces, requests: traces.map((trace) => requestFor(trace)) }),
      { config: limited },
    )
    expect(report.findings).toHaveLength(10)
    expect(report.notes.join(' ')).toContain('Showing the top 10 of 12 findings')
  })

  it('keeps error messages bounded and sanitizes names and routes', () => {
    const longMessage = 'x'.repeat(2_000)
    const report = reportFor(
      snapshot({
        spans: [root(0, '/api/test', 900)],
        databaseQueries: Array.from({ length: 5 }, (_, index) =>
          query({
            id: `q-${index}`,
            route: '/api/test?token=super-secret-demo-token',
            timestamp: 1_010 + index,
          }),
        ),
        errors: [
          error({
            id: 'e1',
            name: 'Boom token=super-secret-demo-token',
            message: longMessage,
            route: '/api/test?token=super-secret-demo-token',
          }),
          error({
            id: 'e2',
            name: 'Boom token=super-secret-demo-token',
            message: longMessage,
            route: '/api/test?token=super-secret-demo-token',
            timestamp: 1_030,
          }),
        ],
      }),
    )
    const finding = report.findings[0]
    expect(finding?.evidence.errors[0]?.message.length).toBeLessThanOrEqual(601)
    expect(finding?.title).not.toContain('super-secret-demo-token')
    expect(finding?.evidence.errors[0]?.name).not.toContain('super-secret-demo-token')
    expect(finding?.evidence.errors[0]?.route).not.toContain('super-secret-demo-token')
    expect(JSON.stringify(report.findings)).not.toContain('super-secret-demo-token')
  })
})

describe('diagnostic list and detail views', () => {
  function populated(): { snapshot: DiagnosticSnapshot; report: DiagnosticReport } {
    const slow = root(0, '/api/test', 900)
    const slowChild = child(slow, { spanId: 'dddddddddddddd10', durationMs: 800 })
    const repeated = root(1, '/api/other', 150, { traceId: TRACE_B })
    const fetches = [1, 2, 3].map((index) =>
      span({
        traceId: repeated.traceId,
        spanId: `http-${index}`,
        parentSpanId: repeated.spanId,
        name: 'fetch GET https://api.example.test/users?token=secret',
        kind: 'client',
        nextSpanType: 'AppRender.fetch',
        route: repeated.route,
        attributes: { 'http.url': 'https://api.example.test/users?token=secret' },
        startTime: repeated.startTime + index,
      }),
    )
    const value = snapshot({
      spans: [slow, slowChild, repeated, ...fetches],
      errors: [
        error({ id: 'e1', traceId: slow.traceId, resolvedTraceId: slow.traceId }),
        error({ id: 'e2', timestamp: 1_030, traceId: slow.traceId, resolvedTraceId: slow.traceId }),
      ],
      requests: [requestFor(slow), requestFor(repeated)],
    })
    return { snapshot: value, report: reportFor(value) }
  }

  it('filters by category, severity, status, rule, route, trace and time', () => {
    const { report } = populated()
    const database = listDiagnosticFindings(report, { category: 'database' })
    expect(database.items.every((finding) => finding.category === 'database')).toBe(true)
    expect(database.total).toBe(database.items.length)

    const errors = listDiagnosticFindings(report, { severity: 'error' })
    expect(errors.items.every((finding) => finding.severity === 'error')).toBe(true)

    const observed = listDiagnosticFindings(report, { status: 'observed' })
    expect(observed.items.every((finding) => finding.status === 'observed')).toBe(true)

    const rule = listDiagnosticFindings(report, { ruleId: 'repeated-external-http' })
    expect(rule.items).toHaveLength(1)

    const route = listDiagnosticFindings(report, { route: '/api/other' })
    expect(route.items.every((finding) => finding.route?.includes('/api/other'))).toBe(true)

    const trace = listDiagnosticFindings(report, { traceId: TRACE_B })
    expect(trace.items.length).toBeGreaterThan(0)
    expect(trace.items.every((finding) => finding.traceIds.includes(TRACE_B))).toBe(true)

    const recent = listDiagnosticFindings(report, { since: 1_190 })
    expect(recent.items.every((finding) => finding.lastSeen >= 1_190)).toBe(true)

    const old = listDiagnosticFindings(report, { until: 1_040 })
    expect(old.items.every((finding) => finding.firstSeen <= 1_040)).toBe(true)

    const text = listDiagnosticFindings(report, { q: 'repeated' })
    expect(text.items.length).toBeGreaterThan(0)
    expect(text.items.every((finding) =>
      `${finding.title} ${finding.summary} ${finding.detail} ${finding.fingerprint}`
        .toLowerCase()
        .includes('repeated'),
    )).toBe(true)
  })

  it('paginates, clamps limits and counts only the filtered set', () => {
    const { report } = populated()
    const first = listDiagnosticFindings(report, { limit: 1, offset: 0 })
    expect(first.items).toHaveLength(1)
    expect(first.total).toBe(report.findings.length)
    expect(first.counts.total).toBe(report.findings.length)
    expect(first.limit).toBe(1)

    const second = listDiagnosticFindings(report, { limit: 1, offset: 1 })
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id)

    const tooLarge = listDiagnosticFindings(report, { limit: 99_999 })
    expect(tooLarge.limit).toBe(200)

    const tooSmall = listDiagnosticFindings(report, { limit: 0 })
    expect(tooSmall.limit).toBe(1)

    const filtered = listDiagnosticFindings(report, {
      category: 'database',
      limit: 50,
    })
    expect(filtered.counts).toEqual(countFindings(filtered.items))
    expect(filtered.total).toBe(filtered.items.length)
  })

  it('returns a bounded trace context for a finding and null for unknown ids', () => {
    const { snapshot: value, report } = populated()
    const slow = report.findings.find((finding) => finding.ruleId === 'slow-request')!
    const detail = getDiagnosticDetail(report, slow.id, value)
    expect(detail).not.toBeNull()
    expect(detail?.finding.id).toBe(slow.id)
    expect(detail?.trace?.traceId).toBe(slow.traceIds[0])
    expect(detail?.trace?.spans.map((entry) => entry.spanId)).toContain('dddddddddddddd10')
    expect(getDiagnosticDetail(report, 'diag-00000000-00000000', value)).toBeNull()
  })

  it('detects missing parents in related trace evidence', () => {
    const trace = root(0, '/api/test', 900)
    const value = snapshot({
      spans: [
        trace,
        span({
          traceId: trace.traceId,
          spanId: 'slow',
          parentSpanId: 'missing-parent',
          durationMs: 900,
        }),
      ],
      requests: [requestFor(trace)],
    })
    const report = reportFor(value)
    const finding = report.findings.find((entry) => entry.ruleId === 'slow-request')!
    const detail = getDiagnosticDetail(report, finding.id, value)!
    expect(detail.trace?.missingParentSpanIds).toEqual(['missing-parent'])
  })

  it('builds an overview with counts and a bounded top list', () => {
    const { report } = populated()
    const overview = diagnosticOverview(report, 2)
    expect(overview.counts).toEqual(report.counts)
    expect(overview.topFindings).toHaveLength(2)
    expect(overview.limitations).toEqual(report.limitations)
  })
})

describe('review regressions', () => {
  it('filters by full trace membership beyond the evidence cap', () => {
    const traces = Array.from({ length: 60 }, (_, index) => root(index, '/api/slow', 900))
    const report = reportFor(snapshot({ spans: traces, requests: traces.map((trace) => requestFor(trace)) }))
    const finding = byRule(report, 'slow-request')[0]!
    expect(finding.traceIds).toHaveLength(50)
    const omitted = traces.find((trace) => !finding.traceIds.includes(trace.traceId))!
    expect(listDiagnosticFindings(report, { traceId: omitted.traceId }).items).toContain(finding)
  })

  it('counts error records within a trace and reports below-threshold totals', () => {
    const trace = root(0, '/api/test', 120)
    const report = reportFor(snapshot({
      spans: [trace], requests: [requestFor(trace)],
      errors: [1, 2].map((index) => error({ id: `error-${index}`, traceId: trace.traceId, resolvedTraceId: trace.traceId, timestamp: 1_000 + index })),
    }), { config: config({ diagnostics: { errorGroupMin: 3 } }).diagnostics })
    const finding = byRule(report, 'error-fingerprint')[0]!
    expect(finding.evidence.traces?.[0]).toMatchObject({ occurrences: 2, timestamp: 1_002 })
    expect(finding.summary).toContain('2 occurrences on /api/test')
  })

  it('does not attribute queries with missing or detached span IDs', () => {
    const trace = root(0, '/api/test', 120)
    for (const spanId of [undefined, 'missing', 'detached']) {
      const report = reportFor(snapshot({
        spans: [trace, child(trace, { spanId: 'detached', parentSpanId: 'absent' })],
        requests: [requestFor(trace)],
        databaseQueries: Array.from({ length: 8 }, (_, index) => query({ id: `q-${index}`, traceId: trace.traceId, resolvedTraceId: trace.traceId, spanId })),
      }))
      expect(byRule(report, 'n-plus-one-queries')).toHaveLength(0)
    }
  })

  it('uses all matching spans for timestamps within one trace', () => {
    const trace = root(0, '/api/test', 400)
    const spans = [trace, ...[1_010, 1_200].map((startTime, index) => child(trace, {
      spanId: `fetch-${index}`, name: 'fetch GET', nextSpanType: 'AppRender.fetch', kind: 'client',
      startTime, durationMs: 100, attributes: { 'http.url': 'https://example.test/api' },
    }))]
    const report = reportFor(snapshot({ spans, requests: [requestFor(trace)] }), {
      config: config({ diagnostics: { repeatedHttpMin: 2, slowSpans: { httpMs: 10 } } }).diagnostics,
    })
    for (const rule of ['slow-span', 'repeated-external-http'] as const) {
      const finding = byRule(report, rule)[0]!
      expect(finding).toMatchObject({ firstSeen: 1_010, lastSeen: 1_200 })
    }
  })

  it('excludes codes outside 500 through 599 from server error findings and counts', () => {
    const trace = root(0, '/api/test', 120, { statusCode: 600 })
    const report = reportFor(snapshot({ spans: [trace], requests: [requestFor(trace)] }))
    expect(byRule(report, 'server-error-response')).toHaveLength(0)
    expect(report.sample.serverErrorsWithoutError).toBe(0)
  })
})
