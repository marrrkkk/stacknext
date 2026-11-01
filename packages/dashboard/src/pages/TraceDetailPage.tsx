import { useMemo, useState } from 'react'
import type { NextScopeDatabaseQuery, NextScopeError, NextScopeSpan, TraceDetail } from '@nextscope/core'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  CopyButton,
  EmptyState,
  ErrorState,
  JsonView,
  Loading,
  MethodBadge,
  PageHeader,
  StatusCodeBadge,
} from '../components/ui'
import { SpanDetail, SpanTimeline } from '../components/Timeline'
import { Icon } from '../components/Icon'
import { formatDateTime, formatDuration, formatRelative, sqlPreview } from '../format'

type Tab = 'timeline' | 'errors' | 'database' | 'raw'

function ErrorCard({ error }: { error: NextScopeError }): React.ReactElement {
  return (
    <article className="error-card">
      <header>
        <div>
          <div className="error-card__name">{error.name}</div>
          <div className="error-card__message">{error.message}</div>
        </div>
        {error.digest && <Badge tone="muted">digest {error.digest.slice(0, 16)}</Badge>}
      </header>
      <div className="error-card__meta">
        <span>{error.route ?? 'unknown route'}</span>
        <span>{error.method ?? '—'}</span>
        <span>{formatRelative(error.timestamp)}</span>
        {error.routerKind && <span>{error.routerKind}</span>}
        {error.routeType && <span>{error.routeType}</span>}
      </div>
      {error.stack && (
        <details className="disclosure">
          <summary>Stack trace</summary>
          <pre className="code-block">{error.stack}</pre>
        </details>
      )}
      {Object.keys(error.attributes).length > 0 && (
        <details className="disclosure">
          <summary>Attributes</summary>
          <JsonView value={error.attributes} maxHeight={240} />
        </details>
      )}
    </article>
  )
}

