import { useMemo, useState } from 'react'
import type { ErrorListResponse } from '@stacknext/core'
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
} from '../components/ui'
import { Icon } from '../components/Icon'
import { formatDateTime, formatRelative, truncate } from '../format'

const LIMIT = 50

export function ErrorsPage({
  refreshKey,
  onNavigate,
}: {
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [route, setRoute] = useState('')
  const [offset, setOffset] = useState(0)

  const updateSearch = (value: string): void => {
    setSearch(value)
    setOffset(0)
  }
  const updateRoute = (value: string): void => {
    setRoute(value)
    setOffset(0)
  }

  const key = useMemo(
    () => JSON.stringify({ debouncedSearch, route, offset }),
    [debouncedSearch, route, offset],
  )
  const state = useAsync<ErrorListResponse>(
    (signal) =>
      api.errors(
        {
          limit: LIMIT,
          offset,
          q: debouncedSearch || undefined,
          route: route || undefined,
        },
        signal,
      ),
    key,
    refreshKey,
  )
  const filtersActive = Boolean(debouncedSearch || route)

  return (
    <>
      <PageHeader
        eyebrow="Errors"
        title="Server errors"
        description="Errors reported by Next.js onRequestError, linked to their request trace and grouped by fingerprint."
        actions={
          <button type="button" className="button button--ghost" onClick={state.reload}>
            <Icon name="refresh" size={15} /> Refresh
          </button>
        }
      />

      {state.data && state.data.groups.length > 0 && (
        <div className="error-groups">
          {state.data.groups.slice(0, 6).map((group) => (
            <button
              type="button"
              key={group.fingerprint}
              className="error-group"
              onClick={() => onNavigate(`/errors/${group.latestErrorId}`)}
            >
              <div className="error-group__top">
                <span className="error-group__name">{group.name}</span>
                <Badge tone="bad">{group.count}</Badge>
              </div>
              <div className="error-group__message">{truncate(group.message, 120)}</div>
              <div className="error-group__meta">
                {group.route ?? 'unknown route'} · last seen {formatRelative(group.lastSeen)}
              </div>
            </button>
          ))}
        </div>
      )}

      <Card className="toolbar-card">
        <div className="toolbar">
          <SearchInput
            value={search}
            onChange={updateSearch}
            placeholder="Search message, name or stack…"
            label="Search errors"
          />
          <SearchInput
            value={route}
            onChange={updateRoute}
            placeholder="Filter by route…"
            label="Filter errors by route"
          />
        </div>
      </Card>

      <Card padded={false}>
        {state.loading && !state.data ? (
          <div className="card__inner">
            <Loading rows={7} />
          </div>
        ) : state.error && !state.data ? (
          <div className="card__inner">
            <ErrorState message={state.error} onRetry={state.reload} />
          </div>
        ) : state.data && state.data.items.length === 0 ? (
          <EmptyState
            icon={filtersActive ? 'search' : 'shield'}
            title={filtersActive ? 'No errors match these filters' : 'No server errors captured'}
            description={
              filtersActive
                ? 'Try clearing the message or route filter.'
                : 'Unhandled App Router errors appear here automatically through onRequestError. This is a good place to be.'
            }
            action={
              filtersActive ? (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => {
                    setSearch('')
                    setRoute('')
                    setOffset(0)
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <Badge tone="good">healthy</Badge>
              )
            }
          />
        ) : (
          <>
            <table className="table table--errors">
              <thead>
                <tr>
                  <th>Error</th>
                  <th>Route</th>
                  <th>Trace</th>
                  <th>Seen</th>
                </tr>
              </thead>
              <tbody>
                {state.data?.items.map((error) => (
                  <tr
                    key={error.id}
                    className="row-clickable"
                    tabIndex={0}
                    onClick={() => onNavigate(`/errors/${error.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onNavigate(`/errors/${error.id}`)
                      }
                    }}
                  >
                    <td>
                      <div className="error-cell__name">{error.name}</div>
                      <div className="error-cell__message">{truncate(error.message, 140)}</div>
                    </td>
                    <td>
                      <div className="mono">{error.route ?? '—'}</div>
                      <div className="sub-cell">{error.method ?? '—'}</div>
                    </td>
                    <td>
                      {error.resolvedTraceId ? (
                        <button
                          type="button"
                          className="link mono"
                          onClick={(event) => {
                            event.stopPropagation()
                            onNavigate(`/requests/${error.resolvedTraceId}`)
                          }}
                        >
                          {error.resolvedTraceId.slice(0, 10)}…
                        </button>
                      ) : (
                        <span className="muted">not linked</span>
                      )}
                    </td>
                    <td className="muted nowrap" title={formatDateTime(error.timestamp)}>
                      {formatRelative(error.timestamp)}
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
