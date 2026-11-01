import type {
  DatabaseQueryListItem,
  ErrorDetailResponse,
  ErrorListResponse,
  HealthResponse,
  NextScopeConfig,
  OverviewResponse,
  PageResult,
  RequestSummary,
  TraceDetail,
  TraceListResult,
} from '@nextscope/core'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface ConfigResponse {
  config: NextScopeConfig
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

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    search.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    headers: { accept: 'application/json' },
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

export const api = {
  health(signal?: AbortSignal): Promise<HealthResponse> {
    return getJson<HealthResponse>('/api/health', signal)
  },
  overview(signal?: AbortSignal): Promise<OverviewResponse> {
    return getJson<OverviewResponse>('/api/summary', signal)
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
  request(traceId: string, signal?: AbortSignal): Promise<TraceDetail> {
    return getJson<TraceDetail>(`/api/requests/${encodeURIComponent(traceId)}`, signal)
  },
  traces(query: RequestQuery = {}, signal?: AbortSignal): Promise<TraceListResult> {
    return getJson<TraceListResult>(
      `/api/traces${buildQuery({
        limit: query.limit,
        offset: query.offset,
        q: query.q,
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
  config(signal?: AbortSignal): Promise<ConfigResponse> {
    return getJson<ConfigResponse>('/api/config', signal)
  },
}
