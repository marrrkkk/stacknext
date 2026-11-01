import { useMemo, useState } from 'react'
import type { DatabaseQueryListItem, PageResult } from '@nextscope/core'
import { api } from '../api'
import { useAsync, useDebounced } from '../hooks'
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  JsonView,
  Loading,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
} from '../components/ui'
import { Icon } from '../components/Icon'
import { formatDuration, formatRelative, sqlPreview } from '../format'

const LIMIT = 50

export function DatabasePage({
  refreshKey,
  onNavigate,
}: {
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const initial = new URLSearchParams(window.location.search)
  const [traceId, setTraceId] = useState(initial.get('traceId') ?? '')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [system, setSystem] = useState('')
  const [minDuration, setMinDuration] = useState('')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<DatabaseQueryListItem | null>(null)

  const updateSearch = (value: string): void => {
    setSearch(value)
    setOffset(0)
  }
  const updateSystem = (value: string): void => {
    setSystem(value)
    setOffset(0)
  }
  const updateMinDuration = (value: string): void => {
    setMinDuration(value)
    setOffset(0)
  }
  const clearTraceId = (): void => {
    setTraceId('')
    setOffset(0)
  }

  const key = useMemo(
    () => JSON.stringify({ debouncedSearch, system, minDuration, traceId, offset }),
    [debouncedSearch, system, minDuration, traceId, offset],
  )
  const state = useAsync<PageResult<DatabaseQueryListItem>>(
    (signal) =>
      api.database(
        {
          limit: LIMIT,
          offset,
          q: debouncedSearch || undefined,
          databaseSystem: system || undefined,
          minDuration: minDuration ? Number(minDuration) : undefined,
          traceId: traceId || undefined,
        },
        signal,
      ),
    key,
    refreshKey,
  )

  const filtersActive = Boolean(debouncedSearch || system || minDuration || traceId)

  return (
    <>
      <PageHeader
        eyebrow="Database"
        title="Queries"
        description="Redacted SQL captured by the Drizzle or Prisma adapters, correlated to request traces."
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
            placeholder="Search SQL…"
            label="Search queries"
          />
          <Select
            label="Database system"
            value={system}
            onChange={updateSystem}
            options={[
              { value: '', label: 'All systems' },
              { value: 'sqlite', label: 'SQLite' },
              { value: 'postgresql', label: 'PostgreSQL' },
              { value: 'mysql', label: 'MySQL' },
              { value: 'prisma', label: 'Prisma' },
              { value: 'sql', label: 'SQL' },
            ]}
          />
          <Select
            label="Minimum duration"
            value={minDuration}
            onChange={updateMinDuration}
            options={[
              { value: '', label: 'Any duration' },
              { value: '10', label: '≥ 10 ms' },
              { value: '50', label: '≥ 50 ms' },
              { value: '100', label: '≥ 100 ms' },
              { value: '500', label: '≥ 500 ms' },
            ]}
          />
          {traceId && (
            <button type="button" className="filter-chip" onClick={clearTraceId}>
              trace {traceId.slice(0, 10)}… <Icon name="close" size={12} />
            </button>
          )}
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
            icon="database"
            title={filtersActive ? 'No queries match these filters' : 'No database queries captured'}
            description={
              filtersActive ? (
                'Adjust the search, database system or duration filter.'
              ) : (
                <>
                  Add <code>createNextScopeDrizzleLogger()</code> to drizzle or call{' '}
                  <code>instrumentPrismaClient(prisma)</code> in a server-only module.
                </>
              )
            }
            action={
              filtersActive ? (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => {
                    setSearch('')
                    setSystem('')
                    setMinDuration('')
                    setTraceId('')
                    setOffset(0)
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <button type="button" className="button button--ghost" onClick={() => onNavigate('/settings')}>
                  Adapter setup
                </button>
              )
            }
          />
        ) : (
          <>
            <table className="table table--database">
              <thead>
                <tr>
                  <th>SQL</th>
                  <th>System</th>
                  <th>Operation</th>
                  <th className="numeric">Duration</th>
                  <th>Trace</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {state.data?.items.map((query) => (
                  <tr
                    key={query.id}
                    className={selected?.id === query.id ? 'row-clickable row-selected' : 'row-clickable'}
                    tabIndex={0}
                    onClick={() => setSelected(query)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelected(query)
                      }
                    }}
                  >
                    <td>
                      <code className="sql" title={query.sql}>
                        {sqlPreview(query.sql, 80)}
                      </code>
                    </td>
                    <td>
                      <Badge tone="accent">{query.databaseSystem}</Badge>
                    </td>
                    <td className="muted">{query.operation ?? '—'}</td>
                    <td className="numeric">
                      {query.durationMs === null ? (
                        <span className="muted" title="Drizzle Logger does not expose duration">
                          n/a
                        </span>
                      ) : (
                        formatDuration(query.durationMs)
                      )}
                    </td>
                    <td>
                      {query.resolvedTraceId ? (
                        <button
                          type="button"
                          className="link mono"
                          onClick={(event) => {
                            event.stopPropagation()
                            onNavigate(`/requests/${query.resolvedTraceId}`)
                          }}
                        >
                          {query.resolvedTraceId.slice(0, 10)}…
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="muted nowrap">{formatRelative(query.timestamp)}</td>
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

      {selected && (
        <Card
          title="Query detail"
          subtitle={`${selected.databaseSystem} · ${selected.source}`}
          actions={
            <button
              type="button"
              className="button button--ghost button--icon"
              onClick={() => setSelected(null)}
              aria-label="Close query detail"
            >
              <Icon name="close" size={15} />
            </button>
          }
        >
          <pre className="code-block">{selected.sql}</pre>
          <dl className="key-values">
            <div className="key-values__row">
              <dt>Duration</dt>
              <dd>
                {selected.durationMs === null
                  ? 'Not measured by Drizzle Logger'
                  : formatDuration(selected.durationMs)}
              </dd>
            </div>
            <div className="key-values__row">
              <dt>Operation</dt>
              <dd>{selected.operation ?? '—'}</dd>
            </div>
            <div className="key-values__row">
              <dt>Success</dt>
              <dd>{selected.success ? 'yes' : 'no'}</dd>
            </div>
            <div className="key-values__row">
              <dt>Route</dt>
              <dd>{selected.route ?? '—'}</dd>
            </div>
            <div className="key-values__row">
              <dt>Trace</dt>
              <dd className="mono">{selected.resolvedTraceId ?? '—'}</dd>
            </div>
          </dl>
          {Object.keys(selected.attributes).length > 0 && (
            <details className="disclosure" open>
              <summary>Attributes</summary>
              <JsonView value={selected.attributes} maxHeight={240} />
            </details>
          )}
        </Card>
      )}
    </>
  )
}
