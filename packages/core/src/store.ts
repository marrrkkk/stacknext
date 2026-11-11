import { normalizeDatabaseQuery, normalizeError, normalizeSpan } from './normalize.js'
import {
  RENDER_SPAN_TYPES,
  REQUEST_ROOT_SPAN_TYPES,
  ROUTE_HANDLER_SPAN_TYPES,
  classifySpanCategory,
  isStandardNextSpanType,
  type StackNextSpanCategory,
} from './framework.js'
import type { CoverageEvidence } from './coverage.js'
import type { DiagnosticSnapshot } from './diagnostics.js'
import type {
  DatabaseFilters,
  DatabaseQueryListItem,
  ErrorFilters,
  ErrorGroup,
  ErrorListItem,
  StackNextDatabaseQuery,
  StackNextError,
  StackNextIngestEnvelope,
  StackNextSpan,
  PageResult,
  RequestFilters,
  RequestStatusClass,
  RequestSummary,
  StoreSummary,
  TraceDetail,
  TraceListResult,
  TraceSummary,
} from './types.js'

export interface TelemetryStoreOptions {
  maxSpans?: number
  retentionMs?: number
  now?: () => number
}

export interface StoreStats {
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

interface TraceBucket {
  traceId: string
  spans: StackNextSpan[]
  errors: StackNextError[]
  queries: StackNextDatabaseQuery[]
  request: RequestSummary | null
}

const HTTP_METHOD_PREFIX = /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\s+/
const MAX_INDEX_CACHE_ENTRIES = 4

function clampLimit(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value) || value === undefined) return fallback
  return Math.min(maximum, Math.max(1, Math.trunc(value)))
}

function statusClass(statusCode: number | null): RequestStatusClass {
  if (statusCode === null) return 'none'
  const bucket = Math.floor(statusCode / 100)
  if (bucket >= 2 && bucket <= 5) return `${bucket}xx` as RequestStatusClass
  return 'none'
}

function includesText(haystack: string | null | undefined, needle: string): boolean {
  return haystack?.toLowerCase().includes(needle) === true
}

function byStartAscending(a: StackNextSpan, b: StackNextSpan): number {
  return a.startTime - b.startTime || a.spanId.localeCompare(b.spanId)
}

function findRequestRoot(spans: StackNextSpan[]): StackNextSpan | undefined {
  return spans
    .filter(
      (span) =>
        span.nextSpanType === 'BaseServer.handleRequest' ||
        (span.kind === 'server' && !span.parentSpanId),
    )
    .sort(byStartAscending)[0]
}

export class TelemetryStore {
  readonly maxSpans: number
  readonly maxErrors: number
  readonly maxDatabaseQueries: number
  readonly retentionMs: number

  private readonly now: () => number
  private readonly spans = new Map<string, StackNextSpan>()
  private readonly spanOrder: string[] = []
  private readonly errors = new Map<string, StackNextError>()
  private readonly errorOrder: string[] = []
  private readonly queries = new Map<string, StackNextDatabaseQuery>()
  private readonly queryOrder: string[] = []

  private spansReceived = 0
  private errorsReceived = 0
  private databaseQueriesReceived = 0
  private droppedCapacity = 0
  private droppedRetention = 0
  private revision = 0

  /**
   * Read-side caches keyed by `revision`. They are never exposed for mutation
   * and are dropped when stored telemetry changes. Internal reads use the
   * default 500 ms threshold while summaries use the configured one, so a
   * bounded number of slow-request variants is retained per revision.
   */
  private indexCache: {
    revision: number
    bySlowRequestMs: Map<
      number,
      {
        buckets: Map<string, TraceBucket>
        requests: Map<string, RequestSummary>
      }
    >
  } = { revision: -1, bySlowRequestMs: new Map() }
  private summaryCache: {
    revision: number
    slowRequestMs: number
    value: StoreSummary
  } | null = null
  private coverageCache: {
    revision: number
    value: CoverageEvidence
  } | null = null

  constructor(options: TelemetryStoreOptions = {}) {
    this.maxSpans = options.maxSpans ?? 5_000
    this.retentionMs = options.retentionMs ?? 600_000
    this.maxErrors = Math.max(100, Math.min(1_000, Math.floor(this.maxSpans / 5)))
    this.maxDatabaseQueries = Math.max(100, Math.min(2_000, Math.floor(this.maxSpans / 2)))
    this.now = options.now ?? Date.now
  }

