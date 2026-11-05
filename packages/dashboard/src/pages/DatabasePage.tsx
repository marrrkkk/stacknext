import { useMemo, useState } from 'react'
import type { DatabaseQueryListItem, PageResult } from '@stacknext/core'
import { api } from '../api'
import { useAsync, useDebounced } from '../hooks'
import {
  Banner,
  Card,
  EmptyState,
  ErrorState,
  ListTableSkeleton,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  type ListTableSkeletonColumn,
} from '../components/ui'
import { DurationValue } from '../components/details'
import { Icon } from '../components/Icon'
import {
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelative,
  sqlPreview,
  truncate,
} from '../format'
import { queryShapeId } from '../sql'

const LIMIT = 50
const TRACE_ID_LENGTH = 12

const SKELETON_COLUMNS: ListTableSkeletonColumn[] = [
  {
    key: 'sql',
    label: 'SQL',
    className: 'database-col--sql',
    width: '58%',
    secondaryWidth: '26%',
  },
  {
    key: 'system',
    label: 'System',
    className: 'database-col--system',
    width: '52px',
  },
  {
    key: 'operation',
    label: 'Operation',
    className: 'list-col--operation',
    width: '52px',
  },
  {
    key: 'duration',
    label: 'Duration',
    className: 'list-col--duration numeric',
    width: '40px',
  },
  {
    key: 'trace',
    label: 'Trace',
    className: 'list-col--trace',
    width: '64px',
  },
  {
    key: 'when',
    label: 'When',
    className: 'list-col--when numeric',
    width: '40px',
  },
  { key: 'chevron', label: '', className: 'list-col--chevron' },
]

/** The row tooltip retains operation, trace and time when columns collapse. */
function queryTitle(query: DatabaseQueryListItem): string {
  const duration =
    query.durationMs === null
      ? 'duration not measured'
      : formatDuration(query.durationMs)
  return [
    `${query.operation ?? 'query'} · ${query.databaseSystem}`,
    `${duration} · ${query.success ? 'success' : 'failed'}`,
    `${query.route ?? 'route not captured'} · ${
      query.resolvedTraceId ?? 'no trace'
    }`,
    formatDateTime(query.timestamp),
  ].join(' — ')
}

function DatabaseTableHead(): React.ReactElement {
  return (
    <thead>
      <tr>
        <th className="database-col--sql" scope="col" title="Redacted SQL and route">
          SQL
        </th>
        <th className="database-col--system" scope="col">
          System
        </th>
        <th className="list-col--operation" scope="col">
          Operation
        </th>
        <th
          className="list-col--duration numeric"
          scope="col"
          title="Query duration as measured by the adapter"
        >
          Duration
        </th>
        <th className="list-col--trace" scope="col">
          Trace
        </th>
        <th className="list-col--when numeric" scope="col" title="Query time">
          When
        </th>
        <th className="list-col--chevron" aria-hidden="true" />
      </tr>
    </thead>
  )
}

