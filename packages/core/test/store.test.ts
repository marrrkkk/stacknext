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
})