  ingest(envelope: StackNextIngestEnvelope, receivedAt = this.now()): void {
    this.prune(receivedAt)
    for (const span of envelope.spans) {
      this.insertSpan(normalizeSpan(span, receivedAt))
      this.spansReceived += 1
    }
    for (const error of envelope.errors) {
      this.insertError(normalizeError(error, receivedAt))
      this.errorsReceived += 1
    }
    for (const query of envelope.databaseQueries) {
      this.insertQuery(normalizeDatabaseQuery(query, receivedAt))
      this.databaseQueriesReceived += 1
    }
    const removed = this.enforceCapacity()
    if (
      removed > 0 ||
      envelope.spans.length > 0 ||
      envelope.errors.length > 0 ||
      envelope.databaseQueries.length > 0
    ) {
      this.advanceRevision()
    }
  }

  private advanceRevision(): void {
    this.revision += 1
    this.indexCache = { revision: this.revision, bySlowRequestMs: new Map() }
    this.summaryCache = null
    this.coverageCache = null
  }

  private insertSpan(span: StackNextSpan): void {
    const key = `${span.traceId}:${span.spanId}`
    const existing = this.spans.has(key)
    if (existing) {
      const index = this.spanOrder.indexOf(key)
      if (index >= 0) this.spanOrder.splice(index, 1)
    }
    this.spans.set(key, span)
    this.spanOrder.push(key)
  }

  private insertError(error: StackNextError): void {
    if (this.errors.has(error.id)) return
    this.errors.set(error.id, error)
    this.errorOrder.push(error.id)
  }

  private insertQuery(query: StackNextDatabaseQuery): void {
    if (this.queries.has(query.id)) return
    this.queries.set(query.id, query)
    this.queryOrder.push(query.id)
  }

  /** Monotonic counter that changes whenever stored telemetry changes. */
  get storeRevision(): number {
    return this.revision
  }

  prune(now = this.now()): void {
    const cutoff = now - this.retentionMs
    let removed = 0
    removed += this.trimExpired(this.spanOrder, this.spans, (span) => span.receivedAt, cutoff)
    removed += this.trimExpired(this.errorOrder, this.errors, (error) => error.receivedAt, cutoff)
    removed += this.trimExpired(
      this.queryOrder,
      this.queries,
      (query) => query.receivedAt,
      cutoff,
    )
    if (removed > 0) this.advanceRevision()
  }

  private trimExpired<T>(
    order: string[],
    map: Map<string, T>,
    receivedAt: (value: T) => number,
    cutoff: number,
  ): number {
    let removed = 0
    while (order.length > 0) {
      const key = order[0]
      if (key === undefined) break
      const value = map.get(key)
      if (!value) {
        order.shift()
        continue
      }
      if (receivedAt(value) > cutoff) break
      order.shift()
      map.delete(key)
      this.droppedRetention += 1
      removed += 1
    }
    return removed
  }

  private enforceCapacity(): number {
    let removed = 0
    while (this.spans.size > this.maxSpans && this.spanOrder.length > 0) {
      const key = this.spanOrder.shift()
      if (key !== undefined) {
        this.spans.delete(key)
        this.droppedCapacity += 1
        removed += 1
      }
    }
    while (this.errors.size > this.maxErrors && this.errorOrder.length > 0) {
      const key = this.errorOrder.shift()
      if (key !== undefined) {
        this.errors.delete(key)
        this.droppedCapacity += 1
        removed += 1
      }
    }
    while (
      this.queries.size > this.maxDatabaseQueries &&
      this.queryOrder.length > 0
    ) {
      const key = this.queryOrder.shift()
      if (key !== undefined) {
        this.queries.delete(key)
        this.droppedCapacity += 1
        removed += 1
      }
    }
    return removed
  }

  getStats(): StoreStats {
    return {
      spansReceived: this.spansReceived,
      errorsReceived: this.errorsReceived,
      databaseQueriesReceived: this.databaseQueriesReceived,
      dropped: {
        capacity: this.droppedCapacity,
        retention: this.droppedRetention,
      },
      limits: {
        maxSpans: this.maxSpans,
        maxErrors: this.maxErrors,
        maxDatabaseQueries: this.maxDatabaseQueries,
        retentionMs: this.retentionMs,
      },
    }
  }

  get spanCount(): number {
    return this.spans.size
  }

  get errorCount(): number {
    return this.errors.size
  }

  get databaseQueryCount(): number {
    return this.queries.size
  }

  private spansByTrace(): Map<string, StackNextSpan[]> {
    const map = new Map<string, StackNextSpan[]>()
    for (const span of this.spans.values()) {
      const list = map.get(span.traceId)
      if (list) list.push(span)
      else map.set(span.traceId, [span])
    }
    for (const list of map.values()) list.sort(byStartAscending)
    return map
  }

