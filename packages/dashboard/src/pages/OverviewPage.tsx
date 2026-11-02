import type {
  CoverageItem,
  CoverageReport,
  CoverageStatus,
  OverviewResponse,
  PageResult,
  RequestSummary,
} from '@stacknext/core'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  MethodBadge,
  PageHeader,
  StatCard,
  StatusCodeBadge,
} from '../components/ui'
import { Icon } from '../components/Icon'
import {
  errorRate,
  formatDuration,
  formatNumber,
  formatRelative,
  formatTime,
  statusTone,
} from '../format'

interface OverviewData {
  overview: OverviewResponse
  requests: PageResult<RequestSummary>
  coverage: CoverageReport
}

const COVERAGE_TONE: Record<CoverageStatus, 'good' | 'warn' | 'bad' | 'muted' | 'accent'> = {
  observed: 'good',
  active: 'accent',
  configured: 'muted',
  'not-observed': 'warn',
  unknown: 'warn',
  unsupported: 'muted',
}

const DIAGNOSTIC_SEVERITY_TONE = {
  error: 'bad',
  warning: 'warn',
  info: 'accent',
} as const

function CoverageSummary({ report }: { report: CoverageReport }): React.ReactElement {
  const visible = report.items.filter((item) => item.id !== 'next.verbose-spans')
  return (
    <div className="coverage-summary">
      <div className="coverage-summary__statuses">
        {(
          [
            'observed',
            'active',
            'configured',
            'not-observed',
            'unknown',
            'unsupported',
          ] as CoverageStatus[]
        )
          .filter((status) => report.statusCounts[status] > 0)
          .map((status) => (
            <Badge key={status} tone={COVERAGE_TONE[status]}>
              {report.statusCounts[status]} {status}
            </Badge>
          ))}
        <span className="coverage-summary__sample">
          {formatNumber(report.sample.requests)} requests · {formatNumber(report.sample.spans)} spans
          {' · '}
          {report.sample.connected ? 'app connected' : 'no app connected'}
        </span>
      </div>
      <ul className="coverage-summary__items">
        {visible.map((item: CoverageItem) => (
          <li key={item.id} title={item.limitations.join(' ')}>
            <Badge tone={COVERAGE_TONE[item.status]}>{item.status}</Badge>
            <span className="coverage-summary__label">{item.label}</span>
            <span className="coverage-summary__evidence">
              {item.evidence.count > 0
                ? `${formatNumber(item.evidence.count)} · ${formatRelative(item.evidence.lastSeen)}`
                : item.category}
            </span>
          </li>
        ))}
      </ul>
      <p className="muted coverage-summary__note">
        Evidence from the current retention window, not a score or percentage. Empty samples
        do not prove that a feature is broken. Run <code>stacknext coverage</code> for
        limitations.
      </p>
    </div>
  )
}