export function DatabasePage({
  refreshKey,
  onNavigate,
  snapshotId,
}: {
  refreshKey: number
  onNavigate: (path: string) => void
  snapshotId?: string
}): React.ReactElement {
  const initial = new URLSearchParams(window.location.search)
  const [traceId, setTraceId] = useState(initial.get('traceId') ?? '')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [system, setSystem] = useState('')
  const [minDuration, setMinDuration] = useState('')
  const [offset, setOffset] = useState(0)

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
  const clearFilters = (): void => {
    setSearch('')
    setSystem('')
    setMinDuration('')
    setTraceId('')
    setOffset(0)
  }

  const key = useMemo(
    () => JSON.stringify({ debouncedSearch, system, minDuration, traceId, offset }),
    [debouncedSearch, system, minDuration, traceId, offset],
  )
  const state = useAsync<PageResult<DatabaseQueryListItem>>(
    (signal) => {
      const query = {
        limit: LIMIT,
        offset,
        q: debouncedSearch || undefined,
        databaseSystem: system || undefined,
        minDuration: minDuration ? Number(minDuration) : undefined,
        traceId: traceId || undefined,
      }
      return snapshotId
        ? api.snapshotDatabase(snapshotId, query, signal)
        : api.database(query, signal)
    },
    key,
    refreshKey,
  )

  const basePath = snapshotId ? `/snapshots/${snapshotId}` : ''
  const filtersActive = Boolean(debouncedSearch || system || minDuration || traceId)
  const queries = state.data?.items ?? []
  const total = state.data?.total ?? 0
  const shownFailed = queries.filter((query) => !query.success).length
  const shownUnmeasured = queries.filter((query) => query.durationMs === null).length

  const footer = state.data && queries.length > 0
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
              Showing {formatNumber(queries.length)}{' '}
              {queries.length === 1 ? 'query' : 'queries'}
            </span>
            <span className="nowrap tabular">
              {formatNumber(shownFailed)} failed ·{' '}
              {formatNumber(shownUnmeasured)} unmeasured
            </span>
          </>
        )
    : undefined

  const table = (
    <Card padded={false} footer={footer}>
      {state.loading && !state.data ? (
        <ListTableSkeleton
          label="Loading database queries"
          columns={SKELETON_COLUMNS}
          tableClassName="database-table"
        />
      ) : state.error && !state.data ? (
        <div className="card__inner">
          <ErrorState message={state.error} onRetry={state.reload} />
        </div>
      ) : state.data && queries.length === 0 ? (
        <div className="list-state">
          <EmptyState
            icon="database"
            title={
              filtersActive
                ? 'No queries match these filters'
                : snapshotId
                  ? 'No database queries in this snapshot'
                  : 'No database queries captured'
            }
            description={
              filtersActive ? (
                'Adjust the search, database system or duration filter.'
              ) : (
                <>
                  Add <code>createStackNextDrizzleLogger()</code> to drizzle or call{' '}
                  <code>instrumentPrismaClient(prisma)</code> in a server-only module.
                </>
              )
            }
            action={
              filtersActive ? (
                <button
                  type="button"
                  className="button button--secondary button--small"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              ) : (
                <button
                  type="button"
                  className="button button--secondary button--small"
                  onClick={() => onNavigate('/settings')}
                >
                  Adapter setup
                </button>
              )
            }
          />
        </div>
      ) : (
        <div
          className="table-scroll"
          role="region"
          aria-label="Database queries"
          tabIndex={0}
        >
          <table className="table list-table database-table">
            <DatabaseTableHead />
            <tbody>
              {queries.map((query) => {
                const shapeId = queryShapeId(query.sql)
                const rowTarget = snapshotId
                  ? query.resolvedTraceId
                    ? `${basePath}/traces/${query.resolvedTraceId}`
                    : null
                  : `/database/${shapeId}`
                return (
                <tr
                  key={query.id}
                  className={rowTarget ? 'row-clickable' : undefined}
                  tabIndex={rowTarget ? 0 : undefined}
                  title={snapshotId ? 'Open the linked trace' : queryTitle(query)}
                  onClick={rowTarget ? () => onNavigate(rowTarget) : undefined}
                  onKeyDown={
                    rowTarget
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onNavigate(rowTarget)
                          }
                        }
                      : undefined
                  }
                >
                  <td className="database-col--sql">
                    <code className="sql" title={query.sql}>
                      {sqlPreview(query.sql, 120)}
                    </code>
                    <span className="sub-cell" title={query.route ?? undefined}>
                      {query.route ?? 'uncorrelated'}
                    </span>
                  </td>
                  <td className="database-col--system muted mono">
                    {query.databaseSystem}
                  </td>
                  <td className="list-col--operation muted">
                    {query.operation ?? '—'}
                  </td>
                  <td className="list-col--duration numeric">
                    <DurationValue
                      ms={query.durationMs}
                      emptyTitle="The adapter reported a null duration. Null is never treated as zero."
                    />
                  </td>
                  <td className="list-col--trace">
                    {query.resolvedTraceId ? (
                      <button
                        type="button"
                        className="link mono"
                        title={query.resolvedTraceId}
                        onClick={(event) => {
                          event.stopPropagation()
                          onNavigate(`${basePath}/traces/${query.resolvedTraceId}`)
                        }}
                      >
                        {truncate(query.resolvedTraceId, TRACE_ID_LENGTH)}
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td
                    className="list-col--when numeric muted tabular"
                    title={formatDateTime(query.timestamp)}
                  >
                    <span className="nowrap">
                      {formatRelative(query.timestamp)}
                    </span>
                  </td>
                  <td className="list-col--chevron" aria-hidden="true">
                    {rowTarget && (
                      <Icon name="chevron-right" size={14} className="muted" />
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )

  return (
    <div className="list-page">
      <PageHeader
        eyebrow={snapshotId ? 'Snapshot' : 'Database'}
        eyebrowOnClick={
          snapshotId ? () => onNavigate(`/snapshots/${snapshotId}`) : undefined
        }
        title="Queries"
        description={
          snapshotId
            ? 'Redacted SQL frozen in this snapshot. Open a linked trace to inspect the request that produced it.'
            : 'Redacted SQL captured by the Drizzle or Prisma adapters. Open a row to inspect its normalized query shape, executions and related evidence.'
        }
        actions={
          <button
            type="button"
            className="button button--secondary"
            onClick={state.reload}
            disabled={state.loading}
            aria-busy={state.loading || undefined}
            title="Refresh queries"
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
          This query list is read from a frozen local snapshot. Query-shape detail is available
          only for the live sample.
        </Banner>
      )}

      <div className="list-toolbar" role="group" aria-label="Database filters">
        <div className="list-toolbar__search">
          <SearchInput
            value={search}
            onChange={updateSearch}
            placeholder="Search SQL…"
            label="Search queries"
          />
        </div>
        <div className="list-toolbar__controls">
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
            <button
              type="button"
              className="filter-chip"
              onClick={clearTraceId}
              title="Clear trace filter"
            >
              trace {truncate(traceId, 10)} <Icon name="close" size={12} />
            </button>
          )}
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
              {formatNumber(total)} {total === 1 ? 'query' : 'queries'}
            </span>
          )}
        </div>
      </div>

      {table}
    </div>
  )
}