  private errorsByTrace(): Map<string, StackNextError[]> {
    const map = new Map<string, StackNextError[]>()
    for (const error of this.errors.values()) {
      if (!error.traceId) continue
      const list = map.get(error.traceId)
      if (list) list.push(error)
      else map.set(error.traceId, [error])
    }
    return map
  }

  private queriesByTrace(): Map<string, StackNextDatabaseQuery[]> {
    const map = new Map<string, StackNextDatabaseQuery[]>()
    for (const query of this.queries.values()) {
      if (!query.traceId) continue
      const list = map.get(query.traceId)
      if (list) list.push(query)
      else map.set(query.traceId, [query])
    }
    return map
  }

  private buildRequest(
    traceId: string,
    spans: StackNextSpan[],
    errors: StackNextError[],
    queries: StackNextDatabaseQuery[],
    slowRequestMs: number,
  ): RequestSummary | null {
    const root = findRequestRoot(spans)
    if (!root) return null
    const nameWithoutMethod = root.name.replace(HTTP_METHOD_PREFIX, '')
    const route = root.route ?? (nameWithoutMethod !== root.name ? nameWithoutMethod : null)
    const method = root.method ?? root.name.split(' ', 1)[0]?.toUpperCase() ?? null
    const statusCode = root.statusCode ?? null
    const durationMs = Math.max(0, root.durationMs)
    const errorCount = errors.length
    const failed = (statusCode !== null && statusCode >= 500) || errorCount > 0
    const fetchCount = spans.filter(
      (span) =>
        span.nextSpanType === 'AppRender.fetch' ||
        (span.kind === 'client' && typeof span.attributes['http.url'] === 'string'),
    ).length
    return {
      id: traceId,
      traceId,
      name: root.name,
      method: method ?? null,
      route,
      statusCode,
      statusClass: statusClass(statusCode),
      durationMs,
      timestamp: root.startTime,
      endTime: root.endTime,
      spanCount: spans.length,
      errorCount,
      databaseQueryCount: queries.length,
      fetchCount,
      failed,
      slow: durationMs >= slowRequestMs,
      serviceName: root.serviceName,
    }
  }

  private resolveErrorTrace(
    error: StackNextError,
    requests: Map<string, RequestSummary>,
    spansByTrace: Map<string, StackNextSpan[]>,
  ): string | null {
    if (error.traceId) return error.traceId
    const target = error.requestPath ?? error.route
    if (!target) return null
    let best: { traceId: string; distance: number } | null = null
    for (const request of requests.values()) {
      const routeMatches =
        request.route === target ||
        request.route === error.route ||
        spansByTrace.get(request.traceId)?.some((span) => span.route === target) === true
      if (!routeMatches) continue
      if (error.method && request.method !== error.method) continue
      const distance = Math.abs(request.timestamp - error.timestamp)
      if (distance > 30_000) continue
      if (!best || distance < best.distance) {
        best = { traceId: request.traceId, distance }
      }
    }
    return best?.traceId ?? null
  }

  private traceIndex(slowRequestMs: number): {
    buckets: Map<string, TraceBucket>
    requests: Map<string, RequestSummary>
  } {
    if (this.indexCache.revision !== this.revision) {
      this.indexCache = { revision: this.revision, bySlowRequestMs: new Map() }
    }
    const cached = this.indexCache.bySlowRequestMs.get(slowRequestMs)
    if (cached) {
      // Refresh insertion order so the least recently used variant is evicted.
      this.indexCache.bySlowRequestMs.delete(slowRequestMs)
      this.indexCache.bySlowRequestMs.set(slowRequestMs, cached)
      return cached
    }
    const spansByTrace = this.spansByTrace()
    const errorsByTrace = this.errorsByTrace()
    const queriesByTrace = this.queriesByTrace()
    const traceIds = new Set([
      ...spansByTrace.keys(),
      ...errorsByTrace.keys(),
      ...queriesByTrace.keys(),
    ])
    const buckets = new Map<string, TraceBucket>()
    const requests = new Map<string, RequestSummary>()
    for (const traceId of traceIds) {
      const spans = spansByTrace.get(traceId) ?? []
      const errors = errorsByTrace.get(traceId) ?? []
      const queries = queriesByTrace.get(traceId) ?? []
      const request = this.buildRequest(
        traceId,
        spans,
        errors,
        queries,
        slowRequestMs,
      )
      if (request) requests.set(traceId, request)
      buckets.set(traceId, { traceId, spans, errors, queries, request })
    }
    const entry = { buckets, requests }
    this.indexCache.bySlowRequestMs.set(slowRequestMs, entry)
    while (this.indexCache.bySlowRequestMs.size > MAX_INDEX_CACHE_ENTRIES) {
      const oldest = this.indexCache.bySlowRequestMs.keys().next().value
      if (oldest === undefined) break
      this.indexCache.bySlowRequestMs.delete(oldest)
    }
    return entry
  }