export function OverviewPage({
  refreshKey,
  onNavigate,
}: {
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const state = useAsync<OverviewData>(
    async (signal) => {
      const [overview, requests, coverage] = await Promise.all([
        api.overview(signal),
        api.requests({ limit: 24, sort: 'recent' }, signal),
        api.coverage(signal),
      ])
      return { overview, requests, coverage }
    },
    'overview',
    refreshKey,
    15_000,
  )

  if (state.loading && !state.data) {
    return (
      <>
        <PageHeader title="Overview" description="Loading local telemetry…" />
        <Loading rows={6} />
      </>
    )
  }
  if (state.error && !state.data) {
    return (
      <>
        <PageHeader title="Overview" description="Local runtime inspection" />
        <ErrorState message={state.error} onRetry={state.reload} />
      </>
    )
  }
  if (!state.data) return <Loading />

  const { overview, requests, coverage } = state.data
  const { health, summary } = overview
  const connected = health.connections.filter((connection) => connection.connected)
  const maxDuration = Math.max(
    1,
    ...requests.items.map((request) => request.durationMs ?? 0),
  )
  const recent = [...requests.items].sort((a, b) => a.timestamp - b.timestamp).slice(-24)

  return (
    <>
      <PageHeader
        eyebrow={health.projectName}
        title="Overview"
        description={
          health.connected
            ? `Live from ${connected[0]?.serviceName ?? 'your app'} · updated ${formatRelative(health.time)}`
            : 'Collector is running, waiting for instrumentation heartbeats.'
        }
        actions={
          <button type="button" className="button button--ghost" onClick={state.reload}>
            <Icon name="refresh" size={15} />
            Refresh
          </button>
        }
      />

      <div className="stat-grid">
        <StatCard
          label="Requests"
          value={formatNumber(summary.totalRequests)}
          hint={`${formatNumber(summary.spanCount)} spans captured`}
          icon="requests"
        />
        <StatCard
          label="Error rate"
          value={errorRate(summary.failedRequests, summary.totalRequests)}
          hint={`${summary.failedRequests} failed requests`}
          tone={summary.failedRequests > 0 ? 'bad' : 'good'}
          icon="errors"
        />
        <StatCard
          label="p95 latency"
          value={formatDuration(summary.p95DurationMs)}
          hint={`avg ${formatDuration(summary.avgDurationMs)}`}
          tone={
            (summary.p95DurationMs ?? 0) > health.config.slowRequestMs ? 'warn' : 'default'
          }
          icon="pulse"
        />
        <StatCard
          label="Slow requests"
          value={formatNumber(summary.slowRequests)}
          hint={`above ${formatDuration(health.config.slowRequestMs)}`}
          tone={summary.slowRequests > 0 ? 'warn' : 'default'}
          icon="clock"
        />
      </div>

      <Card
        title="Instrumentation coverage"
        subtitle="What the current sample proves — not a score"
        actions={
          <Badge tone={coverage.sample.connected ? 'good' : 'muted'}>
            {coverage.sample.connected ? 'connected' : 'listening'}
          </Badge>
        }
      >
        <CoverageSummary report={coverage} />
      </Card>

      {overview.diagnosticOverview && (
        <Card
          title="Diagnostic findings"
          subtitle="Deterministic evidence from the current sample — not confirmed root causes"
          actions={
            <button type="button" className="link" onClick={() => onNavigate('/diagnostics')}>
              View all <Icon name="arrow-right" size={14} />
            </button>
          }
        >
          <div className="badge-row">
            <Badge tone={overview.diagnosticOverview.counts.bySeverity.error > 0 ? 'bad' : 'good'}>
              {overview.diagnosticOverview.counts.bySeverity.error} error
            </Badge>
            <Badge
              tone={overview.diagnosticOverview.counts.bySeverity.warning > 0 ? 'warn' : 'muted'}
            >
              {overview.diagnosticOverview.counts.bySeverity.warning} warning
            </Badge>
            <Badge tone="muted">
              {overview.diagnosticOverview.counts.total} total · rule set v
              {overview.diagnosticOverview.ruleSetVersion}
            </Badge>
          </div>
          {overview.diagnosticOverview.topFindings.length === 0 ? (
            <EmptyState
              compact
              icon="shield"
              title="No diagnostic findings"
              description="No configured rule crossed its threshold in this sample. This is not proof that the app has no problems."
            />
          ) : (
            <ul className="diagnostic-overview">
              {overview.diagnosticOverview.topFindings.map((finding) => (
                <li key={finding.id}>
                  <button type="button" onClick={() => onNavigate(`/diagnostics/${finding.id}`)}>
                    <Badge tone={DIAGNOSTIC_SEVERITY_TONE[finding.severity]}>
                      {finding.severity}
                    </Badge>
                    <span className="diagnostic-overview__title">{finding.title}</span>
                    <span className="diagnostic-overview__meta">
                      {finding.route ?? 'no route'} · {formatRelative(finding.lastSeen)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {summary.totalRequests === 0 ? (
        <Card>
          <EmptyState
            icon="bolt"
            title="No requests captured yet"
            description={
              <>
                StackNext is listening on <code>127.0.0.1:{health.dashboardUrl.split(':').pop()}</code>.
                Make a request to your Next.js app and the timeline will appear here automatically.
              </>
            }
            action={
              <div className="empty-steps">
                <div>
                  <span className="empty-steps__number">1</span>
                  <code>stacknext init</code> configures instrumentation
                </div>
                <div>
                  <span className="empty-steps__number">2</span>
                  <code>stacknext dev</code> starts Next.js and the collector
                </div>
                <div>
                  <span className="empty-steps__number">3</span>
                  Visit your app to generate telemetry
                </div>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="grid grid--2-1">
          <Card
            title="Recent request latency"
            subtitle="Latest 24 requests, scaled to the slowest"
            actions={<Badge tone="accent">{recent.length} requests</Badge>}
          >
            {recent.length === 0 ? (
              <EmptyState compact title="No recent requests" description="New requests appear here live." icon="requests" />
            ) : (
              <div className="latency-chart">
                {recent.map((request) => {
                  const tone = statusTone(request.statusCode)
                  return (
                    <button
                      type="button"
                      key={request.id}
                      className="latency-chart__item"
                      onClick={() => onNavigate(`/requests/${request.traceId}`)}
                      title={`${request.method ?? ''} ${request.route ?? request.name} — ${formatDuration(request.durationMs)}`}
                    >
                      <span
                        className={`latency-chart__bar latency-chart__bar--${tone}`}
                        style={{
                          height: `${Math.max(3, ((request.durationMs ?? 0) / maxDuration) * 100)}%`,
                        }}
                      />
                    </button>
                  )
                })}
                <div className="latency-chart__axis">
                  <span>{formatTime(recent[0]?.timestamp)}</span>
                  <span>now</span>
                </div>
              </div>
            )}
          </Card>

          <Card title="Instrumentation" subtitle="Local app connections">
            {connected.length === 0 ? (
              <EmptyState
                compact
                icon="server"
                title="Waiting for an app"
                description="Start Next.js with the StackNext instrumentation registered. The collector accepts only loopback traffic."
              />
            ) : (
              <div className="connections">
                {connected.map((connection) => (
                  <div key={connection.instanceId} className="connection">
                    <span className="connection__dot" />
                    <div className="connection__body">
                      <div className="connection__name">{connection.serviceName}</div>
                      <div className="connection__meta">
                        {connection.nextVersion ? `Next.js ${connection.nextVersion} · ` : ''}
                        SDK {connection.sdkVersion} · {formatRelative(connection.lastSeen)}
                      </div>
                      {connection.diagnostics && (
                        <div className="connection__meta">
                          {formatNumber(connection.diagnostics.exportedSpans)} spans exported
                          {connection.diagnostics.queueDepth > 0
                            ? ` · ${connection.diagnostics.queueDepth} queued`
                            : ''}
                          {connection.diagnostics.lastError
                            ? ` · ${connection.diagnostics.lastError}`
                            : ''}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="connection__footer">
              <span className="muted">Collector uptime {formatDuration(health.uptimeMs)}</span>
              <Badge tone={health.connected ? 'good' : 'muted'}>
                {health.connected ? 'connected' : 'listening'}
              </Badge>
            </div>
          </Card>
        </div>
      )}

      {summary.totalRequests > 0 && (
        <div className="grid grid--2">
          <Card
            title="Slowest requests"
            subtitle={`Above ${formatDuration(health.config.slowRequestMs)}`}
            actions={
              <button type="button" className="link" onClick={() => onNavigate('/requests?slow=1')}>
                View all <Icon name="arrow-right" size={14} />
              </button>
            }
            padded={false}
          >
            {summary.slowestRequests.length === 0 ? (
              <EmptyState
                compact
                icon="clock"
                title="No slow requests"
                description="Everything is under the configured threshold."
              />
            ) : (
              <table className="table table--compact">
                <tbody>
                  {summary.slowestRequests.map((request) => (
                    <tr key={request.id} onClick={() => onNavigate(`/requests/${request.traceId}`)}>
                      <td>
                        <MethodBadge method={request.method} />
                      </td>
                      <td>
                        <span className="route-cell">{request.route ?? request.name}</span>
                      </td>
                      <td>
                        <StatusCodeBadge code={request.statusCode} failed={request.failed} />
                      </td>
                      <td className="numeric">{formatDuration(request.durationMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card
            title="Recent errors"
            subtitle={`${summary.errorCount} captured`}
            actions={
              <button type="button" className="link" onClick={() => onNavigate('/errors')}>
                View all <Icon name="arrow-right" size={14} />
              </button>
            }
            padded={false}
          >
            {summary.recentErrors.length === 0 ? (
              <EmptyState
                compact
                icon="shield"
                title="No errors captured"
                description="Server errors reported through Next.js onRequestError appear here."
              />
            ) : (
              <ul className="error-list">
                {summary.recentErrors.map((error) => (
                  <li key={error.id}>
                    <button type="button" onClick={() => onNavigate(`/errors/${error.id}`)}>
                      <span className="error-list__name">{error.name}</span>
                      <span className="error-list__message">{error.message}</span>
                      <span className="error-list__meta">
                        {error.route ?? 'unknown route'} · {formatRelative(error.timestamp)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  )
}
