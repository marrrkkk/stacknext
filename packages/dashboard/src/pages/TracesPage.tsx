import { useEffect, useMemo, useState } from 'react'
import type { TraceListResult, TraceSummary } from '@stacknext/core'
import { api } from '../api'
import { useAsync, useDebounced } from '../hooks'
import {
  Badge,
  Banner,
  Card,
  EmptyState,
  ErrorState,
  ListTableSkeleton,
  MethodBadge,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatusCodeBadge,
  Toggle,
  type ListTableSkeletonColumn,
} from '../components/ui'
import { Icon } from '../components/Icon'
import {
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelative,
  truncate,
} from '../format'

const LIMIT = 50
const TRACE_ID_LENGTH = 12

type Sort = 'recent' | 'oldest' | 'slowest'
type View = 'all' | 'requests'

const SORT_LABELS: Record<Sort, string> = {
  recent: 'newest first',
  oldest: 'oldest first',
  slowest: 'slowest first',
}

const SORT_OPTIONS: Array<{ value: Sort; label: string }> = [
  { value: 'recent', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'slowest', label: 'Slowest first' },
]

const SKELETON_COLUMNS: ListTableSkeletonColumn[] = [
  {
    key: 'root',
    label: 'Root operation',
    className: 'traces-col--root',
    width: '44%',
    secondaryWidth: '28%',
  },
  {
    key: 'status',
    label: 'Status',
    className: 'traces-col--status',
    width: '26px',
  },
  {
    key: 'service',
    label: 'Service',
    className: 'traces-col--service',
    width: '96px',
  },
  {
    key: 'duration',
    label: 'Duration',
    className: 'list-col--duration numeric',
    width: '44px',
  },
  {
    key: 'errors',
    label: 'Errors',
    className: 'list-col--errors numeric',
    width: '20px',
  },
  {
    key: 'db',
    label: 'DB queries',
    className: 'list-col--db numeric',
    width: '18px',
  },
  {
    key: 'spans',
    label: 'Spans',
    className: 'list-col--spans numeric',
    width: '20px',
  },
  {
    key: 'when',
    label: 'Started',
    className: 'list-col--when numeric',
    width: '40px',
  },
  { key: 'chevron', label: '', className: 'list-col--chevron' },
]

/**
 * Reason phrases are presentation-only tooltips. Unknown codes fall back to a
 * plain status label instead of guessing.
 */
const STATUS_REASONS: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  413: 'Content Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
}

interface FilterState {
  view: View
  search: string
  method: string
  status: string
  slow: boolean
  sort: Sort
  offset: number
}

function readFilters(): FilterState {
  const params = new URLSearchParams(window.location.search)
  const sort = params.get('sort')
  const offset = Number(params.get('offset'))
  return {
    view: params.get('view') === 'requests' ? 'requests' : 'all',
    search: params.get('q') ?? '',
    method: params.get('method') ?? '',
    status: params.get('status') ?? '',
    slow: params.get('slow') === '1',
    sort: sort === 'slowest' ? 'slowest' : sort === 'oldest' ? 'oldest' : 'recent',
    offset: Number.isFinite(offset) && offset > 0 ? Math.trunc(offset) : 0,
  }
}

function statusTitle(trace: TraceSummary): string {
  const request = trace.request
  if (!request) {
    return trace.failed
      ? 'Trace has failed spans but no HTTP request root'
      : 'No HTTP status: this trace has no request root'
  }
  if (request.statusCode === null) {
    return request.failed ? 'Request failed without a status code' : 'No status code captured'
  }
  const reason = STATUS_REASONS[request.statusCode]
  return reason ? `${request.statusCode} ${reason}` : `HTTP status ${request.statusCode}`
}

/** The row tooltip keeps hidden responsive metrics available. */
function traceTitle(trace: TraceSummary, slowThresholdMs: number): string {
  const request = trace.request
  const route = request?.route ?? trace.rootName
  const method = request?.method ?? 'Trace'
  const status = request?.statusCode ?? (trace.failed ? 'failed' : 'unknown')
  const slow = request?.slow
    ? `slow (> ${formatDuration(slowThresholdMs)})`
    : 'not slow'
  const errors = `${formatNumber(trace.errorCount)} ${
    trace.errorCount === 1 ? 'error' : 'errors'
  }`
  const spans = `${formatNumber(trace.spanCount)} ${
    trace.spanCount === 1 ? 'span' : 'spans'
  }`
  const queries = `${formatNumber(trace.databaseQueryCount)} database ${
    trace.databaseQueryCount === 1 ? 'query' : 'queries'
  }`
  return [
    `${method} ${route} — ${trace.serviceName}`,
    `${status} · ${formatDuration(trace.durationMs)} · ${spans} · ${errors}`,
    `${queries} · ${trace.failed ? 'failed' : 'ok'}`,
    `${formatDateTime(trace.startTime)} · ${slow}`,
    trace.traceId,
  ].join(' — ')
}