function DatabaseTable({
  queries,
  onNavigate,
}: {
  queries: NextScopeDatabaseQuery[]
  onNavigate: (path: string) => void
}): React.ReactElement {
  if (queries.length === 0) {
    return (
      <EmptyState
        compact
        icon="database"
        title="No database queries in this trace"
        description="Queries appear when the Drizzle or Prisma adapter is enabled."
      />
    )
  }
  return (
    <table className="table table--compact">
      <thead>
        <tr>
          <th>SQL</th>
          <th>System</th>
          <th>Source</th>
          <th className="numeric">Duration</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        {queries.map((query) => (
          <tr
            key={query.id}
            className="row-clickable"
            onClick={() => onNavigate(`/database?traceId=${query.traceId ?? ''}`)}
          >
            <td>
              <code className="sql" title={query.sql}>
                {sqlPreview(query.sql, 90)}
              </code>
            </td>
            <td>
              <Badge tone="accent">{query.databaseSystem}</Badge>
            </td>
            <td className="muted">{query.source}</td>
            <td className="numeric">{formatDuration(query.durationMs)}</td>
            <td className="muted nowrap">{formatRelative(query.timestamp)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function TraceDetailPage({
  mode,
  traceId,
  refreshKey,
  onNavigate,
}: {
  mode: 'request' | 'trace'
  traceId: string
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const state = useAsync<TraceDetail>(
    (signal) =>
      mode === 'request' ? api.request(traceId, signal) : api.trace(traceId, signal),
    `${mode}:${traceId}`,
    refreshKey,
  )
  const [tab, setTab] = useState<Tab>('timeline')
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)

  const selectedSpan = useMemo<NextScopeSpan | null>(() => {
    if (!state.data) return null
    if (selectedSpanId) {
      return state.data.spans.find((span) => span.spanId === selectedSpanId) ?? null
    }
    return (
      state.data.spans.find((span) => span.kind === 'server' && !span.parentSpanId) ??
      state.data.spans[0] ??
      null
    )
  }, [state.data, selectedSpanId])

  const backPath = mode === 'request' ? '/requests' : '/traces'
  const backLabel = mode === 'request' ? 'Requests' : 'Traces'
  const request = state.data?.request

  return (
    <>
      <div className="breadcrumb">
        <button type="button" className="link" onClick={() => onNavigate(backPath)}>
          <Icon name="chevron-left" size={14} /> {backLabel}
        </button>
        <span>/</span>
        <span className="mono">{traceId.slice(0, 16)}…</span>
      </div>

      {state.loading && !state.data ? (
        <Loading rows={8} />
      ) : state.error && !state.data ? (
        <ErrorState
          message={state.error}
          onRetry={state.reload}
        />
      ) : state.data ? (
        <>
          <PageHeader
            eyebrow={mode === 'request' ? 'Request trace' : 'Trace'}
            title={
              <span className="title-with-badges">
                <MethodBadge method={request?.method ?? null} />
                <span>{request?.route ?? request?.name ?? state.data.spans[0]?.name ?? 'Trace'}</span>
                <StatusCodeBadge
                  code={request?.statusCode ?? null}
                  failed={state.data.errors.length > 0}
                />
              </span>
            }
            description={
              <span className="meta-line">
                <span>{formatDateTime(state.data.startTime)}</span>
                <span>·</span>
                <span>{formatDuration(state.data.durationMs)}</span>
                <span>·</span>
                <span>{state.data.spans.length} spans</span>
                <span>·</span>
                <span>{state.data.errors.length} errors</span>
                <span>·</span>
                <span>{state.data.databaseQueries.length} queries</span>
              </span>
            }
            actions={
              <div className="button-row">
                <CopyButton value={traceId} label="Copy trace id" />
                <button type="button" className="button button--ghost" onClick={state.reload}>
                  <Icon name="refresh" size={15} />
                  Refresh
                </button>
              </div>
            }
          />

          <div className="tabs" role="tablist" aria-label="Trace sections">
            {(
              [
                ['timeline', `Timeline (${state.data.spans.length})`],
                ['errors', `Errors (${state.data.errors.length})`],
                ['database', `Database (${state.data.databaseQueries.length})`],
                ['raw', 'Raw'],
              ] as Array<[Tab, string]>
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                role="tab"
                aria-selected={tab === value}
                className={tab === value ? 'tab tab--active' : 'tab'}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'timeline' && (
            <div className="trace-layout">
              <section className="card">
                <div className="card__body">
                  <SpanTimeline
                    spans={state.data.spans}
                    selectedSpanId={selectedSpan?.spanId ?? null}
                    onSelect={setSelectedSpanId}
                  />
                </div>
              </section>
              <aside className="card trace-layout__aside">
                <div className="card__body">
                  {selectedSpan ? (
                    <SpanDetail span={selectedSpan} />
                  ) : (
                    <EmptyState
                      compact
                      icon="layers"
                      title="Select a span"
                      description="Choose any span in the timeline to inspect its attributes."
                    />
                  )}
                </div>
              </aside>
            </div>
          )}

          {tab === 'errors' && (
            <div className="stack">
              {state.data.errors.length === 0 ? (
                <EmptyState
                  icon="shield"
                  title="No errors in this trace"
                  description="Errors reported through onRequestError are correlated by trace id and timestamp."
                />
              ) : (
                state.data.errors.map((error) => <ErrorCard key={error.id} error={error} />)
              )}
            </div>
          )}

          {tab === 'database' && (
            <section className="card">
              <div className="card__body card__body--flush">
                <DatabaseTable queries={state.data.databaseQueries} onNavigate={onNavigate} />
              </div>
            </section>
          )}

          {tab === 'raw' && (
            <section className="card">
              <div className="card__body">
                <JsonView value={state.data} maxHeight={640} />
              </div>
            </section>
          )}

          {state.data.missingParentSpanIds.length > 0 && tab === 'timeline' && (
            <p className="muted detail-note">
              {state.data.missingParentSpanIds.length} parent span(s) are outside the retention
              window or were sampled away.
            </p>
          )}
        </>
      ) : (
        <Loading />
      )}
    </>
  )
}