  listRequests(
    filters: RequestFilters = {},
    slowRequestMs = 500,
  ): PageResult<RequestSummary> {
    const page = this.listTracePage({ ...filters, httpOnly: true }, slowRequestMs, true)
    const items = page.items
      .map((trace) => trace.request)
      .filter((request): request is RequestSummary => request !== null)
    return { items, total: page.total, limit: page.limit, offset: page.offset }
  }

  listTraces(filters: RequestFilters = {}, slowRequestMs = 500): TraceListResult {
    return this.listTracePage(filters, slowRequestMs)
  }

  private listTracePage(
    filters: RequestFilters,
    slowRequestMs: number,
    requestDurations = false,
  ): TraceListResult {
    this.prune()
    const { buckets } = this.traceIndex(slowRequestMs)
    const q = filters.q?.trim().toLowerCase()
    const method = filters.method?.trim().toUpperCase()
    const status = filters.status?.trim().toLowerCase()
    const items: TraceSummary[] = []
    for (const bucket of buckets.values()) {
      if (bucket.spans.length === 0 && bucket.errors.length === 0) continue
      const request = bucket.request
      if (filters.httpOnly === true && request === null) continue
      const first = bucket.spans[0]
      const startTime = first?.startTime ?? bucket.errors[0]?.timestamp ?? 0
      const endTime = bucket.spans.reduce(
        (maximum, span) => Math.max(maximum, span.endTime),
        startTime,
      )
      const rootSpan = findRequestRoot(bucket.spans) ?? first
      const summary: TraceSummary = {
        traceId: bucket.traceId,
        rootName: request?.name ?? rootSpan?.name ?? 'Uncorrelated error',
        rootSpanId: rootSpan?.spanId ?? null,
        serviceName: rootSpan?.serviceName ?? request?.serviceName ?? 'unknown',
        startTime,
        endTime,
        durationMs: Math.max(0, endTime - startTime),
        spanCount: bucket.spans.length,
        errorCount: bucket.errors.length,
        databaseQueryCount: bucket.queries.length,
        failed:
          request?.failed === true ||
          bucket.errors.length > 0 ||
          bucket.spans.some((span) => span.status === 'error'),
        request,
      }
      if (q && !(
        includesText(summary.rootName, q) ||
        includesText(summary.traceId, q) ||
        includesText(summary.serviceName, q) ||
        includesText(request?.route, q) ||
        includesText(request?.method, q) ||
        includesText(String(request?.statusCode ?? ''), q)
      )) {
        continue
      }
      if (method && request?.method !== method) continue
      if (status && status !== 'all') {
        if (status === 'error') {
          if (!summary.failed) continue
        } else if (status.includes('xx')) {
          if (request?.statusClass !== status) continue
        } else if (/^\d{3}$/.test(status)) {
          if (request?.statusCode !== Number(status)) continue
        } else {
          continue
        }
      }
      if (filters.slow === true && request?.slow !== true) continue
      if (
        typeof filters.minDuration === 'number' &&
        (requestDurations ? request?.durationMs ?? 0 : summary.durationMs) < filters.minDuration
      ) {
        continue
      }
      items.push(summary)
    }
    const sort = filters.sort ?? 'recent'
    items.sort((a, b) => {
      if (sort === 'slowest') {
        return requestDurations
          ? (b.request?.durationMs ?? 0) - (a.request?.durationMs ?? 0)
          : b.durationMs - a.durationMs
      }
      if (sort === 'oldest') return a.startTime - b.startTime
      return b.startTime - a.startTime
    })
    const total = items.length
    const limit = clampLimit(filters.limit, 50, 200)
    const offset = Math.max(0, Math.trunc(filters.offset ?? 0))
    return { items: items.slice(offset, offset + limit), total, limit, offset }
  }

