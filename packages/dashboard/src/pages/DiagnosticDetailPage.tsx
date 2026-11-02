import type { DiagnosticDetailResponse, DiagnosticSeverity, DiagnosticStatus } from '@stacknext/core'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  Card,
  CopyButton,
  EmptyState,
  ErrorState,
  Loading,
  MethodBadge,
  PageHeader,
  type Tone,
} from '../components/ui'
import { Icon } from '../components/Icon'
import { formatDateTime, formatDuration, formatRelative, truncate } from '../format'

const SEVERITY_TONE: Record<DiagnosticSeverity, Tone> = {
  error: 'bad',
  warning: 'warn',
  info: 'accent',
}

const STATUS_TONE: Record<DiagnosticStatus, Tone> = {
  observed: 'good',
  possible: 'warn',
  'insufficient-evidence': 'muted',
}

export function DiagnosticDetailPage({
  diagnosticId,
  refreshKey,
  onNavigate,
}: {
  diagnosticId: string
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const state = useAsync<DiagnosticDetailResponse>(
    (signal) => api.diagnostic(diagnosticId, signal),
    `diagnostic:${diagnosticId}`,
    refreshKey,
  )

  return (
    <>
      <div className="breadcrumb">
        <button type="button" className="link" onClick={() => onNavigate('/diagnostics')}>
          <Icon name="chevron-left" size={14} /> Diagnostics
        </button>
        <span>/</span>
        <span className="mono">{diagnosticId}</span>
      </div>

      {state.loading && !state.data ? (
        <Loading rows={7} />
      ) : state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={state.reload} />
      ) : state.data ? (
        <>
          <PageHeader
            eyebrow={`${state.data.finding.ruleId} · ${state.data.finding.category}`}
            title={state.data.finding.title}
            description={state.data.finding.summary}
            actions={
              <div className="button-row">
                <CopyButton value={state.data.finding.id} label="Copy finding id" />
                <button type="button" className="button button--ghost" onClick={state.reload}>
                  <Icon name="refresh" size={15} /> Refresh
                </button>
              </div>
            }
          />

          <div className="badge-row">
            <Badge tone={SEVERITY_TONE[state.data.finding.severity]}>
              {state.data.finding.severity}
            </Badge>
            <Badge tone={STATUS_TONE[state.data.finding.status]}>
              {state.data.finding.status}
            </Badge>
            <Badge tone="muted">rule v{state.data.finding.ruleVersion}</Badge>
            <Badge tone="muted">read-only evidence</Badge>
          </div>

          <div className="grid grid--2-1">
            <div className="stack">
              <Card title="What the evidence shows" subtitle={state.data.finding.detail}>
                <p className="diagnostic-callout">
                  This finding is a deterministic interpretation of the current sample. It is not a
                  confirmed root cause. Verify it against the calling code and a fresh trace before
                  changing anything.
                </p>
                {state.data.finding.evidence.measurements.length > 0 && (
                  <dl className="key-values">
                    {state.data.finding.evidence.measurements.map((measurement) => (
                      <div className="key-values__row" key={measurement.label}>
                        <dt>{measurement.label}</dt>
                        <dd className="mono">
                          {String(measurement.value)}
                          {measurement.unit ? ` ${measurement.unit}` : ''}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </Card>

              {state.data.finding.evidence.spans.length > 0 && (
                <Card title="Span evidence" subtitle="Bounded to the spans attached to this finding">
                  <table className="table table--compact">
                    <thead>
                      <tr>
                        <th>Span</th>
                        <th>Category</th>
                        <th>Duration</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.data.finding.evidence.spans.map((span) => (
                        <tr key={`${span.traceId}:${span.spanId}`}>
                          <td>
                            <div className="route-cell">{span.name}</div>
                            <div className="sub-cell mono">{span.spanId}</div>
                          </td>
                          <td>
                            <Badge tone="muted">{span.category}</Badge>
                          </td>
                          <td className="numeric">{formatDuration(span.durationMs)}</td>
                          <td>
                            <Badge tone={span.status === 'error' ? 'bad' : 'muted'}>
                              {span.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}

              {state.data.finding.evidence.queries.length > 0 && (
                <Card
                  title="Query evidence"
                  subtitle="Normalized SQL shapes only — literals and bind values are removed"
                >
                  <div className="stack stack--tight">
                    {state.data.finding.evidence.queries.slice(0, 5).map((query) => (
                      <div key={query.id} className="evidence-block">
                        <div className="evidence-block__top">
                          <Badge tone="muted">{query.databaseSystem}</Badge>
                          {query.operation && <Badge tone="muted">{query.operation}</Badge>}
                          <span className="muted">
                            {formatDuration(query.durationMs)} · {formatRelative(query.timestamp)}
                          </span>
                          {!query.success && <Badge tone="bad">failed</Badge>}
                        </div>
                        <pre className="code-block code-block--scroll">{query.sqlPreview}</pre>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {state.data.finding.evidence.errors.length > 0 && (
                <Card title="Error evidence" subtitle="Latest occurrences in this group">
                  <ul className="error-list">
                    {state.data.finding.evidence.errors.map((error) => (
                      <li key={error.id}>
                        <button type="button" onClick={() => onNavigate(`/errors/${error.id}`)}>
                          <span className="error-list__name">{error.name}</span>
                          <span className="error-list__message">{truncate(error.message, 220)}</span>
                          <span className="error-list__meta">
                            {error.route ?? 'unknown route'} · {formatRelative(error.timestamp)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <Card title="Related trace" subtitle="The latest trace referenced by this finding">
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
                    </div>
                    <div className="trace-summary__stats">
                      <span>{state.data.trace.spanCount} spans</span>
                      <span>{state.data.trace.errorCount} errors</span>
                      <span>{state.data.trace.databaseQueryCount} queries</span>
                    </div>
                    {state.data.trace.missingParentSpanIds.length > 0 && (
                      <p className="muted">
                        Missing parent spans: {state.data.trace.missingParentSpanIds.join(', ')}
                      </p>
                    )}
                    <div className="button-row">
                      <button
                        type="button"
                        className="button button--primary button--small"
                        onClick={() => onNavigate(`/requests/${state.data?.trace?.traceId}`)}
                      >
                        Open timeline <Icon name="arrow-right" size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon="traces"
                    title="No related trace"
                    description="The trace may have aged out of retention, or this finding is based on uncorrelated errors."
                  />
                )}
              </Card>

              <Card title="Verification" subtitle="Check these before treating the finding as a cause">
                <ol className="verification-list">
                  {state.data.finding.verification.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </Card>
            </div>

            <aside className="stack">
              <Card title="Details">
                <dl className="key-values">
                  <div className="key-values__row">
                    <dt>Rule</dt>
                    <dd className="mono">{state.data.finding.ruleId}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Category</dt>
                    <dd>{state.data.finding.category}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Severity</dt>
                    <dd>{state.data.finding.severity}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Status</dt>
                    <dd>{state.data.finding.status}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Route</dt>
                    <dd className="mono">{state.data.finding.route ?? '—'}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Method</dt>
                    <dd>{state.data.finding.method ?? '—'}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>First seen</dt>
                    <dd title={formatDateTime(state.data.finding.firstSeen)}>
                      {formatRelative(state.data.finding.firstSeen)}
                    </dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Last seen</dt>
                    <dd title={formatDateTime(state.data.finding.lastSeen)}>
                      {formatRelative(state.data.finding.lastSeen)}
                    </dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Traces</dt>
                    <dd className="mono">{state.data.finding.traceIds.length}</dd>
                  </div>
                </dl>
              </Card>

              <Card title="Fingerprint" subtitle="Stable within this rule set version">
                <div className="fingerprint">
                  <code>{state.data.finding.fingerprint}</code>
                  <CopyButton value={state.data.finding.fingerprint} />
                </div>
                <p className="muted mono">{state.data.finding.id}</p>
              </Card>

              <Card title="Limitations" subtitle="Why this is not a root-cause verdict">
                <ul className="notes-list">
                  {state.data.finding.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
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
