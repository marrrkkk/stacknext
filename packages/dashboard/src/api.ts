import type {
  CoverageReport,
  DatabaseQueryListItem,
  DiagnosticCategory,
  DiagnosticDetailResponse,
  DiagnosticListResponse,
  DiagnosticRuleId,
  DiagnosticSeverity,
  DiagnosticStatus,
  ErrorDetailResponse,
  ErrorListResponse,
  HealthResponse,
  StackNextConfig,
  OverviewResponse,
  PageResult,
  RequestSummary,
  SnapshotDetailResponse,
  SnapshotListResponse,
  SnapshotSummary,
  TraceDetail,
  TraceListResult,
} from '@stacknext/core'
import type {
  Baseline,
  BaselineSummary,
  Comparison,
  ComparisonSummaryItem,
  RegressionMetric,
  RunSummary,
  TestRun,
} from '@stacknext/regression'
import { queryShapeId } from './sql'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface ConfigResponse {
  config: StackNextConfig
  projectName: string
  version: string
  limitations: string[]
}

export interface RequestQuery {
  limit?: number
  offset?: number
  q?: string
  method?: string
  status?: string
  slow?: boolean
  minDuration?: number
  httpOnly?: boolean
  sort?: 'recent' | 'oldest' | 'slowest'
}

export interface ErrorQuery {
  limit?: number
  offset?: number
  q?: string
  route?: string
  name?: string
}

export interface DatabaseQuery {
  limit?: number
  offset?: number
  q?: string
  minDuration?: number
  traceId?: string
  databaseSystem?: string
}

export interface DatabaseShapeData {
  shapeId: string
  items: DatabaseQueryListItem[]
  /** Queries returned by the collector across every scanned page. */
  scanned: number
  /** Total queries the collector reports for the unfiltered sample. */
  total: number
  /** True when the store cap was reached before every page was read. */
  truncated: boolean
}

export interface ComparisonMetricRef {
  comparison: ComparisonSummaryItem
  scenarioId: string
  scenarioTitle: string
  metric: RegressionMetric
}

export interface DiagnosticQuery {
  limit?: number
  offset?: number
  q?: string
  category?: DiagnosticCategory
  severity?: DiagnosticSeverity
  status?: DiagnosticStatus
  ruleId?: DiagnosticRuleId
  route?: string
  traceId?: string
  since?: number
  until?: number
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    search.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('accept')) headers.set('accept', 'application/json')
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
    signal,
  })
  if (!response.ok) {
    let message = `Request failed with HTTP ${response.status}`
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload.error) message = payload.error
    } catch {
      // Keep the status message.
    }
    throw new ApiError(message, response.status)
  }
  return (await response.json()) as T
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return requestJson<T>(path, { method: 'GET' }, signal)
}

const DATABASE_PAGE_SIZE = 200
const DATABASE_SCAN_CAP = 2_000

/**
 * The collector has no SQL-shape index, so the detail view pages the existing
 * read API and filters with the same display-only normalization as the list.
 * The store caps queries at 2,000; `truncated` keeps that limitation visible.
 */
async function scanDatabaseShape(
  shapeId: string,
  signal?: AbortSignal,
): Promise<DatabaseShapeData> {
  const items: DatabaseQueryListItem[] = []
  let offset = 0
  let total = 0
  let scanned = 0
  let truncated = false
  while (offset < DATABASE_SCAN_CAP) {
    const page = await api.database({ limit: DATABASE_PAGE_SIZE, offset }, signal)
    total = page.total
    scanned += page.items.length
    for (const item of page.items) {
      if (queryShapeId(item.sql) === shapeId) items.push(item)
    }
    offset += page.items.length
    if (page.items.length === 0 || offset >= page.total) break
    if (offset >= DATABASE_SCAN_CAP) {
      truncated = offset < page.total
      break
    }
  }
  return { shapeId, items, scanned, total, truncated }
}

async function recentComparisonMetrics(
  limit = 4,
  signal?: AbortSignal,
): Promise<ComparisonMetricRef[]> {
  const page = await api.comparisons({ limit }, signal)
  const refs: ComparisonMetricRef[] = []
  for (const comparison of page.items) {
    try {
      const detail = await api.comparison(comparison.id, signal)
      for (const scenario of detail.scenarios) {
        for (const metric of scenario.metrics) {
          if (!metric.key.startsWith('query-duration:')) continue
          refs.push({
            comparison,
            scenarioId: scenario.scenarioId,
            scenarioTitle: scenario.title,
            metric,
          })
        }
      }
    } catch (error) {
      if (signal?.aborted) throw error
    }
  }
  return refs
}