  getTrace(traceId: string, slowRequestMs = 500): TraceDetail | null {
    this.prune()
    const spans = [...this.spans.values()]
      .filter((span) => span.traceId === traceId)
      .sort(byStartAscending)
    const errors = [...this.errors.values()]
      .filter((error) => error.traceId === traceId)
      .sort((a, b) => a.timestamp - b.timestamp)
    const queries = [...this.queries.values()]
      .filter((query) => query.traceId === traceId)
      .sort((a, b) => a.timestamp - b.timestamp)
    if (spans.length === 0 && errors.length === 0 && queries.length === 0) return null
    const request = this.buildRequest(traceId, spans, errors, queries, slowRequestMs)
    const presentSpanIds = new Set(spans.map((span) => span.spanId))
    const missingParentSpanIds = [
      ...new Set(
        spans
          .map((span) => span.parentSpanId)
          .filter(
            (parent): parent is string =>
              Boolean(parent) && !presentSpanIds.has(parent as string),
          ),
      ),
    ]
    const startTime = spans[0]?.startTime ?? errors[0]?.timestamp ?? 0
    const endTime = spans.reduce((max, span) => Math.max(max, span.endTime), startTime)
    const warnings: TraceDetail['warnings'] = []
    for (const parentSpanId of missingParentSpanIds) {
      warnings.push({
        code: 'missing-parent',
        message: `Parent span ${parentSpanId} is not in this trace. The span may have been dropped, exported late, or originated in another process.`,
        spanId: spans.find((span) => span.parentSpanId === parentSpanId)?.spanId,
      })
    }
    if (queries.some((query) => query.durationMs === null)) {
      warnings.push({
        code: 'unmeasured-query-duration',
        message:
          'One or more database queries have no measured duration. Null durations are never treated as zero.',
      })
    }
    if (request === null && spans.length > 0) {
      warnings.push({
        code: 'no-request-root',
        message:
          'No request-root span was found. Span durations and overlaps do not describe total request time.',
      })
    }
    return {
      traceId,
      request,
      spans,
      errors,
      databaseQueries: queries,
      startTime,
      endTime,
      durationMs: Math.max(0, endTime - startTime),
      missingParentSpanIds,
      warnings,
    }
  }

  listErrors(filters: ErrorFilters = {}): PageResult<ErrorListItem> & { groups: ErrorGroup[] } {
    this.prune()
    const { requests, buckets } = this.traceIndex(500)
    const q = filters.q?.trim().toLowerCase()
    const route = filters.route?.trim().toLowerCase()
    const name = filters.name?.trim().toLowerCase()
    const spansByTrace = new Map(
      [...buckets.entries()].map(([traceId, bucket]) => [traceId, bucket.spans]),
    )
    const allItems: ErrorListItem[] = []
    for (const error of this.errors.values()) {
      const resolvedTraceId = this.resolveErrorTrace(error, requests, spansByTrace)
      allItems.push({ ...error, resolvedTraceId })
    }
    const filtered = allItems.filter((error) => {
      if (q && !(
        includesText(error.message, q) ||
        includesText(error.name, q) ||
        includesText(error.route, q) ||
        includesText(error.digest, q)
      )) return false
      if (route && !includesText(error.route, route) && !includesText(error.requestPath, route)) {
        return false
      }
      if (name && error.name.toLowerCase() !== name) return false
      return true
    })
    filtered.sort((a, b) => b.timestamp - a.timestamp)
    const groups = this.groupErrors(filtered)
    const total = filtered.length
    const limit = clampLimit(filters.limit, 50, 200)
    const offset = Math.max(0, Math.trunc(filters.offset ?? 0))
    return {
      items: filtered.slice(offset, offset + limit),
      total,
      limit,
      offset,
      groups,
    }
  }

  private groupErrors(errors: ErrorListItem[]): ErrorGroup[] {
    const groups = new Map<string, ErrorGroup>()
    for (const error of errors) {
      const existing = groups.get(error.fingerprint)
      if (existing) {
        existing.count += 1
        existing.firstSeen = Math.min(existing.firstSeen, error.timestamp)
        if (error.timestamp > existing.lastSeen) {
          existing.lastSeen = error.timestamp
          existing.latestErrorId = error.id
          existing.traceId = error.resolvedTraceId
        }
      } else {
        groups.set(error.fingerprint, {
          fingerprint: error.fingerprint,
          name: error.name,
          message: error.message,
          route: error.route ?? null,
          count: 1,
          firstSeen: error.timestamp,
          lastSeen: error.timestamp,
          latestErrorId: error.id,
          traceId: error.resolvedTraceId,
        })
      }
    }
    return [...groups.values()].sort((a, b) => b.lastSeen - a.lastSeen)
  }

