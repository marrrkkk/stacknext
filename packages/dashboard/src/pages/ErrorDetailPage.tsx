import type { ErrorDetailResponse } from '@nextscope/core'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  Card,
  CopyButton,
  EmptyState,
  ErrorState,
  JsonView,
  Loading,
  MethodBadge,
  PageHeader,
  StatusCodeBadge,
} from '../components/ui'
import { Icon } from '../components/Icon'
import { formatDateTime, formatDuration, formatRelative } from '../format'

export function ErrorDetailPage({
  errorId,
  refreshKey,
  onNavigate,
}: {
  errorId: string
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const state = useAsync<ErrorDetailResponse>(
    (signal) => api.error(errorId, signal),
    `error:${errorId}`,
    refreshKey,
  )

  return (
    <>
      <div className="breadcrumb">
        <button type="button" className="link" onClick={() => onNavigate('/errors')}>
          <Icon name="chevron-left" size={14} /> Errors
        </button>
        <span>/</span>
        <span className="mono">{errorId.slice(0, 16)}…</span>
      </div>

      {state.loading && !state.data ? (
        <Loading rows={7} />
      ) : state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={state.reload} />
      ) : state.data ? (
        <>
          <PageHeader
            eyebrow="Error"
            title={state.data.error.name}
            description={state.data.error.message}
            actions={
              <div className="button-row">
                <CopyButton value={state.data.error.id} label="Copy error id" />
                <button type="button" className="button button--ghost" onClick={state.reload}>
                  <Icon name="refresh" size={15} /> Refresh
                </button>
              </div>
            }
          />

          <div className="grid grid--2-1">
            <div className="stack">
              <Card
                title="Stack trace"
                subtitle={state.data.error.stack ? 'Redacted server stack' : 'No stack captured'}
              >
                {state.data.error.stack ? (
                  <pre className="code-block code-block--scroll">{state.data.error.stack}</pre>
                ) : (
                  <EmptyState
                    compact
                    icon="code"
                    title="No stack available"
                    description="The error was reported without a stack trace."
                  />
                )}
              </Card>

              <Card title="Attributes" subtitle="Redacted metadata attached to this error">
                {Object.keys(state.data.error.attributes).length === 0 ? (
                  <p className="muted">No attributes were captured.</p>
                ) : (
                  <JsonView value={state.data.error.attributes} maxHeight={320} />
                )}
              </Card>

              <Card
                title="Correlated trace"
                subtitle="Matched by OTel trace context, or route and time as a fallback"
              >
                {state.data.trace ? (
                  <div className="trace-summary">
                    <div className="trace-summary__main">
                      <MethodBadge method={state.data.trace.request?.method ?? null} />
                      <div>
                        <div className="route-cell">
                          {state.data.trace.request?.route ??
                            state.data.trace.request?.name ??
                            'Trace'}
                        </div>
                        <div className="sub-cell">
                          {formatDateTime(state.data.trace.startTime)} ·{' '}
                          {formatDuration(state.data.trace.durationMs)}
                        </div>
                      </div>
                      <StatusCodeBadge
                        code={state.data.trace.request?.statusCode ?? null}
                        failed={state.data.trace.errors.length > 0}
                      />
                    </div>
                    <div className="trace-summary__stats">
                      <span>{state.data.trace.spans.length} spans</span>
                      <span>{state.data.trace.errors.length} errors</span>
                      <span>{state.data.trace.databaseQueries.length} queries</span>
                    </div>
                    <div className="button-row">
                      <button
                        type="button"
                        className="button button--primary button--small"
                        onClick={() => onNavigate(`/requests/${state.data?.trace?.traceId}`)}
                      >
                        Open timeline <Icon name="arrow-right" size={14} />
                      </button>
                      {state.data.trace.databaseQueries.length > 0 && (
                        <button
                          type="button"
                          className="button button--ghost button--small"
                          onClick={() =>
                            onNavigate(`/database?traceId=${state.data?.trace?.traceId}`)
                          }
                        >
                          View queries
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon="traces"
                    title="No trace linked"
                    description="The error happened outside a captured request, or the trace has aged out of retention."
                  />
                )}
              </Card>
            </div>

            <aside className="stack">
              <Card title="Details">
                <dl className="key-values">
                  <div className="key-values__row">
                    <dt>Name</dt>
                    <dd>{state.data.error.name}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Route</dt>
                    <dd className="mono">{state.data.error.route ?? '—'}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Method</dt>
                    <dd>{state.data.error.method ?? '—'}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Router</dt>
                    <dd>{state.data.error.routerKind ?? '—'}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Route type</dt>
                    <dd>{state.data.error.routeType ?? '—'}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Render source</dt>
                    <dd>{state.data.error.renderSource ?? '—'}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Seen</dt>
                    <dd title={formatDateTime(state.data.error.timestamp)}>
                      {formatRelative(state.data.error.timestamp)}
                    </dd>
                  </div>
                  {state.data.error.digest && (
                    <div className="key-values__row">
                      <dt>Digest</dt>
                      <dd className="mono">{state.data.error.digest}</dd>
                    </div>
                  )}
                  {state.data.error.traceId && (
                    <div className="key-values__row">
                      <dt>Trace ID</dt>
                      <dd className="mono">{state.data.error.traceId}</dd>
                    </div>
                  )}
                </dl>
              </Card>

              <Card title="Fingerprint" subtitle="Repeated errors are grouped by this hash">
                <div className="fingerprint">
                  <code>{state.data.error.fingerprint}</code>
                  <CopyButton value={state.data.error.fingerprint} />
                </div>
                <div className="badge-row">
                  <Badge tone="bad">counted</Badge>
                  <Badge tone="muted">read-only</Badge>
                </div>
              </Card>
            </aside>
          </div>
        </>
      ) : (
        <Loading />
      )}
    </>
  )
}
