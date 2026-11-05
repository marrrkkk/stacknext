import { describe, expect, it } from 'vitest'
import { TelemetryStore } from '../src/index.js'
import {
  CHILD_SPAN_ID,
  ROOT_SPAN_ID,
  TRACE_ID,
  databaseQuery,
  envelope,
  errorEvent,
  fetchSpan,
  rootSpan,
} from './fixtures.js'

describe('TelemetryStore', () => {
  it('correlates spans, errors and database queries by trace', () => {
    const store = new TelemetryStore({ now: () => 5_000 })
    store.ingest(envelope(), 5_000)

    const requests = store.listRequests({}, 500)
    expect(requests.total).toBe(1)
    const request = requests.items[0]!
    expect(request.traceId).toBe(TRACE_ID)
    expect(request.method).toBe('GET')
    expect(request.route).toBe('/api/test')
    expect(request.statusCode).toBe(200)
    expect(request.durationMs).toBe(120)
    expect(request.spanCount).toBe(2)
    expect(request.fetchCount).toBe(1)
    expect(request.databaseQueryCount).toBe(1)
    expect(request.errorCount).toBe(1)

    const trace = store.getTrace(TRACE_ID, 500)!
    expect(trace.spans.map((span) => span.spanId)).toEqual([ROOT_SPAN_ID, CHILD_SPAN_ID])
    expect(trace.errors).toHaveLength(1)
    expect(trace.databaseQueries).toHaveLength(1)
    expect(trace.missingParentSpanIds).toEqual([])
  })

  it('keeps parent-child relationships and identifies missing parents', () => {
    const store = new TelemetryStore()
    store.ingest(
      envelope({
        spans: [
          fetchSpan({ parentSpanId: 'aaaaaaaaaaaaaaaa' }),
          rootSpan(),
        ],
        errors: [],
        databaseQueries: [],
      }),
    )
    const trace = store.getTrace(TRACE_ID)!
    expect(trace.spans).toHaveLength(2)
    expect(trace.missingParentSpanIds).toContain('aaaaaaaaaaaaaaaa')
    expect(trace.warnings.map((warning) => warning.code)).toContain('missing-parent')
  })

  it('warns about unmeasured query durations and missing request roots', () => {
    const store = new TelemetryStore()
    store.ingest(
      envelope({
        spans: [fetchSpan()],
        errors: [],
        databaseQueries: [databaseQuery({ durationMs: null })],
      }),
    )
    const trace = store.getTrace(TRACE_ID)!
    expect(trace.request).toBeNull()
    expect(trace.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(['unmeasured-query-duration', 'no-request-root']),
    )
  })

  it('links an error to a request when trace id is absent', () => {
    const store = new TelemetryStore({ now: () => 5_000 })
    store.ingest(
      envelope({
        errors: [
          errorEvent({
            id: 'fallback-error',
            traceId: undefined,
            spanId: undefined,
            timestamp: 1_040,
          }),
        ],
      }),
      5_000,
    )
    const result = store.listErrors({})
    expect(result.items[0]?.resolvedTraceId).toBe(TRACE_ID)
    const detail = store.getError('fallback-error')!
    expect(detail.error.resolvedTraceId).toBe(TRACE_ID)
    expect(detail.trace?.request?.route).toBe('/api/test')
  })

  it('filters requests by text, method, status, duration and sort order', () => {
    const store = new TelemetryStore({ now: () => 5_000 })
    store.ingest(envelope(), 5_000)
    store.ingest(
      {
        ...envelope(),
        spans: [
          rootSpan({
            traceId: 'ffffffffffffffffffffffffffffffff',
            spanId: 'aaaaaaaaaaaaaaaa',
            name: 'POST /api/slow',
            route: '/api/slow',
            method: 'POST',
            statusCode: 500,
            status: 'error',
            startTime: 2_000,
            endTime: 2_900,
            durationMs: 900,
          }),
        ],
        errors: [],
        databaseQueries: [],
      },
      5_000,
    )

    expect(store.listRequests({ q: 'slow' }).total).toBe(1)
    expect(store.listRequests({ method: 'POST' }).items[0]?.route).toBe('/api/slow')
    expect(store.listRequests({ status: '5xx' }).total).toBe(1)
    expect(store.listRequests({ status: 'error' }).total).toBe(2)
    expect(store.listRequests({ slow: true }, 500).total).toBe(1)
    expect(store.listRequests({ minDuration: 500 }).total).toBe(1)
    expect(store.listRequests({ sort: 'slowest' }).items[0]?.durationMs).toBe(900)
    expect(store.listRequests({ limit: 1 }).items).toHaveLength(1)
  })

  it('filters traces to HTTP requests and supports request filters', () => {
    const store = new TelemetryStore({ now: () => 5_000 })
    store.ingest(envelope(), 5_000)
    store.ingest(
      envelope({
        spans: [
          fetchSpan({
            traceId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            spanId: '4444444444444444',
            parentSpanId: '9999999999999999',
          }),
        ],
        errors: [],
        databaseQueries: [],
      }),
      5_000,
    )

    expect(store.listTraces({}).total).toBe(2)
    expect(store.listTraces({ httpOnly: true }).total).toBe(1)
    expect(store.listTraces({ httpOnly: true }).items[0]?.request?.traceId).toBe(TRACE_ID)
    expect(store.listTraces({ q: 'test-app' }).total).toBe(2)
    expect(store.listTraces({ method: 'GET' }).total).toBe(1)
    expect(store.listTraces({ status: '2xx' }).total).toBe(1)
    expect(store.listTraces({ slow: true }, 100).total).toBe(1)
    expect(store.listTraces({ minDuration: 100 }).total).toBe(1)
    expect(store.listRequests({ httpOnly: false }).total).toBe(1)
  })

  it('drops the oldest events when capacity is reached', () => {
    const store = new TelemetryStore({ maxSpans: 2, now: () => 5_000 })
    store.ingest(envelope(), 5_000)
    store.ingest(
      envelope({
        spans: [
          rootSpan({
            traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            spanId: 'bbbbbbbbbbbbbbbb',
            route: '/new',
            startTime: 2_000,
            endTime: 2_010,
          }),
        ],
        errors: [],
        databaseQueries: [],
      }),
      5_000,
    )
    expect(store.spanCount).toBe(2)
    expect(store.getStats().dropped.capacity).toBe(1)
  })

  it('does not pollute object prototypes with hostile span types', () => {
    const store = new TelemetryStore({ now: () => 5_000 })
    store.ingest(
      envelope({
        spans: [rootSpan({ nextSpanType: '__proto__' })],
        errors: [],
        databaseQueries: [],
      }),
      5_000,
    )
    const evidence = store.getCoverageEvidence()
    expect(({} as Record<string, unknown>).count).toBeUndefined()
    expect(Object.hasOwn(evidence.spanTypes, '__proto__')).toBe(true)
    expect(evidence.spanTypes['__proto__']?.count).toBe(1)
  })

  it('keeps retention order correct when an existing span is re-sent', () => {
    let now = 5_000
    const store = new TelemetryStore({ retentionMs: 1_000, now: () => now })
    store.ingest(
      envelope({ spans: [rootSpan()], errors: [], databaseQueries: [] }),
      5_000,
    )
    now = 5_500
    store.ingest(
      envelope({
        spans: [
          rootSpan({
            traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            spanId: 'bbbbbbbbbbbbbbbb',
            route: '/second',
            startTime: 5_500,
            endTime: 5_510,
          }),
        ],
        errors: [],
        databaseQueries: [],
      }),
      5_500,
    )
    now = 5_600
    store.ingest(
      envelope({ spans: [rootSpan()], errors: [], databaseQueries: [] }),
      5_600,
    )
    now = 6_500
    store.prune(6_500)
    expect(store.spanCount).toBe(1)
    expect(store.getTrace(TRACE_ID)?.spans).toHaveLength(1)
    expect(store.getTrace('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBeNull()
  })

  it('expires events after the retention window', () => {
    let now = 5_000
    const store = new TelemetryStore({ retentionMs: 1_000, now: () => now })
    store.ingest(envelope(), now)
    expect(store.spanCount).toBe(2)
    now = 7_000
    expect(store.listRequests({}).total).toBe(0)
    expect(store.errorCount).toBe(0)
    expect(store.databaseQueryCount).toBe(0)
    expect(store.getStats().dropped.retention).toBeGreaterThan(0)
  })

  it('groups repeated errors and keeps the latest occurrence', () => {
    const store = new TelemetryStore({ now: () => 5_000 })
    store.ingest(
      envelope({
        errors: [
          errorEvent({ id: 'e1', timestamp: 1_100 }),
          errorEvent({ id: 'e2', timestamp: 1_200 }),
        ],
      }),
      5_000,
    )
    const result = store.listErrors({})
    expect(result.total).toBe(2)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]).toMatchObject({ count: 2, latestErrorId: 'e2' })
  })

  it('produces summary statistics from real data only', () => {
    const empty = new TelemetryStore().summary()
    expect(empty).toMatchObject({
      totalRequests: 0,
      failedRequests: 0,
      avgDurationMs: null,
      slowestRequests: [],
    })

    const store = new TelemetryStore({ now: () => 5_000 })
    store.ingest(envelope(), 5_000)
    const summary = store.summary(100)
    expect(summary.totalRequests).toBe(1)
    expect(summary.failedRequests).toBe(1)
    expect(summary.slowRequests).toBe(1)
    expect(summary.avgDurationMs).toBe(120)
    expect(summary.slowestRequests[0]?.traceId).toBe(TRACE_ID)
    expect(summary.recentErrors).toHaveLength(1)
  })

  it('filters database queries and excludes parameters', () => {
    const store = new TelemetryStore({ now: () => 5_000 })
    store.ingest(
      envelope({
        databaseQueries: [
          databaseQuery(),
          databaseQuery({
            id: 'query-2',
            sql: 'update users set name = $1',
            durationMs: null,
            databaseSystem: 'sqlite',
            timestamp: 1_200,
          }),
        ],
      }),
      5_000,
    )
    expect(store.listDatabaseQueries({}).total).toBe(2)
    expect(store.listDatabaseQueries({ minDuration: 5 }).total).toBe(1)
    expect(store.listDatabaseQueries({ q: 'update' }).total).toBe(1)
    const query = store.listDatabaseQueries({}).items[0]!
    expect(query.route).toBe('/api/test')
    expect(JSON.stringify(query)).not.toContain('hunter2')
  })

  it('clears data on demand', () => {
    const store = new TelemetryStore()
    store.ingest(envelope())
    store.clear()
    expect(store.spanCount).toBe(0)
    expect(store.errorCount).toBe(0)
  })

  it('tracks a store revision for diagnostic cache invalidation', () => {
    let now = 5_000
    const store = new TelemetryStore({ retentionMs: 1_000, now: () => now })
    expect(store.storeRevision).toBe(0)

    store.ingest(envelope(), now)
    const afterIngest = store.storeRevision
    expect(afterIngest).toBeGreaterThan(0)

    store.getDiagnosticSnapshot()
    expect(store.storeRevision).toBe(afterIngest)

    store.prune(now)
    expect(store.storeRevision).toBe(afterIngest)

    now = 7_000
    store.prune(now)
    expect(store.storeRevision).toBeGreaterThan(afterIngest)

    const beforeClear = store.storeRevision
    store.clear()
    expect(store.storeRevision).toBe(beforeClear)
    store.clear()
    expect(store.storeRevision).toBe(beforeClear)
  })

  it('returns a diagnostic snapshot with resolved routes and trace ids', () => {
    const store = new TelemetryStore({ now: () => 5_000 })
    store.ingest(
      envelope({
        errors: [
          errorEvent({
            id: 'fallback-error',
            traceId: undefined,
            spanId: undefined,
            timestamp: 1_040,
          }),
        ],
      }),
      5_000,
    )
    const snapshot = store.getDiagnosticSnapshot(100)
    expect(snapshot.revision).toBe(store.storeRevision)
    expect(snapshot.spans).toHaveLength(2)
    expect(snapshot.errors).toHaveLength(1)
    expect(snapshot.errors[0]?.resolvedTraceId).toBe(TRACE_ID)
    expect(snapshot.databaseQueries[0]?.resolvedTraceId).toBe(TRACE_ID)
    expect(snapshot.databaseQueries[0]?.route).toBe('/api/test')
    expect(snapshot.requests).toHaveLength(1)
    expect(snapshot.requests[0]?.traceId).toBe(TRACE_ID)
    expect(snapshot.firstEventTime).toBe(1_000)
    expect(snapshot.lastEventTime).toBe(1_040)
    expect(snapshot.retentionMs).toBe(600_000)
  })

  it('increments the revision when capacity evicts old telemetry', () => {
    const store = new TelemetryStore({ maxSpans: 2, now: () => 5_000 })
    store.ingest(envelope(), 5_000)
    const before = store.storeRevision
    store.ingest(
      envelope({
        spans: [
          rootSpan({
            traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            spanId: 'bbbbbbbbbbbbbbbb',
            route: '/new',
            startTime: 2_000,
            endTime: 2_010,
          }),
        ],
        errors: [],
        databaseQueries: [],
      }),
      5_000,
    )
    expect(store.storeRevision).toBeGreaterThan(before)
    expect(store.getStats().dropped.capacity).toBeGreaterThan(0)
  })
})