  getError(id: string, slowRequestMs = 500): {
    error: ErrorListItem
    trace: TraceDetail | null
  } | null {
    this.prune()
    const error = this.errors.get(id)
    if (!error) return null
    const { requests, buckets } = this.traceIndex(slowRequestMs)
    const resolvedTraceId = this.resolveErrorTrace(
      error,
      requests,
      new Map([...buckets.entries()].map(([traceId, bucket]) => [traceId, bucket.spans])),
    )
    return {
      error: { ...error, resolvedTraceId },
      trace: resolvedTraceId ? this.getTrace(resolvedTraceId, slowRequestMs) : null,
    }
  }

  listDatabaseQueries(filters: DatabaseFilters = {}): PageResult<DatabaseQueryListItem> {
    this.prune()
    const { requests } = this.traceIndex(500)
    const q = filters.q?.trim().toLowerCase()
    const traceId = filters.traceId?.trim()
    const databaseSystem = filters.databaseSystem?.trim().toLowerCase()
    const items = [...this.queries.values()]
      .map((query): DatabaseQueryListItem => {
        const resolvedTraceId = query.traceId ?? null
        const request = resolvedTraceId ? requests.get(resolvedTraceId) : undefined
        return {
          ...query,
          resolvedTraceId,
          route: request?.route ?? null,
        }
      })
      .filter((query) => {
        if (traceId && query.resolvedTraceId !== traceId) return false
        if (databaseSystem && query.databaseSystem.toLowerCase() !== databaseSystem) return false
        if (
          typeof filters.minDuration === 'number' &&
          (query.durationMs === null || query.durationMs < filters.minDuration)
        ) {
          return false
        }
        if (q && !(
          includesText(query.sql, q) ||
          includesText(query.databaseSystem, q) ||
          includesText(query.route, q) ||
          includesText(query.errorMessage, q)
        )) {
          return false
        }
        return true
      })
      .sort((a, b) => b.timestamp - a.timestamp)
    const total = items.length
    const limit = clampLimit(filters.limit, 50, 200)
    const offset = Math.max(0, Math.trunc(filters.offset ?? 0))
    return { items: items.slice(offset, offset + limit), total, limit, offset }
  }

