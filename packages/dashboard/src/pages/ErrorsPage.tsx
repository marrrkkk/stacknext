import { useMemo, useState } from 'react'
import type { ErrorListResponse } from '@stacknext/core'
import { api } from '../api'
import { useAsync, useDebounced } from '../hooks'
import {
  Badge,
  Banner,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  IdLink,
  MethodBadge,
  PageHeader,
  PageLayout,
  SearchInput,
  StatCard,
  StatGridSkeleton,
  StatStrip,
  TableFooter,
  Toolbar,
} from '../components/ui'
import { Icon } from '../components/Icon'
import { formatDateTime, formatNumber, formatRelative } from '../format'

const LIMIT = 50

function ErrorGroupsSkeleton(): React.ReactElement {
  return (
    <div className="error-group-list" role="status" aria-label="Loading server errors">
      {[0, 1, 2].map((index) => (
        <div className="card" key={index} aria-hidden="true">
          <div className="error-group-card__header">
            <div className="error-group-card__content">
              <span className="skeleton stat-skeleton__label" />
              <span className="skeleton error-group-skeleton__message" />
              <span className="skeleton stat-skeleton__hint" />
            </div>
          </div>
        </div>
      ))}
      <span className="sr-only">Loading server errors</span>
    </div>
  )
}