async function diagnosticsForTraces(
  traceIds: string[],
  signal?: AbortSignal,
): Promise<DiagnosticListResponse> {
  const unique = [...new Set(traceIds.filter(Boolean))].slice(0, 8)
  const pages = await Promise.all(
    unique.map((traceId) =>
      api.diagnostics({ traceId, limit: 50 }, signal).catch((error: unknown) => {
        if (signal?.aborted) throw error
        return null
      }),
    ),
  )
  const first = pages.find((page): page is DiagnosticListResponse => page !== null)
  const items = new Map<string, DiagnosticListResponse['items'][number]>()
  for (const page of pages) {
    if (!page) continue
    for (const item of page.items) items.set(item.id, item)
  }
  return {
    items: [...items.values()],
    total: items.size,
    limit: first?.limit ?? 50,
    offset: 0,
    generatedAt: first?.generatedAt ?? Date.now(),
    engineVersion: first?.engineVersion ?? 'unknown',
    ruleSetVersion: first?.ruleSetVersion ?? 0,
    sample: first?.sample ?? {
      firstEventTime: null,
      lastEventTime: null,
      retentionMs: 0,
      requests: 0,
      spans: 0,
      errors: 0,
      databaseQueries: 0,
      connectedInstances: 0,
      connected: false,
    },
    counts: first?.counts ?? {
      total: 0,
      bySeverity: { error: 0, warning: 0, info: 0 },
      byCategory: {
        performance: 0,
        database: 0,
        http: 0,
        errors: 0,
        runtime: 0,
      },
      byStatus: { observed: 0, possible: 0, 'insufficient-evidence': 0 },
    },
    notes: [],
    limitations: first?.limitations ?? [],
  }
}

