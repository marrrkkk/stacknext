import { useMemo, useState } from 'react'
import type { PageResult, RequestSummary } from '@stacknext/core'
import { api } from '../api'
import { useAsync, useDebounced } from '../hooks'
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  MethodBadge,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatusCodeBadge,
  Toggle,
} from '../components/ui'
import { Icon } from '../components/Icon'
import { formatDuration, formatRelative } from '../format'

const LIMIT = 50

export function RequestsPage({
  refreshKey,
  onNavigate,
}: {
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const initial = new URLSearchParams(window.location.search)
  const [search, setSearch] = useState(initial.get('q') ?? '')
  const debouncedSearch = useDebounced(search, 300)
  const [method, setMethod] = useState(initial.get('method') ?? '')
  const [status, setStatus] = useState(initial.get('status') ?? '')
  const [slow, setSlow] = useState(initial.get('slow') === '1')
  const [sort, setSort] = useState<'recent' | 'oldest' | 'slowest'>(
    initial.get('sort') === 'slowest'
      ? 'slowest'
      : initial.get('sort') === 'oldest'
        ? 'oldest'
        : 'recent',
  )
  const [offset, setOffset] = useState(0)

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
  const updateSort = (value: 'recent' | 'oldest' | 'slowest'): void => {
    setSort(value)
    setOffset(0)
  }

  const key = useMemo(
    () => JSON.stringify({ debouncedSearch, method, status, slow, sort, offset }),
    [debouncedSearch, method, status, slow, sort, offset],
  )

  const state = useAsync<PageResult<RequestSummary>>(
    (signal) =>
      api.requests(
        {
          limit: LIMIT,
          offset,
          q: debouncedSearch || undefined,
          method: method || undefined,
          status: status || undefined,
          slow: slow || undefined,
          sort,
        },
        signal,
      ),
    key,
    refreshKey,
  )

  const filtersActive = Boolean(debouncedSearch || method || status || slow)

  return (
    <>
      <PageHeader
        eyebrow="Requests"
        title="HTTP requests"
        description="Server requests captured from Next.js root spans, correlated with errors and database queries."
        actions={
          <button type="button" className="button button--ghost" onClick={state.reload}>
            <Icon name="refresh" size={15} /> Refresh
          </button>
        }
      />

      <Card className="toolbar-card">
        <div className="toolbar">
          <SearchInput
            value={search}
            onChange={updateSearch}
            placeholder="Search route, method or trace id…"
            label="Search requests"
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
          <Select
            label="Sort"
            value={sort}
            onChange={(value) => updateSort(value as 'recent' | 'oldest' | 'slowest')}
            options={[
              { value: 'recent', label: 'Newest first' },
              { value: 'oldest', label: 'Oldest first' },
              { value: 'slowest', label: 'Slowest first' },
            ]}
          />
          <Toggle checked={slow} onChange={updateSlow} label="Slow only" />
        </div>
      </Card>

      <Card padded={false}>
        {state.loading && !state.data ? (
          <div className="card__inner">
            <Loading rows={8} />
          </div>
        ) : state.error && !state.data ? (
          <div className="card__inner">
            <ErrorState message={state.error} onRetry={state.reload} />
          </div>
        ) : state.data && state.data.items.length === 0 ? (
          <EmptyState
            icon={filtersActive ? 'search' : 'bolt'}
            title={filtersActive ? 'No requests match these filters' : 'No requests captured yet'}
            description={
              filtersActive
                ? 'Adjust the search, method, status or slow filter.'
                : 'Start the app with StackNext instrumentation, then make a request to see the full trace.'
            }
            action={
              filtersActive ? (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => {
                    setSearch('')
                    setMethod('')
                    setStatus('')
                    setSlow(false)
                    setSort('recent')
                    setOffset(0)
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <code className="inline-code">stacknext dev</code>
              )
            }
          />
        ) : (
          <>
            <table className="table table--requests">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Route</th>
                  <th>Status</th>
                  <th className="numeric">Duration</th>
                  <th className="numeric">Errors</th>
                  <th className="numeric">DB</th>
                  <th className="numeric">Spans</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {state.data?.items.map((request) => (
                  <tr
                    key={request.id}
                    className="row-clickable"
                    tabIndex={0}
                    onClick={() => onNavigate(`/requests/${request.traceId}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onNavigate(`/requests/${request.traceId}`)
                      }
                    }}
                  >
                    <td>
                      <MethodBadge method={request.method} />
                    </td>
                    <td>
                      <div className="route-cell">{request.route ?? request.name}</div>
                      <div className="sub-cell mono">{request.traceId.slice(0, 12)}…</div>
                    </td>
                    <td>
                      <StatusCodeBadge code={request.statusCode} failed={request.failed} />
                    </td>
                    <td className="numeric">
                      <span className={request.slow ? 'duration duration--slow' : 'duration'}>
                        {formatDuration(request.durationMs)}
                      </span>
                    </td>
                    <td className="numeric">
                      {request.errorCount > 0 ? (
                        <Badge tone="bad">{request.errorCount}</Badge>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="numeric">
                      {request.databaseQueryCount > 0 ? (
                        <Badge tone="accent">{request.databaseQueryCount}</Badge>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="numeric muted">{request.spanCount}</td>
                    <td className="muted nowrap">{formatRelative(request.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="card__footer">
              <Pagination
                total={state.data?.total ?? 0}
                limit={LIMIT}
                offset={offset}
                onChange={setOffset}
              />
            </div>
          </>
        )}
      </Card>
    </>
  )
}