  summary(slowRequestMs = 500): StoreSummary {
    this.prune()
    const cached = this.summaryCache
    if (
      cached &&
      cached.revision === this.revision &&
      cached.slowRequestMs === slowRequestMs
    ) {
      return cached.value
    }
    const { buckets } = this.traceIndex(slowRequestMs)
    const requests = [...buckets.values()]
      .map((bucket) => bucket.request)
      .filter((request): request is RequestSummary => request !== null)
    const durations = requests
      .map((request) => request.durationMs)
      .filter((duration): duration is number => duration !== null)
      .sort((a, b) => a - b)
    const avgDurationMs =
      durations.length > 0
        ? Math.round(
            (durations.reduce((sum, duration) => sum + duration, 0) / durations.length) * 10,
          ) / 10
        : null
    const p95Index = durations.length > 0
      ? Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)
      : -1
    const p95DurationMs = p95Index >= 0 ? durations[p95Index] ?? null : null
    const errors = this.listErrors({ limit: 5 })
    const spanList = [...this.spans.values()]
    const eventTimes = [
      ...spanList.map((span) => span.startTime),
      ...[...this.errors.values()].map((error) => error.timestamp),
      ...[...this.queries.values()].map((query) => query.timestamp),
    ]
    const result: StoreSummary = {
      totalRequests: requests.length,
      failedRequests: requests.filter((request) => request.failed).length,
      slowRequests: requests.filter((request) => request.slow).length,
      avgDurationMs,
      p95DurationMs,
      spanCount: this.spans.size,
      errorCount: this.errors.size,
      databaseQueryCount: this.queries.size,
      fetchCount: spanList.filter(
        (span) =>
          span.nextSpanType === 'AppRender.fetch' ||
          (span.kind === 'client' && typeof span.attributes['http.url'] === 'string'),
      ).length,
      slowestRequests: requests
        .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
        .slice(0, 5),
      recentErrors: errors.items,
      firstEventTime: eventTimes.length > 0 ? Math.min(...eventTimes) : null,
      lastEventTime: eventTimes.length > 0 ? Math.max(...eventTimes) : null,
      lastReceivedAt: maxReceivedAt([
        ...spanList,
        ...this.errors.values(),
        ...this.queries.values(),
      ]),
    }
    this.summaryCache = {
      revision: this.revision,
      slowRequestMs,
      value: result,
    }
    return result
  }

  /**
   * Returns the newest error groups, capped at `limit` groups. `listErrors`
   * applies its limit to error rows, not groups, so the groups are sliced here.
   */
  getErrorGroups(limit = 200): ErrorGroup[] {
    const maximum = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0
    if (maximum === 0) return []
    return this.listErrors({ limit: 1 }).groups.slice(0, maximum)
  }

  /**
   * Aggregates evidence for instrumentation coverage. This deliberately reads
   * only the current in-memory retention window and never invents features.
   */
  getCoverageEvidence(): CoverageEvidence {
    this.prune()
    const cached = this.coverageCache
    if (cached && cached.revision === this.revision) return cached.value
    const { requests } = this.traceIndex(500)
    const spanTypes = Object.create(null) as CoverageEvidence['spanTypes']
    const categoryCounts: Record<StackNextSpanCategory, number> = {
      framework: 0,
      app: 0,
      database: 0,
      fetch: 0,
    }
    const querySources: CoverageEvidence['querySources'] = {
      drizzle: 0,
      prisma: 0,
      manual: 0,
    }
    const querySourceLastSeen: CoverageEvidence['querySourceLastSeen'] = {
      drizzle: null,
      prisma: null,
      manual: null,
    }
    const verboseTypes = new Set<string>()
    let firstEventTime: number | null = null
    let lastEventTime: number | null = null
    let spanCount = 0
    let requestRootSpans = 0
    let renderSpans = 0
    let routeHandlerSpans = 0
    let fetchSpans = 0
    let databaseSpans = 0
    let customSpans = 0
    let actionSpans = 0
    let fetchLastSeen: number | null = null
    let customLastSeen: number | null = null
    let actionLastSeen: number | null = null

    const trackTime = (time: number): void => {
      if (firstEventTime === null || time < firstEventTime) firstEventTime = time
      if (lastEventTime === null || time > lastEventTime) lastEventTime = time
    }

    for (const span of this.spans.values()) {
      spanCount += 1
      trackTime(span.startTime)
      const type = span.nextSpanType
      if (type !== undefined && type !== '') {
        const existing = Object.hasOwn(spanTypes, type) ? spanTypes[type] : undefined
        if (existing) {
          existing.count += 1
          existing.lastSeen =
            existing.lastSeen === null
              ? span.startTime
              : Math.max(existing.lastSeen, span.startTime)
        } else {
          spanTypes[type] = { count: 1, lastSeen: span.startTime }
        }
        if (!isStandardNextSpanType(type)) verboseTypes.add(type)
        if (REQUEST_ROOT_SPAN_TYPES.has(type)) requestRootSpans += 1
        if (RENDER_SPAN_TYPES.has(type)) renderSpans += 1
        if (ROUTE_HANDLER_SPAN_TYPES.has(type)) routeHandlerSpans += 1
      }
      const category = classifySpanCategory(span)
      categoryCounts[category] += 1
      if (category === 'fetch') {
        fetchSpans += 1
        fetchLastSeen =
          fetchLastSeen === null
            ? span.startTime
            : Math.max(fetchLastSeen, span.startTime)
      }
      if (category === 'database') databaseSpans += 1
      const manualKind = span.attributes['stacknext.span.kind']
      const isAction = manualKind === 'action'
      const isCustom =
        manualKind === 'custom' || span.attributes['stacknext.manual'] === true
      if (isAction) {
        actionSpans += 1
        actionLastSeen =
          actionLastSeen === null
            ? span.startTime
            : Math.max(actionLastSeen, span.startTime)
      } else if (isCustom) {
        customSpans += 1
        customLastSeen =
          customLastSeen === null
            ? span.startTime
            : Math.max(customLastSeen, span.startTime)
      }
    }

    let errorLastSeen: number | null = null
    for (const error of this.errors.values()) {
      trackTime(error.timestamp)
      errorLastSeen =
        errorLastSeen === null
          ? error.timestamp
          : Math.max(errorLastSeen, error.timestamp)
    }

    let queryLastSeen: number | null = null
    for (const query of this.queries.values()) {
      trackTime(query.timestamp)
      querySources[query.source] += 1
      const previous = querySourceLastSeen[query.source]
      querySourceLastSeen[query.source] =
        previous === null ? query.timestamp : Math.max(previous, query.timestamp)
      queryLastSeen =
        queryLastSeen === null
          ? query.timestamp
          : Math.max(queryLastSeen, query.timestamp)
    }

    const result: CoverageEvidence = {
      sample: {
        firstEventTime,
        lastEventTime,
        spanCount,
        errorCount: this.errors.size,
        databaseQueryCount: this.queries.size,
        requestCount: requests.size,
        retentionMs: this.retentionMs,
        errorLastSeen,
        queryLastSeen,
      },
      spanTypes,
      categoryCounts,
      requestRootSpans,
      renderSpans,
      routeHandlerSpans,
      fetchSpans,
      databaseSpans,
      customSpans,
      actionSpans,
      fetchLastSeen,
      customLastSeen,
      actionLastSeen,
      verboseSpanTypes: [...verboseTypes].sort(),
      querySources,
      querySourceLastSeen,
    }
    this.coverageCache = { revision: this.revision, value: result }
    return result
  }

  /**
   * Returns a consistent, read-only view for the diagnostics engine. The
   * revision lets the collector cache reports without recomputing them on
   * every dashboard poll.
   */
  getDiagnosticSnapshot(slowRequestMs = 500): DiagnosticSnapshot {
    this.prune()
    const { requests, buckets } = this.traceIndex(slowRequestMs)
    const spansByTrace = new Map(
      [...buckets.entries()].map(([traceId, bucket]) => [traceId, bucket.spans]),
    )
    const errors: ErrorListItem[] = []
    for (const error of this.errors.values()) {
      errors.push({
        ...error,
        resolvedTraceId: this.resolveErrorTrace(error, requests, spansByTrace),
      })
    }
    const queries: DatabaseQueryListItem[] = [...this.queries.values()].map((query) => {
      const resolvedTraceId = query.traceId ?? null
      const request = resolvedTraceId ? requests.get(resolvedTraceId) : undefined
      return {
        ...query,
        resolvedTraceId,
        route: request?.route ?? null,
      }
    })
    const spans = [...this.spans.values()].sort(byStartAscending)
    const eventTimes = [
      ...spans.map((span) => span.startTime),
      ...errors.map((error) => error.timestamp),
      ...queries.map((query) => query.timestamp),
    ]
    return {
      revision: this.revision,
      spans,
      errors: errors.sort((a, b) => a.timestamp - b.timestamp),
      databaseQueries: queries.sort((a, b) => a.timestamp - b.timestamp),
      requests: [...requests.values()].sort((a, b) => a.timestamp - b.timestamp),
      firstEventTime: eventTimes.length > 0 ? Math.min(...eventTimes) : null,
      lastEventTime: eventTimes.length > 0 ? Math.max(...eventTimes) : null,
      retentionMs: this.retentionMs,
    }
  }

  exportAll(): {
    spans: StackNextSpan[]
    errors: StackNextError[]
    databaseQueries: StackNextDatabaseQuery[]
    stats: StoreStats
  } {
    this.prune()
    return {
      spans: [...this.spans.values()].sort(byStartAscending),
      errors: [...this.errors.values()].sort((a, b) => a.timestamp - b.timestamp),
      databaseQueries: [...this.queries.values()].sort((a, b) => a.timestamp - b.timestamp),
      stats: this.getStats(),
    }
  }

  clear(): void {
    const hadData =
      this.spans.size > 0 || this.errors.size > 0 || this.queries.size > 0
    this.spans.clear()
    this.spanOrder.length = 0
    this.errors.clear()
    this.errorOrder.length = 0
    this.queries.clear()
    this.queryOrder.length = 0
    if (hadData) this.advanceRevision()
  }

  /**
   * Loads already-normalized records into this store. Used only for detached
   * snapshot views; live ingestion must go through ingest().
   */
  restore(data: {
    spans: StackNextSpan[]
    errors: StackNextError[]
    databaseQueries: StackNextDatabaseQuery[]
  }): void {
    this.clear()
    for (const span of data.spans) {
      this.spans.set(`${span.traceId}:${span.spanId}`, span)
      this.spanOrder.push(`${span.traceId}:${span.spanId}`)
    }
    for (const error of data.errors) {
      if (this.errors.has(error.id)) continue
      this.errors.set(error.id, error)
      this.errorOrder.push(error.id)
    }
    for (const query of data.databaseQueries) {
      if (this.queries.has(query.id)) continue
      this.queries.set(query.id, query)
      this.queryOrder.push(query.id)
    }
    this.spansReceived = data.spans.length
    this.errorsReceived = data.errors.length
    this.databaseQueriesReceived = data.databaseQueries.length
    this.droppedCapacity = 0
    this.droppedRetention = 0
    this.advanceRevision()
  }
}

function maxReceivedAt(events: Array<{ receivedAt: number }>): number | null {
  return events.reduce<number | null>((latest, event) =>
    latest === null ? event.receivedAt : Math.max(latest, event.receivedAt), null)
}