export const api = {
  health(signal?: AbortSignal): Promise<HealthResponse> {
    return getJson<HealthResponse>('/api/health', signal)
  },
  overview(signal?: AbortSignal): Promise<OverviewResponse> {
    return getJson<OverviewResponse>('/api/summary', signal)
  },
  coverage(signal?: AbortSignal): Promise<CoverageReport> {
    return getJson<CoverageReport>('/api/coverage', signal)
  },
  requests(query: RequestQuery = {}, signal?: AbortSignal): Promise<PageResult<RequestSummary>> {
    return getJson<PageResult<RequestSummary>>(
      `/api/requests${buildQuery({
        limit: query.limit,
        offset: query.offset,
        q: query.q,
        method: query.method,
        status: query.status,
        slow: query.slow,
        minDuration: query.minDuration,
        sort: query.sort,
      })}`,
      signal,
    )
  },
  traces(query: RequestQuery = {}, signal?: AbortSignal): Promise<TraceListResult> {
    return getJson<TraceListResult>(
      `/api/traces${buildQuery({
        limit: query.limit,
        offset: query.offset,
        q: query.q,
        method: query.method,
        status: query.status,
        slow: query.slow,
        minDuration: query.minDuration,
        httpOnly: query.httpOnly,
        sort: query.sort,
      })}`,
      signal,
    )
  },
  trace(traceId: string, signal?: AbortSignal): Promise<TraceDetail> {
    return getJson<TraceDetail>(`/api/traces/${encodeURIComponent(traceId)}`, signal)
  },
  errors(query: ErrorQuery = {}, signal?: AbortSignal): Promise<ErrorListResponse> {
    return getJson<ErrorListResponse>(
      `/api/errors${buildQuery({
        limit: query.limit,
        offset: query.offset,
        q: query.q,
        route: query.route,
        name: query.name,
      })}`,
      signal,
    )
  },
  error(errorId: string, signal?: AbortSignal): Promise<ErrorDetailResponse> {
    return getJson<ErrorDetailResponse>(`/api/errors/${encodeURIComponent(errorId)}`, signal)
  },
  database(
    query: DatabaseQuery = {},
    signal?: AbortSignal,
  ): Promise<PageResult<DatabaseQueryListItem>> {
    return getJson<PageResult<DatabaseQueryListItem>>(
      `/api/database${buildQuery({
        limit: query.limit,
        offset: query.offset,
        q: query.q,
        minDuration: query.minDuration,
        traceId: query.traceId,
        databaseSystem: query.databaseSystem,
      })}`,
      signal,
    )
  },
  databaseShape(shapeId: string, signal?: AbortSignal): Promise<DatabaseShapeData> {
    return scanDatabaseShape(shapeId, signal)
  },
  diagnosticsForTraces(
    traceIds: string[],
    signal?: AbortSignal,
  ): Promise<DiagnosticListResponse> {
    return diagnosticsForTraces(traceIds, signal)
  },
  diagnostics(
    query: DiagnosticQuery = {},
    signal?: AbortSignal,
  ): Promise<DiagnosticListResponse> {
    return getJson<DiagnosticListResponse>(
      `/api/diagnostics${buildQuery({
        limit: query.limit,
        offset: query.offset,
        q: query.q,
        category: query.category,
        severity: query.severity,
        status: query.status,
        ruleId: query.ruleId,
        route: query.route,
        traceId: query.traceId,
        since: query.since,
        until: query.until,
      })}`,
      signal,
    )
  },
  diagnostic(id: string, signal?: AbortSignal): Promise<DiagnosticDetailResponse> {
    return getJson<DiagnosticDetailResponse>(
      `/api/diagnostics/${encodeURIComponent(id)}`,
      signal,
    )
  },
  testRuns(
    query: { limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ): Promise<PageResult<RunSummary>> {
    return getJson<PageResult<RunSummary>>(
      `/api/test-runs${buildQuery({ limit: query.limit, offset: query.offset })}`,
      signal,
    )
  },
  testRun(id: string, signal?: AbortSignal): Promise<TestRun> {
    return getJson<TestRun>(`/api/test-runs/${encodeURIComponent(id)}`, signal)
  },
  baselines(
    query: { limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ): Promise<PageResult<BaselineSummary>> {
    return getJson<PageResult<BaselineSummary>>(
      `/api/baselines${buildQuery({ limit: query.limit, offset: query.offset })}`,
      signal,
    )
  },
  baseline(id: string, signal?: AbortSignal): Promise<Baseline> {
    return getJson<Baseline>(`/api/baselines/${encodeURIComponent(id)}`, signal)
  },
  comparisons(
    query: { limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ): Promise<PageResult<ComparisonSummaryItem>> {
    return getJson<PageResult<ComparisonSummaryItem>>(
      `/api/comparisons${buildQuery({ limit: query.limit, offset: query.offset })}`,
      signal,
    )
  },
  comparison(id: string, signal?: AbortSignal): Promise<Comparison> {
    return getJson<Comparison>(`/api/comparisons/${encodeURIComponent(id)}`, signal)
  },
  recentComparisonMetrics(
    limit = 4,
    signal?: AbortSignal,
  ): Promise<ComparisonMetricRef[]> {
    return recentComparisonMetrics(limit, signal)
  },
  config(signal?: AbortSignal): Promise<ConfigResponse> {
    return getJson<ConfigResponse>('/api/config', signal)
  },
  snapshots(
    query: { limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ): Promise<SnapshotListResponse> {
    return getJson<SnapshotListResponse>(
      `/api/snapshots${buildQuery({ limit: query.limit, offset: query.offset })}`,
      signal,
    )
  },
  snapshot(id: string, signal?: AbortSignal): Promise<SnapshotDetailResponse> {
    return getJson<SnapshotDetailResponse>(
      `/api/snapshots/${encodeURIComponent(id)}`,
      signal,
    )
  },
  snapshotTraces(
    id: string,
    query: RequestQuery = {},
    signal?: AbortSignal,
  ): Promise<TraceListResult> {
    return getJson<TraceListResult>(
      `/api/snapshots/${encodeURIComponent(id)}/traces${buildQuery({
        limit: query.limit,
        offset: query.offset,
        q: query.q,
        method: query.method,
        status: query.status,
        slow: query.slow,
        minDuration: query.minDuration,
        httpOnly: query.httpOnly,
        sort: query.sort,
      })}`,
      signal,
    )
  },
  snapshotTrace(
    id: string,
    traceId: string,
    signal?: AbortSignal,
  ): Promise<TraceDetail> {
    return getJson<TraceDetail>(
      `/api/snapshots/${encodeURIComponent(id)}/traces/${encodeURIComponent(traceId)}`,
      signal,
    )
  },
  snapshotErrors(
    id: string,
    query: ErrorQuery = {},
    signal?: AbortSignal,
  ): Promise<ErrorListResponse> {
    return getJson<ErrorListResponse>(
      `/api/snapshots/${encodeURIComponent(id)}/errors${buildQuery({
        limit: query.limit,
        offset: query.offset,
        q: query.q,
        route: query.route,
        name: query.name,
      })}`,
      signal,
    )
  },
  snapshotError(
    id: string,
    errorId: string,
    signal?: AbortSignal,
  ): Promise<ErrorDetailResponse> {
    return getJson<ErrorDetailResponse>(
      `/api/snapshots/${encodeURIComponent(id)}/errors/${encodeURIComponent(errorId)}`,
      signal,
    )
  },
  snapshotDatabase(
    id: string,
    query: DatabaseQuery = {},
    signal?: AbortSignal,
  ): Promise<PageResult<DatabaseQueryListItem>> {
    return getJson<PageResult<DatabaseQueryListItem>>(
      `/api/snapshots/${encodeURIComponent(id)}/database${buildQuery({
        limit: query.limit,
        offset: query.offset,
        q: query.q,
        minDuration: query.minDuration,
        traceId: query.traceId,
        databaseSystem: query.databaseSystem,
      })}`,
      signal,
    )
  },
  saveSnapshot(label?: string, signal?: AbortSignal): Promise<SnapshotSummary> {
    return requestJson<{ snapshot: SnapshotSummary }>(
      '/api/snapshots',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(label ? { label } : {}),
      },
      signal,
    ).then((payload) => payload.snapshot)
  },
  deleteSnapshot(id: string, signal?: AbortSignal): Promise<void> {
    return requestJson<{ deleted: boolean }>(
      `/api/snapshots/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      signal,
    ).then(() => undefined)
  },
  snapshotExportUrl(id: string): string {
    return `/api/snapshots/${encodeURIComponent(id)}/export`
  },
}