export function ErrorsPage({
  refreshKey,
  onNavigate,
  snapshotId,
}: {
  refreshKey: number
  onNavigate: (path: string) => void
  snapshotId?: string
}): React.ReactElement {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [route, setRoute] = useState('')
  const [offset, setOffset] = useState(0)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const updateSearch = (value: string): void => {
    setSearch(value)
    setExpanded({})
    setOffset(0)
  }
  const updateRoute = (value: string): void => {
    setRoute(value)
    setExpanded({})
    setOffset(0)
  }

  const key = useMemo(
    () => JSON.stringify({ debouncedSearch, route, offset }),
    [debouncedSearch, route, offset],
  )
  const state = useAsync<ErrorListResponse>(
    (signal) => {
      const query = {
        limit: LIMIT,
        offset,
        q: debouncedSearch || undefined,
        route: route || undefined,
      }
      return snapshotId
        ? api.snapshotErrors(snapshotId, query, signal)
        : api.errors(query, signal)
    },
    key,
    refreshKey,
  )
  const basePath = snapshotId ? `/snapshots/${snapshotId}` : ''
  const filtersActive = Boolean(debouncedSearch || route)

  const items = useMemo(() => state.data?.items ?? [], [state.data])
  const groups = useMemo(() => state.data?.groups ?? [], [state.data])
  const total = state.data?.total ?? 0
  const affectedRoutes = new Set(groups.map((group) => group.route).filter(Boolean)).size
  const lastSeen = groups.reduce((latest, group) => Math.max(latest, group.lastSeen), 0)
  const hasExpandedState = Object.keys(expanded).length > 0

  const pageGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          group,
          occurrences: items.filter((error) => error.fingerprint === group.fingerprint),
        }))
        .filter((entry) => entry.occurrences.length > 0),
    [groups, items],
  )

  return (
    <PageLayout>
      <PageHeader
        eyebrow={snapshotId ? 'Snapshot' : 'Errors'}
        eyebrowOnClick={
          snapshotId ? () => onNavigate(`/snapshots/${snapshotId}`) : undefined
        }
        title="Server errors"
        description={
          snapshotId
            ? 'Errors frozen in this snapshot, grouped by fingerprint. Occurrence counts describe the saved sample only.'
            : 'Errors reported by Next.js onRequestError, linked to their request trace and grouped by fingerprint.'
        }
        info="Groups are sorted by last seen. Expand a group to inspect the occurrences captured on this page; each linked trace opens the request timeline."
        actions={
          <button type="button" className="button button--secondary" onClick={state.reload}>
            <Icon name="refresh" size={15} /> Refresh
          </button>
        }
      />

      {snapshotId && (
        <Banner tone="accent" icon="layers" title="Saved snapshot">
          These errors come from a frozen local snapshot. The page cannot show live diagnostics,
          coverage or errors captured after the snapshot.
        </Banner>
      )}

      {state.data ? (
        <StatStrip>
          <StatCard
            label="Error groups"
            value={formatNumber(groups.length)}
            hint="Distinct error fingerprints"
          />
          <StatCard
            label="Occurrences"
            value={formatNumber(total)}
            hint="Across all error groups"
          />
          <StatCard
            label="Affected routes"
            value={formatNumber(affectedRoutes)}
            hint="Routes represented"
          />
          <StatCard
            label="Last seen"
            value={
              lastSeen ? (
                <span title={formatDateTime(lastSeen)}>{formatRelative(lastSeen)}</span>
              ) : (
                'None'
              )
            }
            hint="Most recent occurrence"
          />
        </StatStrip>
      ) : (
        <StatGridSkeleton />
      )}

      <Toolbar
        label="Filter server errors"
        aside={
          <span className="toolbar__count">
            Showing {formatNumber(items.length)} of {formatNumber(total)}
          </span>
        }
      >
        <SearchInput
          value={search}
          onChange={updateSearch}
          placeholder="Search message or route…"
          label="Search errors"
        />
        <SearchInput
          value={route}
          onChange={updateRoute}
          placeholder="Filter by route…"
          label="Filter errors by route"
        />
      </Toolbar>

      {state.loading && !state.data ? (
        <ErrorGroupsSkeleton />
      ) : state.error && !state.data ? (
        <Card>
          <ErrorState message={state.error} onRetry={state.reload} />
        </Card>
      ) : state.data && items.length === 0 ? (
        <Card>
          <EmptyState
            icon={filtersActive ? 'search' : 'shield'}
            title={
              filtersActive
                ? 'No server errors match these filters'
                : snapshotId
                  ? 'No server errors in this snapshot'
                  : 'No server errors in the current retention window'
            }
            description={
              filtersActive
                ? 'Clear a filter or widen the search.'
                : snapshotId
                  ? 'This snapshot contains no server errors.'
                  : 'Errors appear when a route throws or returns a 5xx response. Make a failing request, or use Diagnostics to review other evidence. Empty is not proof that the app is healthy.'
            }
            action={
              filtersActive ? (
                <button
                  type="button"
                  className="button button--secondary button--small"
                  onClick={() => {
                    setSearch('')
                    setRoute('')
                    setExpanded({})
                    setOffset(0)
                  }}
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
                  onClick={() => onNavigate('/traces?view=requests')}
                >
                  Browse requests
                </button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="error-group-list">
            {pageGroups.map(({ group, occurrences }, index) => {
              const open =
                expanded[group.fingerprint] ?? (!hasExpandedState && index === 0)
              return (
                <Card key={group.fingerprint} padded={false}>
                  <button
                    type="button"
                    className="error-group-card__header"
                    aria-expanded={open}
                    onClick={() =>
                      setExpanded((current) => ({
                        ...current,
                        [group.fingerprint]: !open,
                      }))
                    }
                  >
                    <span className="error-group-card__content">
                      <span className="error-group-card__top">
                        <span className="error-group__name">{group.name}</span>
                        <Badge tone="bad">
                          {formatNumber(group.count)}{' '}
                          {group.count === 1 ? 'occurrence' : 'occurrences'}
                        </Badge>
                      </span>
                      <span className="error-group__message error-group-card__message">
                        {group.message}
                      </span>
                      <span className="error-group__meta">
                        {group.route ?? 'Unknown route'} · Last seen{' '}
                        {formatRelative(group.lastSeen)}
                        {group.count > occurrences.length
                          ? ` · showing ${formatNumber(occurrences.length)} on this page`
                          : ''}
                      </span>
                    </span>
                    <span className="error-group-card__chevron" aria-hidden="true">
                      <Icon name="chevron-down" size={14} />
                    </span>
                  </button>

            {open && (
                    <DataTable
                      label={`Occurrences for ${group.name}`}
                      className="data-table--compact"
                      columns={[
                        { key: 'request', label: 'Request' },
                        { key: 'trace', label: 'Trace ID', width: '160px' },
                        {
                          key: 'time',
                          label: 'Time',
                          align: 'right',
                          width: '96px',
                        },
                        { key: 'open', label: '', width: '36px' },
                      ]}
                    >
                      {occurrences.map((error) => (
                        <tr
                          key={error.id}
                          className="row-clickable"
                          tabIndex={0}
                          title="Open error details"
                          onClick={() => onNavigate(`${basePath}/errors/${error.id}`)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              onNavigate(`${basePath}/errors/${error.id}`)
                            }
                          }}
                        >
                          <td>
                            <span className="occurrence-request">
                              <MethodBadge method={error.method} />
                              <span className="mono">{error.route ?? 'Unknown route'}</span>
                            </span>
                          </td>
                          <td>
                            {error.resolvedTraceId ? (
                              <IdLink
                                value={error.resolvedTraceId}
                                label="Open request trace"
                                onClick={() =>
                                  onNavigate(`${basePath}/traces/${error.resolvedTraceId}`)
                                }
                              />
                            ) : (
                              <span className="muted">Not linked</span>
                            )}
                          </td>
                          <td
                            className="numeric"
                            title={formatDateTime(error.timestamp)}
                          >
                            {formatRelative(error.timestamp)}
                          </td>
                          <td className="numeric">
                            <span className="row-open" aria-hidden="true">
                              <Icon name="chevron-right" size={14} />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </DataTable>
                  )}
                </Card>
              )
            })}
          </div>

          <div className="table-footer--page">
            <TableFooter
              total={total}
              limit={LIMIT}
              offset={offset}
              onChange={setOffset}
            />
          </div>
        </>
      )}
    </PageLayout>
  )
}
