import type {
  DatabaseFilters,
  DatabaseQueryListItem,
  DiagnosticDetailResponse,
  DiagnosticFilters,
  DiagnosticListResponse,
  ErrorDetailResponse,
  ErrorFilters,
  ErrorListResponse,
  OverviewResponse,
  PageResult,
  RequestFilters,
  RequestSummary,
  SnapshotDetailResponse,
  SnapshotListResponse,
  TraceDetail,
  TraceListResult,
} from '@stacknext/core'
import type {
  Baseline,
  BaselineSummary,
  Comparison,
  ComparisonSummaryItem,
  RunSummary,
  TestRun,
} from '@stacknext/regression'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

export class StackNextApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'StackNextApiError'
    this.status = status
  }
}

/**
 * Local, redacted attribution attached to reads. Header values are treated as
 * untrusted labels by the collector: they grant no authority and are capped.
 */
export interface ClientAttribution {
  sessionId?: string
  clientName?: string
  clientVersion?: string
  tool?: string | null
}

export interface StackNextApiClientOptions {
  baseUrl: string
  token: string
  timeoutMs?: number
  /** Mutable so the MCP server can fill in SDK client info after initialize. */
  attribution?: ClientAttribution
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
    throw new Error('StackNext only reads from a loopback collector')
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
export class StackNextApiClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly timeoutMs: number
  private readonly attribution: ClientAttribution

  constructor(options: StackNextApiClientOptions) {
    assertLoopback(options.baseUrl)
    if (options.token.length < 16) {
      throw new Error('Collector token is too short')
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.token = options.token
    this.timeoutMs = options.timeoutMs ?? 5_000
    this.attribution = options.attribution ?? {}
  }

  /**
   * Returns a lightweight view over the same transport with one tool label.
   * Tool callbacks use this instead of changing every client method signature.
   */
  forTool(tool: string): StackNextApiClient {
    return new StackNextApiClient({
      baseUrl: this.baseUrl,
      token: this.token,
      timeoutMs: this.timeoutMs,
      attribution: {
        sessionId: this.attribution.sessionId,
        clientName: this.attribution.clientName,
        clientVersion: this.attribution.clientVersion,
        tool,
      },
    })
  }

  private async get<T>(pathname: string, params?: URLSearchParams): Promise<T> {
    const suffix = params && params.size > 0 ? `?${params.toString()}` : ''
    const url = `${this.baseUrl}${pathname}${suffix}`
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.token}`,
      accept: 'application/json',
    }
    if (this.attribution.sessionId) {
      headers['x-stacknext-agent-session'] = this.attribution.sessionId
    }
    if (this.attribution.clientName) {
      headers['x-stacknext-client'] = this.attribution.clientName
    }
    if (this.attribution.clientVersion) {
      headers['x-stacknext-client-version'] = this.attribution.clientVersion
    }
    // Tool attribution only applies to a real agent session; --check and
    // verifyMcpServer stay completely unattributed.
    if (this.attribution.sessionId && this.attribution.tool) {
      headers['x-stacknext-tool'] = this.attribution.tool
    }
    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      const detail =
        error instanceof Error && error.name === 'TimeoutError'
          ? `The request timed out after ${this.timeoutMs} ms.`
          : error instanceof Error
            ? error.message
            : String(error)
      throw new Error(
        `Cannot reach the StackNext collector at ${this.baseUrl}. Start it with "stacknext dev" in your app directory, then retry. ${detail}`,
      )
    }
    if (!response.ok) {
      let message = `Collector responded with HTTP ${response.status}`
      try {
        const payload = (await response.json()) as { error?: string }
        if (payload.error) message = payload.error
      } catch {
        // Keep the status-based message.
      }
      if (response.status === 401) {
        message =
          'StackNext collector rejected the token. The collector may have restarted; restart the MCP client or pass the current token with --token.'
      } else if (response.status === 403) {
        message = `StackNext collector refused the request: ${message}`
      }
      throw new StackNextApiError(message, response.status)
    }
    try {
      return (await response.json()) as T
    } catch {
      throw new StackNextApiError(
        'StackNext collector returned a response that was not valid JSON.',
        response.status,
      )
    }
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

  async listDiagnostics(filters: DiagnosticFilters = {}): Promise<DiagnosticListResponse> {
    const params = new URLSearchParams()
    appendNumber(params, 'limit', filters.limit)
    appendNumber(params, 'offset', filters.offset)
    appendString(params, 'q', filters.q)
    appendString(params, 'category', filters.category)
    appendString(params, 'severity', filters.severity)
    appendString(params, 'status', filters.status)
    appendString(params, 'ruleId', filters.ruleId)
    appendString(params, 'route', filters.route)
    appendString(params, 'traceId', filters.traceId)
    appendNumber(params, 'since', filters.since)
    appendNumber(params, 'until', filters.until)
    return this.get<DiagnosticListResponse>('/api/diagnostics', params)
  }

  async getDiagnostic(id: string): Promise<DiagnosticDetailResponse> {
    return this.get<DiagnosticDetailResponse>(
      `/api/diagnostics/${encodeURIComponent(id)}`,
    )
  }

  async listTestRuns(options: {
    limit?: number
    offset?: number
  } = {}): Promise<PageResult<RunSummary>> {
    const params = new URLSearchParams()
    appendNumber(params, 'limit', options.limit)
    appendNumber(params, 'offset', options.offset)
    return this.get<PageResult<RunSummary>>('/api/test-runs', params)
  }

  async getTestRun(id: string): Promise<TestRun> {
    return this.get<TestRun>(`/api/test-runs/${encodeURIComponent(id)}`)
  }

  async listBaselines(options: {
    limit?: number
    offset?: number
  } = {}): Promise<PageResult<BaselineSummary>> {
    const params = new URLSearchParams()
    appendNumber(params, 'limit', options.limit)
    appendNumber(params, 'offset', options.offset)
    return this.get<PageResult<BaselineSummary>>('/api/baselines', params)
  }

  async getBaseline(id: string): Promise<Baseline> {
    return this.get<Baseline>(`/api/baselines/${encodeURIComponent(id)}`)
  }

  async listComparisons(options: {
    limit?: number
    offset?: number
  } = {}): Promise<PageResult<ComparisonSummaryItem>> {
    const params = new URLSearchParams()
    appendNumber(params, 'limit', options.limit)
    appendNumber(params, 'offset', options.offset)
    return this.get<PageResult<ComparisonSummaryItem>>('/api/comparisons', params)
  }

  async getComparison(id: string): Promise<Comparison> {
    return this.get<Comparison>(`/api/comparisons/${encodeURIComponent(id)}`)
  }

  async listSnapshots(options: {
    limit?: number
    offset?: number
  } = {}): Promise<SnapshotListResponse> {
    const params = new URLSearchParams()
    appendNumber(params, 'limit', options.limit)
    appendNumber(params, 'offset', options.offset)
    return this.get<SnapshotListResponse>('/api/snapshots', params)
  }

  async getSnapshot(id: string): Promise<SnapshotDetailResponse> {
    return this.get<SnapshotDetailResponse>(`/api/snapshots/${encodeURIComponent(id)}`)
  }

  async getSnapshotTrace(id: string, traceId: string): Promise<TraceDetail> {
    return this.get<TraceDetail>(
      `/api/snapshots/${encodeURIComponent(id)}/traces/${encodeURIComponent(traceId)}`,
    )
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
