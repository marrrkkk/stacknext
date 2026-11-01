import { normalizeDatabaseQuery, normalizeError, normalizeSpan } from './normalize.js'
import type {
  DatabaseFilters,
  DatabaseQueryListItem,
  ErrorFilters,
  ErrorGroup,
  ErrorListItem,
  NextScopeDatabaseQuery,
  NextScopeError,
  NextScopeIngestEnvelope,
  NextScopeSpan,
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
  spans: NextScopeSpan[]
  errors: NextScopeError[]
  queries: NextScopeDatabaseQuery[]
  request: RequestSummary | null
}

const HTTP_METHOD_PREFIX = /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\s+/

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

function byStartAscending(a: NextScopeSpan, b: NextScopeSpan): number {
  return a.startTime - b.startTime || a.spanId.localeCompare(b.spanId)
}

function findRequestRoot(spans: NextScopeSpan[]): NextScopeSpan | undefined {
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
  private readonly spans = new Map<string, NextScopeSpan>()
  private readonly spanOrder: string[] = []
  private readonly errors = new Map<string, NextScopeError>()
  private readonly errorOrder: string[] = []
  private readonly queries = new Map<string, NextScopeDatabaseQuery>()
  private readonly queryOrder: string[] = []

  private spansReceived = 0
  private errorsReceived = 0
  private databaseQueriesReceived = 0
  private droppedCapacity = 0
  private droppedRetention = 0

  constructor(options: TelemetryStoreOptions = {}) {
    this.maxSpans = options.maxSpans ?? 5_000
    this.retentionMs = options.retentionMs ?? 600_000
    this.maxErrors = Math.max(100, Math.min(1_000, Math.floor(this.maxSpans / 5)))
    this.maxDatabaseQueries = Math.max(100, Math.min(2_000, Math.floor(this.maxSpans / 2)))
    this.now = options.now ?? Date.now
  }

  ingest(envelope: NextScopeIngestEnvelope, receivedAt = this.now()): void {
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
    this.enforceCapacity()
  }

  private insertSpan(span: NextScopeSpan): void {
    const key = `${span.traceId}:${span.spanId}`
    const existing = this.spans.has(key)
    this.spans.set(key, span)
    if (!existing) this.spanOrder.push(key)
  }

  private insertError(error: NextScopeError): void {
    if (this.errors.has(error.id)) return
    this.errors.set(error.id, error)
    this.errorOrder.push(error.id)
  }

  private insertQuery(query: NextScopeDatabaseQuery): void {
    if (this.queries.has(query.id)) return
    this.queries.set(query.id, query)
    this.queryOrder.push(query.id)
  }

  prune(now = this.now()): void {
    const cutoff = now - this.retentionMs
    this.trimExpired(this.spanOrder, this.spans, (span) => span.receivedAt, cutoff)
    this.trimExpired(this.errorOrder, this.errors, (error) => error.receivedAt, cutoff)
    this.trimExpired(
      this.queryOrder,
      this.queries,
      (query) => query.receivedAt,
      cutoff,
    )
  }

  private trimExpired<T>(
    order: string[],
    map: Map<string, T>,
    receivedAt: (value: T) => number,
    cutoff: number,
  ): void {
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
    }
  }

  private enforceCapacity(): void {
    while (this.spans.size > this.maxSpans && this.spanOrder.length > 0) {
      const key = this.spanOrder.shift()
      if (key !== undefined) {
        this.spans.delete(key)
        this.droppedCapacity += 1
      }
    }
    while (this.errors.size > this.maxErrors && this.errorOrder.length > 0) {
      const key = this.errorOrder.shift()
      if (key !== undefined) {
        this.errors.delete(key)
        this.droppedCapacity += 1
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
      }
    }
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

  private spansByTrace(): Map<string, NextScopeSpan[]> {
    const map = new Map<string, NextScopeSpan[]>()
    for (const span of this.spans.values()) {
      const list = map.get(span.traceId)
      if (list) list.push(span)
      else map.set(span.traceId, [span])
    }
    for (const list of map.values()) list.sort(byStartAscending)
    return map
  }

  private errorsByTrace(): Map<string, NextScopeError[]> {
    const map = new Map<string, NextScopeError[]>()
    for (const error of this.errors.values()) {
      if (!error.traceId) continue
      const list = map.get(error.traceId)
      if (list) list.push(error)
      else map.set(error.traceId, [error])
    }
    return map
  }

  private queriesByTrace(): Map<string, NextScopeDatabaseQuery[]> {
    const map = new Map<string, NextScopeDatabaseQuery[]>()
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
    spans: NextScopeSpan[],
    errors: NextScopeError[],
    queries: NextScopeDatabaseQuery[],
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
    error: NextScopeError,
    requests: Map<string, RequestSummary>,
    spansByTrace: Map<string, NextScopeSpan[]>,
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
    return { buckets, requests }
  }

  listRequests(
    filters: RequestFilters = {},
    slowRequestMs = 500,
  ): PageResult<RequestSummary> {
    this.prune()
    const { requests } = this.traceIndex(slowRequestMs)
    const q = filters.q?.trim().toLowerCase()
    const method = filters.method?.trim().toUpperCase()
    const status = filters.status?.trim().toLowerCase()
    const numericStatus = status && /^\d{3}$/.test(status) ? Number(status) : null
    let items = [...requests.values()].filter((request) => {
      if (q && !(
        includesText(request.route, q) ||
        includesText(request.name, q) ||
        includesText(request.method, q) ||
        includesText(request.traceId, q) ||
        includesText(String(request.statusCode ?? ''), q)
      )) {
        return false
      }
      if (method && request.method !== method) return false
      if (status && status !== 'all') {
        if (status === 'error') {
          if (!request.failed) return false
        } else if (numericStatus !== null) {
          if (request.statusCode !== numericStatus) return false
        } else if (!['2xx', '3xx', '4xx', '5xx'].includes(status)) {
          return false
        } else if (request.statusClass !== status) {
          return false
        }
      }
      if (filters.slow === true && !request.slow) return false
      if (
        typeof filters.minDuration === 'number' &&
        request.durationMs !== null &&
        request.durationMs < filters.minDuration
      ) {
        return false
      }
      return true
    })

    const sort = filters.sort ?? 'recent'
    items = items.sort((a, b) => {
      if (sort === 'slowest') return (b.durationMs ?? 0) - (a.durationMs ?? 0)
      if (sort === 'oldest') return a.timestamp - b.timestamp
      return b.timestamp - a.timestamp
    })

    const total = items.length
    const limit = clampLimit(filters.limit, 50, 200)
    const offset = Math.max(0, Math.trunc(filters.offset ?? 0))
    return { items: items.slice(offset, offset + limit), total, limit, offset }
  }

  listTraces(filters: RequestFilters = {}, slowRequestMs = 500): TraceListResult {
    this.prune()
    const { buckets } = this.traceIndex(slowRequestMs)
    const q = filters.q?.trim().toLowerCase()
    const method = filters.method?.trim().toUpperCase()
    const status = filters.status?.trim().toLowerCase()
    const items: TraceSummary[] = []
    for (const bucket of buckets.values()) {
      if (bucket.spans.length === 0 && bucket.errors.length === 0) continue
      const request = bucket.request
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
        includesText(request?.route, q) ||
        includesText(request?.method, q)
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
        }
      }
      if (filters.slow === true && request?.slow !== true) continue
      if (
        typeof filters.minDuration === 'number' &&
        summary.durationMs < filters.minDuration
      ) {
        continue
      }
      items.push(summary)
    }
    const sort = filters.sort ?? 'recent'
    items.sort((a, b) => {
      if (sort === 'slowest') return b.durationMs - a.durationMs
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
    }
  }

  getRequest(traceId: string, slowRequestMs = 500): TraceDetail | null {
    return this.getTrace(traceId, slowRequestMs)
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
    return {
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
    }
  }

  getErrorGroups(limit = 200): ErrorGroup[] {
    const result = this.listErrors({ limit })
    return result.groups
  }

  exportAll(): {
    spans: NextScopeSpan[]
    errors: NextScopeError[]
    databaseQueries: NextScopeDatabaseQuery[]
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
    this.spans.clear()
    this.spanOrder.length = 0
    this.errors.clear()
    this.errorOrder.length = 0
    this.queries.clear()
    this.queryOrder.length = 0
  }
}
