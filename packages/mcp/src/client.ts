import type {
  DatabaseFilters,
  DatabaseQueryListItem,
  ErrorDetailResponse,
  ErrorFilters,
  ErrorListResponse,
  OverviewResponse,
  PageResult,
  RequestFilters,
  RequestSummary,
  TraceDetail,
  TraceListResult,
} from '@nextscope/core'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

export class NextScopeApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'NextScopeApiError'
    this.status = status
  }
}

export interface NextScopeApiClientOptions {
  baseUrl: string
  token: string
  timeoutMs?: number
}

function assertLoopback(baseUrl: string): URL {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new Error('Collector URL is not a valid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Collector URL must use HTTP')
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('NextScope only reads from a loopback collector')
  }
  return url
}

function appendNumber(
  params: URLSearchParams,
  key: string,
  value: number | undefined,
): void {
  if (value !== undefined && Number.isFinite(value)) params.set(key, String(value))
}

function appendString(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
): void {
  if (value !== undefined && value !== '') params.set(key, value)
}

/**
 * Read-only client for the local collector HTTP API. It never sends mutation
 * requests and refuses non-loopback hosts.
 */
export class NextScopeApiClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly timeoutMs: number

  constructor(options: NextScopeApiClientOptions) {
    assertLoopback(options.baseUrl)
    if (options.token.length < 16) {
      throw new Error('Collector token is too short')
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.token = options.token
    this.timeoutMs = options.timeoutMs ?? 5_000
  }

  private async get<T>(pathname: string, params?: URLSearchParams): Promise<T> {
    const suffix = params && params.size > 0 ? `?${params.toString()}` : ''
    const response = await fetch(`${this.baseUrl}${pathname}${suffix}`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!response.ok) {
      let message = `Collector responded with HTTP ${response.status}`
      try {
        const payload = (await response.json()) as { error?: string }
        if (payload.error) message = payload.error
      } catch {
        // Keep the status-based message.
      }
      throw new NextScopeApiError(message, response.status)
    }
    return (await response.json()) as T
  }

  async overview(): Promise<OverviewResponse> {
    return this.get<OverviewResponse>('/api/summary')
  }

  async health(): Promise<OverviewResponse['health']> {
    return this.get<OverviewResponse['health']>('/api/health')
  }

  async listRequests(filters: RequestFilters = {}): Promise<PageResult<RequestSummary>> {
    const params = new URLSearchParams()
    appendNumber(params, 'limit', filters.limit)
    appendNumber(params, 'offset', filters.offset)
    appendString(params, 'q', filters.q)
    appendString(params, 'method', filters.method)
    appendString(params, 'status', filters.status)
    if (filters.slow !== undefined) params.set('slow', filters.slow ? '1' : '0')
    appendNumber(params, 'minDuration', filters.minDuration)
    appendString(params, 'sort', filters.sort)
    return this.get<PageResult<RequestSummary>>('/api/requests', params)
  }

  async getRequest(traceId: string): Promise<TraceDetail> {
    return this.get<TraceDetail>(`/api/requests/${encodeURIComponent(traceId)}`)
  }

  async listTraces(filters: RequestFilters = {}): Promise<TraceListResult> {
    const params = new URLSearchParams()
    appendNumber(params, 'limit', filters.limit)
    appendNumber(params, 'offset', filters.offset)
    appendString(params, 'q', filters.q)
    appendString(params, 'sort', filters.sort)
    return this.get<TraceListResult>('/api/traces', params)
  }

  async getTrace(traceId: string): Promise<TraceDetail> {
    return this.get<TraceDetail>(`/api/traces/${encodeURIComponent(traceId)}`)
  }

  async listErrors(filters: ErrorFilters = {}): Promise<ErrorListResponse> {
    const params = new URLSearchParams()
    appendNumber(params, 'limit', filters.limit)
    appendNumber(params, 'offset', filters.offset)
    appendString(params, 'q', filters.q)
    appendString(params, 'route', filters.route)
    appendString(params, 'name', filters.name)
    return this.get<ErrorListResponse>('/api/errors', params)
  }

  async getError(errorId: string): Promise<ErrorDetailResponse> {
    return this.get<ErrorDetailResponse>(`/api/errors/${encodeURIComponent(errorId)}`)
  }

  async listDatabaseQueries(
    filters: DatabaseFilters = {},
  ): Promise<PageResult<DatabaseQueryListItem>> {
    const params = new URLSearchParams()
    appendNumber(params, 'limit', filters.limit)
    appendNumber(params, 'offset', filters.offset)
    appendString(params, 'q', filters.q)
    appendNumber(params, 'minDuration', filters.minDuration)
    appendString(params, 'traceId', filters.traceId)
    appendString(params, 'databaseSystem', filters.databaseSystem)
    return this.get<PageResult<DatabaseQueryListItem>>('/api/database', params)
  }

  async findSlowRequests(options: {
    minDurationMs?: number
    limit?: number
  } = {}): Promise<PageResult<RequestSummary>> {
    return this.listRequests({
      minDuration: options.minDurationMs ?? 500,
      limit: options.limit ?? 20,
      sort: 'slowest',
    })
  }
}