function TracesTableHead(): React.ReactElement {
  return (
    <thead>
      <tr>
        <th className="traces-col--root" scope="col" title="Method, root operation and trace id">
          Root operation
        </th>
        <th className="traces-col--status" scope="col" title="HTTP status for request traces">
          Status
        </th>
        <th className="traces-col--service" scope="col">
          Service
        </th>
        <th
          className="list-col--duration numeric"
          scope="col"
          title="Trace duration from the first to the last span"
        >
          Duration
        </th>
        <th
          className="list-col--errors numeric"
          scope="col"
          title="Errors correlated to this trace"
        >
          Errors
        </th>
        <th
          className="list-col--db numeric"
          scope="col"
          title="Database queries linked to this trace"
        >
          DB queries
        </th>
        <th className="list-col--spans numeric" scope="col" title="Spans in this trace">
          Spans
        </th>
        <th className="list-col--when numeric" scope="col" title="Trace start time">
          Started
        </th>
        <th className="list-col--chevron" aria-hidden="true" />
      </tr>
    </thead>
  )
}

export function TracesPage({
  refreshKey,
  onNavigate,
  onReplaceUrl,
  slowThresholdMs,
  snapshotId,
}: {
  refreshKey: number
  onNavigate: (path: string) => void
  onReplaceUrl: (path: string) => void
  slowThresholdMs: number
  snapshotId?: string
}): React.ReactElement {
  const [initial] = useState(readFilters)
  const [view, setView] = useState<View>(initial.view)
  const [search, setSearch] = useState(initial.search)
  const debouncedSearch = useDebounced(search, 300)
  const [method, setMethod] = useState(initial.method)
  const [status, setStatus] = useState(initial.status)
  const [slow, setSlow] = useState(initial.slow)
  const [sort, setSort] = useState<Sort>(initial.sort)
  const [offset, setOffset] = useState(initial.offset)

  const updateView = (value: boolean): void => {
    setView(value ? 'requests' : 'all')
    setOffset(0)
  }
  const updateSearch = (value: string): void => {
    setSearch(value)
    setOffset(0)
  }
  const updateMethod = (value: string): void => {
    setMethod(value)
    setOffset(0)
  }
  const updateStatus = (value: string): void => {
    setStatus(value)
    setOffset(0)
  }
  const updateSlow = (value: boolean): void => {
    setSlow(value)
    setOffset(0)
  }
  const updateSort = (value: Sort): void => {
    setSort(value)
    setOffset(0)
  }

  useEffect(() => {
    const params = new URLSearchParams()
    if (view === 'requests') params.set('view', 'requests')
    if (debouncedSearch) params.set('q', debouncedSearch)
    if (method) params.set('method', method)
    if (status) params.set('status', status)
    if (slow) params.set('slow', '1')
    if (sort !== 'recent') params.set('sort', sort)
    if (offset > 0) params.set('offset', String(offset))
    const query = params.toString()
    const next = `${window.location.pathname}${query ? `?${query}` : ''}`
    const current = `${window.location.pathname}${window.location.search}`
    if (next !== current) onReplaceUrl(next)
  }, [view, debouncedSearch, method, status, slow, sort, offset, onReplaceUrl])

  const key = useMemo(
    () => JSON.stringify({ view, debouncedSearch, method, status, slow, sort, offset }),
    [view, debouncedSearch, method, status, slow, sort, offset],
  )

  const state = useAsync<TraceListResult>(
    (signal) => {
      const query = {
        limit: LIMIT,
        offset,
        q: debouncedSearch || undefined,
        method: method || undefined,
        status: status || undefined,
        slow: slow || undefined,
        httpOnly: view === 'requests' ? true : undefined,
        sort,
      }
      return snapshotId
        ? api.snapshotTraces(snapshotId, query, signal)
        : api.traces(query, signal)
    },
    key,
    refreshKey,
  )

  const traces = state.data?.items ?? []
  const basePath = snapshotId ? `/snapshots/${snapshotId}` : ''
  const tracePath = (traceId: string): string => `${basePath}/traces/${traceId}`
  const total = state.data?.total ?? 0
  const filtersActive = Boolean(debouncedSearch || method || status || slow)
  const shownErrors = traces.reduce((sum, trace) => sum + trace.errorCount, 0)
  const shownSpans = traces.reduce((sum, trace) => sum + trace.spanCount, 0)
  const shownSlow = traces.filter((trace) => trace.request?.slow).length
  const itemLabel = view === 'requests' ? 'request' : 'trace'

  const clearFilters = (): void => {
    setSearch('')
    setMethod('')
    setStatus('')
    setSlow(false)
    setOffset(0)
  }
  const clearAll = (): void => {
    clearFilters()
    setView('all')
    setSort('recent')
  }

  const footer = state.data && traces.length > 0
    ? total > LIMIT
      ? (
          <Pagination
            total={total}
            limit={LIMIT}
            offset={offset}
            onChange={setOffset}
          />
        )
      : (
          <>
            <span>
              Showing {formatNumber(traces.length)}{' '}
              {traces.length === 1 ? itemLabel : `${itemLabel}s`} · {SORT_LABELS[sort]}
            </span>
            <span className="nowrap tabular">
              {formatNumber(shownErrors)} {shownErrors === 1 ? 'error' : 'errors'} ·{' '}
              {formatNumber(shownSpans)} {shownSpans === 1 ? 'span' : 'spans'}
              {view === 'requests' && ` · ${formatNumber(shownSlow)} slow`}
            </span>
          </>
        )
    : undefined

  return (
    <div className="list-page">
      <PageHeader
        eyebrow={snapshotId ? 'Snapshot' : 'Traces'}
        eyebrowOnClick={
          snapshotId ? () => onNavigate(`/snapshots/${snapshotId}`) : undefined
        }
        title={view === 'requests' ? 'HTTP requests' : 'Traces'}
        description={
          snapshotId
            ? 'Read-only traces frozen at snapshot time. Filters and timelines work exactly as they did in the live sample.'
            : view === 'requests'
              ? 'Server requests captured from Next.js root spans, with status, duration, errors and database queries.'
              : 'Every captured trace, including traces without a request root. Filter to HTTP requests or inspect the full span tree.'
        }
        actions={
          <button
            type="button"
            className="button button--secondary"
            onClick={state.reload}
            disabled={state.loading}
            aria-busy={state.loading || undefined}
            title="Refresh traces"
          >
            <Icon
              name="refresh"
              size={15}
              className={state.loading ? 'icon-button__spin' : undefined}
            />{' '}
            Refresh
          </button>
        }
      />

      {snapshotId && (
        <Banner tone="accent" icon="layers" title="Saved snapshot">
          This list is read from a frozen local snapshot, not live telemetry. Diagnostics and
          coverage are not available for saved samples.
        </Banner>
      )}

      <div className="list-toolbar" role="group" aria-label="Trace filters">
        <div className="list-toolbar__search">
          <SearchInput
            value={search}
            onChange={updateSearch}
            placeholder={
              view === 'requests'
                ? 'Search route, method or trace id…'
                : 'Search trace, route, service or status…'
            }
            label="Search traces"
          />
        </div>
        <div className="list-toolbar__controls">
          <Toggle
            checked={view === 'requests'}
            onChange={updateView}
            label="HTTP requests only"
          />
          <Select
            label="Method"
            value={method}
            onChange={updateMethod}
            options={[
              { value: '', label: 'All methods' },
              { value: 'GET', label: 'GET' },
              { value: 'POST', label: 'POST' },
              { value: 'PUT', label: 'PUT' },
              { value: 'PATCH', label: 'PATCH' },
              { value: 'DELETE', label: 'DELETE' },
            ]}
          />
          <Select
            label="Status"
            value={status}
            onChange={updateStatus}
            options={[
              { value: '', label: 'All statuses' },
              { value: '2xx', label: '2xx' },
              { value: '3xx', label: '3xx' },
              { value: '4xx', label: '4xx' },
              { value: '5xx', label: '5xx' },
            ]}
          />
          <span className="list-toolbar__sort">
            <span className="list-toolbar__sort-label" aria-hidden="true">
              Sort:
            </span>
            <Select
              label="Sort"
              value={sort}
              onChange={(value) => updateSort(value as Sort)}
              options={SORT_OPTIONS}
            />
          </span>
          <Toggle
            checked={slow}
            onChange={updateSlow}
            label={`Slow only (> ${formatDuration(slowThresholdMs)})`}
          />
        </div>
        <div className="list-toolbar__aside">
          {filtersActive && (
            <button
              type="button"
              className="button button--ghost list-toolbar__clear"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          )}
          {state.data && (
            <span className="list-toolbar__count tabular" aria-live="polite">
              {formatNumber(total)} {total === 1 ? itemLabel : `${itemLabel}s`}
            </span>
          )}
        </div>
      </div>

      <Card padded={false} footer={footer}>
        {state.loading && !state.data ? (
          <ListTableSkeleton
            label="Loading traces"
            columns={SKELETON_COLUMNS}
            tableClassName="traces-table"
          />
        ) : state.error && !state.data ? (
          <div className="card__inner">
            <ErrorState message={state.error} onRetry={state.reload} />
          </div>
        ) : state.data && traces.length === 0 ? (
          <div className="list-state">
            <EmptyState
              icon={filtersActive ? 'search' : view === 'requests' ? 'requests' : 'traces'}
              title={
                filtersActive
                  ? `No ${itemLabel}s match these filters`
                  : snapshotId
                    ? `No ${view === 'requests' ? 'HTTP requests' : 'traces'} in this snapshot`
                    : view === 'requests'
                    ? 'No HTTP requests captured yet'
                    : 'No traces captured yet'
              }
              description={
                filtersActive
                  ? 'Adjust the search, method, status or slow filter.'
                  : snapshotId
                    ? `This snapshot contains no ${view === 'requests' ? 'HTTP requests' : 'traces'}.`
                    : 'Make a request to the app to capture a trace. The first request to a route also includes Next.js compile time. If this stays empty, run "npx stacknext doctor" and check that instrumentation is loaded.'
              }
              action={
                filtersActive ? (
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    onClick={clearAll}
                  >
                    Clear filters
                  </button>
                ) : snapshotId ? (
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    onClick={() => onNavigate(`/snapshots/${snapshotId}`)}
                  >
                    Back to snapshot
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    onClick={() => onNavigate('/diagnostics')}
                  >
                    Check diagnostics
                  </button>
                )
              }
            />
          </div>
        ) : (
          <div
            className="table-scroll"
            role="region"
            aria-label="Traces"
            tabIndex={0}
          >
            <table className="table list-table traces-table">
              <TracesTableHead />
              <tbody>
                {traces.map((trace) => {
                  const request = trace.request
                  const route = request?.route ?? trace.rootName
                  return (
                    <tr
                      key={trace.traceId}
                      className="row-clickable"
                      tabIndex={0}
                      title={traceTitle(trace, slowThresholdMs)}
                      onClick={() => onNavigate(tracePath(trace.traceId))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onNavigate(tracePath(trace.traceId))
                        }
                      }}
                    >
                      <td className="traces-col--root">
                        <div className="traces-request">
                          <span className="traces-request__method">
                            <MethodBadge method={request?.method} />
                          </span>
                          <span className="traces-request__text">
                            <span className="route-cell" title={route}>
                              {route}
                            </span>
                            <span className="sub-cell mono" title={trace.traceId}>
                              {truncate(trace.traceId, TRACE_ID_LENGTH)}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="traces-col--status">
                        <span title={statusTitle(trace)}>
                          <StatusCodeBadge
                            code={request?.statusCode ?? null}
                            failed={trace.failed}
                          />
                        </span>
                      </td>
                      <td className="traces-col--service muted mono">
                        {trace.serviceName}
                      </td>
                      <td className="list-col--duration numeric">
                        <span className="list-duration">
                          <span className="list-duration__slot" aria-hidden="true">
                            {request?.slow && (
                              <span
                                className="list-duration__dot"
                                role="img"
                                title={`Slow (> ${formatDuration(slowThresholdMs)})`}
                                aria-label={`Slow, over ${formatDuration(slowThresholdMs)}`}
                              />
                            )}
                          </span>
                          <span className="duration">
                            {formatDuration(trace.durationMs)}
                          </span>
                        </span>
                      </td>
                      <td className="list-col--errors numeric">
                        {trace.errorCount > 0 ? (
                          <Badge tone="bad">{formatNumber(trace.errorCount)}</Badge>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="list-col--db numeric muted tabular">
                        {formatNumber(trace.databaseQueryCount)}
                      </td>
                      <td className="list-col--spans numeric muted tabular">
                        {formatNumber(trace.spanCount)}
                      </td>
                      <td
                        className="list-col--when numeric muted tabular"
                        title={formatDateTime(trace.startTime)}
                      >
                        <span className="nowrap">
                          {formatRelative(trace.startTime)}
                        </span>
                      </td>
                      <td className="list-col--chevron" aria-hidden="true" />
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
