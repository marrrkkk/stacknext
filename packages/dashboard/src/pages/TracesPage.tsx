import { useMemo, useState } from 'react'
import type { TraceListResult } from '@stacknext/core'
import { api } from '../api'
import { useAsync, useDebounced } from '../hooks'
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
} from '../components/ui'
import { Icon } from '../components/Icon'
import { formatDateTime, formatDuration, formatRelative } from '../format'

const LIMIT = 50

export function TracesPage({
  refreshKey,
  onNavigate,
}: {
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [sort, setSort] = useState<'recent' | 'oldest' | 'slowest'>('recent')
  const [offset, setOffset] = useState(0)

  const updateSearch = (value: string): void => {
    setSearch(value)
    setOffset(0)
  }
  const updateSort = (value: 'recent' | 'oldest' | 'slowest'): void => {
    setSort(value)
    setOffset(0)
  }

  const key = useMemo(
    () => JSON.stringify({ debouncedSearch, sort, offset }),
    [debouncedSearch, sort, offset],
  )
  const state = useAsync<TraceListResult>(
    (signal) =>
      api.traces(
        {
          limit: LIMIT,
          offset,
          q: debouncedSearch || undefined,
          sort,
        },
        signal,
      ),
    key,
    refreshKey,
  )

  return (
    <>
      <PageHeader
        eyebrow="Traces"
        title="Distributed traces"
        description="Every request trace with its root operation, duration and correlated errors."
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
            placeholder="Search trace, route or service…"
            label="Search traces"
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
            icon="traces"
            title={debouncedSearch ? 'No traces match this search' : 'No traces captured yet'}
            description={
              debouncedSearch
                ? 'Try a different route, service name or trace id.'
                : 'Traces are built from Next.js server spans and appear after the first request.'
            }
            action={
              debouncedSearch ? (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => {
                    setSearch('')
                    setOffset(0)
                  }}
                >
                  Clear search
                </button>
              ) : (
                <code className="inline-code">stacknext dev</code>
              )
            }
          />
        ) : (
          <>
            <table className="table table--traces">
              <thead>
                <tr>
                  <th>Root operation</th>
                  <th>Service</th>
                  <th className="numeric">Duration</th>
                  <th className="numeric">Spans</th>
                  <th className="numeric">Errors</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {state.data?.items.map((trace) => (
                  <tr
                    key={trace.traceId}
                    className="row-clickable"
                    tabIndex={0}
                    onClick={() => onNavigate(`/traces/${trace.traceId}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onNavigate(`/traces/${trace.traceId}`)
                      }
                    }}
                  >
                    <td>
                      <div className="route-cell">{trace.rootName}</div>
                      <div className="sub-cell mono">{trace.traceId.slice(0, 12)}…</div>
                    </td>
                    <td className="muted">{trace.serviceName}</td>
                    <td className="numeric">
                      <span className="duration">{formatDuration(trace.durationMs)}</span>
                    </td>
                    <td className="numeric muted">{trace.spanCount}</td>
                    <td className="numeric">
                      {trace.errorCount > 0 ? (
                        <Badge tone="bad">{trace.errorCount}</Badge>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="muted nowrap" title={formatDateTime(trace.startTime)}>
                      {formatRelative(trace.startTime)}
                    </td>
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
