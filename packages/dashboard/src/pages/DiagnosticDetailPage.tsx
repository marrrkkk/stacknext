import type {
  DiagnosticDetailResponse,
  DiagnosticMeasurement,
  DiagnosticSeverity,
  DiagnosticSpanEvidence,
  DiagnosticStatus,
  DiagnosticTraceContext,
} from '@stacknext/core'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  Card,
  CopyButton,
  EmptyState,
  ErrorState,
  KeyValue,
  Loading,
  MethodBadge,
  PageHeader,
  PropertiesRail,
  StatCard,
  StatStrip,
  StatGridSkeleton,
  shortId,
  type Tone,
} from '../components/ui'
import {
  CollapsibleCard,
  DurationValue,
  isMissingRecordError,
  Meter,
  Notice,
  RefreshButton,
  RelativeTime,
} from '../components/details'
import { Icon } from '../components/Icon'
import {
  formatAbsolute,
  formatDateTime,
  formatDuration,
  formatNumber,
  plural,
  truncate,
} from '../format'
import { durationStats, queryShapeId, queryTitle } from '../sql'

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

function numericMeasurements(
  measurements: DiagnosticMeasurement[],
): Array<DiagnosticMeasurement & { value: number }> {
  return measurements.filter(
    (measurement): measurement is DiagnosticMeasurement & { value: number } =>
      typeof measurement.value === 'number' && Number.isFinite(measurement.value),
  )
}

function isMilliseconds(measurement: DiagnosticMeasurement): boolean {
  return (measurement.unit ?? '').toLowerCase() === 'ms'
}

function isThreshold(measurement: DiagnosticMeasurement): boolean {
  return /threshold|limit|budget|target/i.test(measurement.label)
}

function DiagnosticMeter({
  measurements,
}: {
  measurements: DiagnosticMeasurement[]
}): React.ReactElement | null {
  const ms = numericMeasurements(measurements).filter(isMilliseconds)
  const threshold = ms.find(isThreshold)
  const primary = ms.find((measurement) => measurement !== threshold)
  if (!threshold || !primary) return null
  return (
    <Meter
      value={primary.value}
      max={Math.max(primary.value, threshold.value)}
      threshold={threshold.value}
      label={primary.label}
      valueLabel={`${formatDuration(primary.value)} · threshold ${formatDuration(threshold.value)}`}
    />
  )
}

function PositionStrip({
  trace,
  spans,
}: {
  trace: DiagnosticTraceContext
  spans: DiagnosticSpanEvidence[]
}): React.ReactElement | null {
  const byId = new Map(trace.spans.map((span) => [span.spanId, span]))
  const total = Math.max(1, trace.endTime - trace.startTime)
  const rows = spans
    .map((evidence) => {
      const span = byId.get(evidence.spanId)
      if (!span) return null
      const left = Math.max(0, Math.min(100, ((span.startTime - trace.startTime) / total) * 100))
      const width = Math.max(0.8, Math.min(100 - left, (span.durationMs / total) * 100))
      return { evidence, span, left, width }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
  if (rows.length === 0) return null
  return (
    <div className="position-strip">
      <div className="evidence-group__head">
        <span>Position in the trace window</span>
        <span className="muted">wall-clock offset from the first span start</span>
      </div>
      {rows.slice(0, 6).map(({ evidence, span, left, width }) => (
        <div className="position-strip" key={`${evidence.traceId}:${evidence.spanId}`}>
          <div className="position-strip__bar">
            <span
              className="position-strip__segment position-strip__segment--match"
              style={{ marginLeft: `${left}%`, width: `${width}%` }}
              title={`${span.name} · ${formatDuration(span.durationMs)}`}
            />
          </div>
          <div className="position-strip__labels">
            <span className="mono" title={span.spanId}>
              {truncate(span.name, 60)}
            </span>
            <span>
              +{formatDuration(Math.max(0, span.startTime - trace.startTime))} ·{' '}
              <DurationValue ms={span.durationMs} />
            </span>
          </div>
        </div>
      ))}
    </div>
  )
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

  const back = {
    label: 'Diagnostics',
    onClick: () => onNavigate('/diagnostics'),
    trail: shortId(diagnosticId),
  }

  if (state.loading && !state.data) {
    return (
      <>
        <PageHeader detail title="Diagnostic" back={back} />
        <StatGridSkeleton count={5} five />
        <Loading rows={7} label="Loading finding" />
      </>
    )
  }

  if (state.error && !state.data) {
    const missing = isMissingRecordError(state.error)
    return (
      <>
        <PageHeader detail title="Diagnostic" back={back} />
        {missing ? (
          <Notice
            tone="muted"
            icon="shield"
            title="This finding is not in the current sample"
            action={
              <div className="button-row">
                <button
                  type="button"
                  className="button button--secondary button--small"
                  onClick={() => onNavigate('/diagnostics')}
                >
                  Back to diagnostics
                </button>
                <RefreshButton onClick={state.reload} loading={state.loading} />
              </div>
            }
          >
            Findings are recomputed from the current in-memory sample. A finding
            can disappear when its evidence ages out or the store changes; it is
            never reconstructed from a cached verdict.
          </Notice>
        ) : (
          <ErrorState message={state.error} onRetry={state.reload} />
        )}
      </>
    )
  }

  if (!state.data) return <Loading />

  const finding = state.data.finding
  const trace = state.data.trace
  const affectedTraceCount = finding.affectedTraceCount ?? finding.traceIds.length
  const evidenceCount =
    finding.evidence.spans.length +
    finding.evidence.queries.length +
    finding.evidence.errors.length
  const queryGroups = new Map<
    string,
    { shape: string; queries: DiagnosticDetailResponse['finding']['evidence']['queries'] }
  >()
  for (const query of finding.evidence.queries) {
    const key = query.sqlFingerprint
    const existing = queryGroups.get(key)
    if (existing) existing.queries.push(query)
    else queryGroups.set(key, { shape: key, queries: [query] })
  }
  const measurementValues = numericMeasurements(finding.evidence.measurements)

  return (
    <>
      <PageHeader
        detail
        back={back}
        eyebrow={`${finding.ruleId} · rule v${finding.ruleVersion}`}
        title={<span className="detail-title__text">{finding.title}</span>}
        detailAside={
          <>
            <Badge tone={SEVERITY_TONE[finding.severity]}>{finding.severity}</Badge>
            <Badge tone={STATUS_TONE[finding.status]}>{finding.status}</Badge>
            <Badge tone="muted">{finding.category}</Badge>
          </>
        }
        description={
          <>
            <span>
              first seen <RelativeTime timestamp={finding.firstSeen} />
            </span>
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <span>
              last seen <RelativeTime timestamp={finding.lastSeen} />
            </span>
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <span>{finding.route ?? 'no route'}</span>
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <span>{finding.method ?? 'no method'}</span>
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <span className="mono" title={finding.fingerprint}>
              {shortId(finding.fingerprint)}
            </span>
          </>
        }
        actions={
          <>
            <CopyButton value={finding.id} label="Copy finding id" primary />
            {trace && (
              <button
                type="button"
                className="button button--secondary"
                onClick={() => onNavigate(`/traces/${trace.traceId}`)}
              >
                <Icon name="traces" size={15} />
                Open trace
              </button>
            )}
            <RefreshButton onClick={state.reload} loading={state.loading} />
          </>
        }
      />

      <StatStrip five>
        <StatCard
          label="Severity"
          value={<span style={{ textTransform: 'capitalize' }}>{finding.severity}</span>}
          hint="not a root-cause verdict"
          tone={finding.severity === 'error' ? 'bad' : finding.severity === 'warning' ? 'warn' : 'default'}
        />
        <StatCard
          label="Status"
          value={<span style={{ textTransform: 'capitalize' }}>{finding.status}</span>}
          hint="derived from the current sample"
          tone={finding.status === 'observed' ? 'good' : 'warn'}
        />
        <StatCard
          label="Traces"
          value={formatNumber(affectedTraceCount)}
          hint="distinct traces matched"
        />
        <StatCard
          label="Evidence"
          value={formatNumber(evidenceCount)}
          hint={`${plural(finding.evidence.spans.length, 'span')} · ${plural(finding.evidence.queries.length, 'query', 'queries')} · ${plural(finding.evidence.errors.length, 'error')}`}
        />
        <StatCard
          label="Rule version"
          value={`v${finding.ruleVersion}`}
          hint="deterministic rule set"
        />
      </StatStrip>

      <Notice tone="warn" icon="shield" title="This is evidence, not a confirmed root cause">
        {finding.summary} Verify the finding against the calling code and a fresh
        trace before changing anything. The status <strong>{finding.status}</strong>{' '}
        describes the evidence in this sample, not a probability.
      </Notice>

      <div className="layout">
        <div className="layout__main">
          <Card
            title="What the evidence shows"
            subtitle={finding.detail}
            actions={<Badge tone="muted">{finding.category}</Badge>}
          >
            <div className="stack">
              {finding.evidence.measurements.length === 0 ? (
                <p className="muted">
                  This finding has no measurements. The evidence below is the
                  complete support available in the current sample.
                </p>
              ) : (
                <>
                  <DiagnosticMeter measurements={finding.evidence.measurements} />
                  <dl className="key-values">
                    {finding.evidence.measurements.map((measurement) => (
                      <div className="key-values__row" key={measurement.label}>
                        <dt>{measurement.label}</dt>
                        <dd
                          className="mono tabular"
                          title={
                            measurement.value === null
                              ? 'The rule did not compute this measurement.'
                              : undefined
                          }
                        >
                          {measurement.value === null ? (
                            <span className="muted">unmeasured</span>
                          ) : isMilliseconds(measurement) &&
                            typeof measurement.value === 'number' ? (
                            <DurationValue ms={measurement.value} />
                          ) : (
                            <>
                              {String(measurement.value)}
                              {measurement.unit ? ` ${measurement.unit}` : ''}
                            </>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
              {measurementValues.length > 0 && (
                <p className="muted">
                  Measurements are bounded values from the current sample. They are
                  not a score, a percentile claim or a significance test.
                </p>
              )}
            </div>
          </Card>

          {finding.evidence.spans.length > 0 && (
            <Card
              title="Span evidence"
              subtitle="Bounded to the spans attached to this finding. Grouped by trace."
              meta={<span className="tabular">{plural(finding.evidence.spans.length, 'span')}</span>}
              padded={false}
            >
              <div className="stack">
                {trace && (
                  <div style={{ padding: 'var(--sp-4)' }}>
                    <PositionStrip trace={trace} spans={finding.evidence.spans} />
                  </div>
                )}
                <div className="table-scroll">
                  <table className="table table--compact">
                    <thead>
                      <tr>
                        <th>Span</th>
                        <th>Category / phase</th>
                        <th className="numeric">Duration</th>
                        <th className="numeric">Self time</th>
                        <th>Status</th>
                        <th>Trace</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finding.evidence.spans.map((span) => (
                        <tr key={`${span.traceId}:${span.spanId}`}>
                          <td>
                            <div className="route-cell" title={span.name}>
                              {span.name}
                            </div>
                            <div className="sub-cell mono" title={span.spanId}>
                              {shortId(span.spanId)}
                              {span.nextSpanType ? ` · ${span.nextSpanType}` : ''}
                            </div>
                          </td>
                          <td>
                            <Badge tone="muted">{span.category}</Badge>
                            {span.nextPhase && (
                              <div className="sub-cell">{span.nextPhase}</div>
                            )}
                          </td>
                          <td className="numeric">
                            <DurationValue ms={span.durationMs} />
                          </td>
                          <td className="numeric">
                            {span.selfDurationMs === undefined ? (
                              <span className="muted">—</span>
                            ) : (
                              <DurationValue ms={span.selfDurationMs} />
                            )}
                          </td>
                          <td>
                            <Badge tone={span.status === 'error' ? 'bad' : 'muted'}>
                              {span.status}
                            </Badge>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="link mono"
                              title={span.traceId}
                              onClick={() => onNavigate(`/traces/${span.traceId}`)}
                            >
                              {shortId(span.traceId)}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          )}

          {finding.evidence.queries.length > 0 && (
            <Card
              title="Query evidence"
              subtitle="Normalized SQL shapes only. Literals and bind values are removed."
              meta={<span className="tabular">{plural(queryGroups.size, 'shape')}</span>}
              padded={false}
            >
              <div className="query-groups">
                {[...queryGroups.values()].map((group) => {
                  const stats = durationStats(
                    group.queries.map((query) => ({ durationMs: query.durationMs })),
                  )
                  const title = queryTitle(group.shape)
                  const shapeId = queryShapeId(group.shape)
                  return (
                    <section className="query-group" key={group.shape}>
                      <div className="query-group__head">
                        <div className="query-group__main">
                          <div className="query-group__title">
                            <span className="mono">{title.operation}</span>
                            {title.table && <span>{title.table}</span>}
                            <Badge tone="accent">{group.queries[0]?.databaseSystem}</Badge>
                          </div>
                          <code className="query-group__sql" title={group.shape}>
                            {group.shape}
                          </code>
                          <div className="query-group__meta">
                            <span>{plural(group.queries.length, 'execution')}</span>
                            <span>
                              median <DurationValue ms={stats.median} />
                            </span>
                            {stats.measured < group.queries.length && (
                              <span>
                                {plural(group.queries.length - stats.measured, 'missing duration')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="query-group__stats">
                          <button
                            type="button"
                            className="button button--secondary button--small"
                            onClick={() => onNavigate(`/database/${shapeId}`)}
                          >
                            Open shape <Icon name="arrow-right" size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="query-group__body">
                        <div className="execution-list">
                          {group.queries.map((query) => (
                            <div className="execution-row" key={query.id}>
                              <span className="execution-row__sql" title={query.sqlPreview}>
                                {query.success ? 'success' : 'failed'}
                                {query.traceId ? ` · trace ${shortId(query.traceId)}` : ''}
                              </span>
                              <span className="execution-row__duration">
                                <DurationValue ms={query.durationMs} />
                              </span>
                              <span className="execution-row__time">
                                <RelativeTime timestamp={query.timestamp} />
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="button-row" style={{ marginTop: 'var(--sp-2)' }}>
                          {group.queries[0]?.traceId && (
                            <button
                              type="button"
                              className="button button--ghost button--small"
                              onClick={() =>
                                onNavigate(
                                  `/traces/${group.queries[0]?.traceId}?tab=database`,
                                )
                              }
                            >
                              Open trace database tab
                            </button>
                          )}
                        </div>
                      </div>
                    </section>
                  )
                })}
              </div>
            </Card>
          )}

          {finding.evidence.contributors.length > 0 && (
            <Card
              title="Self-time contributors"
              subtitle="Self time subtracts the union of direct child span intervals. It attributes time; it does not prove causality."
              meta={
                <span className="tabular">
                  {plural(finding.evidence.contributors.length, 'contributor')}
                </span>
              }
              padded={false}
            >
              <div className="table-scroll">
                <table className="table table--compact">
                  <thead>
                    <tr>
                      <th>Contributor</th>
                      <th>Category / phase</th>
                      <th className="numeric">Self time</th>
                      <th className="numeric">Duration</th>
                      <th>Trace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finding.evidence.contributors.map((contributor, index) => (
                      <tr key={`${contributor.traceId ?? ''}:${contributor.spanId ?? ''}:${index}`}>
                        <td>
                          <div className="route-cell" title={contributor.label}>
                            {contributor.label}
                          </div>
                          {contributor.spanId && (
                            <div className="sub-cell mono" title={contributor.spanId}>
                              {shortId(contributor.spanId)}
                            </div>
                          )}
                        </td>
                        <td>
                          <Badge tone="muted">{contributor.category}</Badge>
                          {contributor.phase && (
                            <div className="sub-cell">{contributor.phase}</div>
                          )}
                        </td>
                        <td className="numeric">
                          <DurationValue ms={contributor.selfMs} />
                        </td>
                        <td className="numeric">
                          {contributor.durationMs === undefined ? (
                            <span className="muted">—</span>
                          ) : (
                            <DurationValue ms={contributor.durationMs} />
                          )}
                        </td>
                        <td>
                          {contributor.traceId ? (
                            <button
                              type="button"
                              className="link mono"
                              title={contributor.traceId}
                              onClick={() => onNavigate(`/traces/${contributor.traceId}`)}
                            >
                              {shortId(contributor.traceId)}
                            </button>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {finding.evidence.traces.length > 0 && (
            <Card
              title="Trace occurrences"
              subtitle="Grouped evidence across traces. Occurrence counts and durations are bounded samples."
              meta={
                <span className="tabular">
                  {plural(finding.evidence.traces.length, 'trace')}
                </span>
              }
              padded={false}
            >
              <div className="table-scroll">
                <table className="table table--compact">
                  <thead>
                    <tr>
                      <th>Trace</th>
                      <th className="numeric">Occurrences</th>
                      <th>Contributor</th>
                      <th className="numeric">Duration</th>
                      <th>Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finding.evidence.traces.map((occurrence) => (
                      <tr key={occurrence.traceId}>
                        <td>
                          <button
                            type="button"
                            className="link mono"
                            title={occurrence.traceId}
                            onClick={() => onNavigate(`/traces/${occurrence.traceId}`)}
                          >
                            {shortId(occurrence.traceId)}
                          </button>
                        </td>
                        <td className="numeric tabular">{formatNumber(occurrence.occurrences)}</td>
                        <td>
                          <span className="muted">{occurrence.contributor ?? '—'}</span>
                        </td>
                        <td className="numeric">
                          {occurrence.durationMs === undefined ? (
                            <span className="muted">—</span>
                          ) : (
                            <DurationValue ms={occurrence.durationMs} />
                          )}
                        </td>
                        <td>
                          <RelativeTime timestamp={occurrence.timestamp} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {finding.evidence.errors.length > 0 && (
            <Card
              title="Error evidence"
              subtitle="Latest occurrences in this group."
              meta={<span className="tabular">{plural(finding.evidence.errors.length, 'error')}</span>}
              padded={false}
            >
              <ul className="error-list">
                {finding.evidence.errors.map((error) => (
                  <li key={error.id}>
                    <button type="button" onClick={() => onNavigate(`/errors/${error.id}`)}>
                      <span className="error-list__name">{error.name}</span>
                      <span className="error-list__message">{truncate(error.message, 220)}</span>
                      <span className="error-list__meta">
                        {error.route ?? 'unknown route'} · <RelativeTime timestamp={error.timestamp} />
                        {error.routeType ? ` · ${error.routeType}` : ''}
                        {error.renderType ? ` · ${error.renderType}` : ''}
                        {error.statusCode === undefined ? '' : ` · HTTP ${error.statusCode}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card
            title="Related trace"
            subtitle="The latest trace referenced by this finding. The trace is context, not proof."
          >
            {trace ? (
              <div className="trace-summary">
                <div className="trace-summary__main">
                  <MethodBadge method={trace.request?.method ?? null} />
                  <div>
                    <div className="route-cell">
                      {trace.request?.route ?? trace.request?.name ?? 'Trace'}
                    </div>
                    <div className="sub-cell">
                      <RelativeTime timestamp={trace.startTime} /> ·{' '}
                      <DurationValue ms={trace.durationMs} />
                    </div>
                  </div>
                </div>
                <div className="trace-summary__stats">
                  <span>{plural(trace.spanCount, 'span')}</span>
                  <span>{plural(trace.errorCount, 'error')}</span>
                  <span>{plural(trace.databaseQueryCount, 'query', 'queries')}</span>
                </div>
                {trace.missingParentSpanIds.length > 0 && (
                  <p className="muted">
                    Missing parent spans: {trace.missingParentSpanIds.join(', ')}
                  </p>
                )}
                <div className="button-row">
                  <button
                    type="button"
                    className="button button--primary button--small"
                    onClick={() => onNavigate(`/traces/${trace.traceId}`)}
                  >
                    Open timeline <Icon name="arrow-right" size={14} />
                  </button>
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    onClick={() => onNavigate(`/traces/${trace.traceId}?tab=database`)}
                  >
                    <Icon name="database" size={14} />
                    Database tab
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

          <Card
            title="Verification order"
            subtitle="Work through these checks in order before treating the finding as a cause."
          >
            <ol className="verification-list">
              {finding.verification.map((step, index) => (
                <li key={step}>
                  <span className="verification-step">
                    <span className="verification-step__check" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <PropertiesRail>
          <Card title="Details">
            <KeyValue
              entries={[
                {
                  label: 'Rule',
                  value: <span className="mono">{finding.ruleId}</span>,
                },
                { label: 'Category', value: finding.category },
                { label: 'Severity', value: finding.severity },
                { label: 'Status', value: finding.status },
                {
                  label: 'Route',
                  value: finding.route ? (
                    <span className="mono">{finding.route}</span>
                  ) : null,
                  emptyReason: 'The finding is route-independent.',
                },
                {
                  label: 'Method',
                  value: finding.method ?? null,
                  emptyReason: 'No HTTP method was attached.',
                },
                {
                  label: 'First seen',
                  value: <RelativeTime timestamp={finding.firstSeen} />,
                  title: formatAbsolute(finding.firstSeen),
                },
                {
                  label: 'Last seen',
                  value: <RelativeTime timestamp={finding.lastSeen} />,
                  title: formatAbsolute(finding.lastSeen),
                },
                {
                  label: 'Traces',
                  value: formatNumber(affectedTraceCount),
                  numeric: true,
                },
                {
                  label: 'Evidence items',
                  value: formatNumber(evidenceCount),
                  numeric: true,
                },
                {
                  label: 'Generated',
                  value: formatDateTime(finding.lastSeen),
                },
              ]}
            />
          </Card>

          <Card title="Fingerprint" subtitle="Stable within this rule set version">
            <div className="stack">
              <div className="fingerprint">
                <code>{finding.fingerprint}</code>
                <CopyButton value={finding.fingerprint} label="Copy fingerprint" small />
              </div>
              <p className="muted mono">{finding.id}</p>
              <p className="muted">
                Changing the rule set version can change this fingerprint. The
                finding id is stable for the current engine only.
              </p>
            </div>
          </Card>

          <CollapsibleCard
            title="Limitations"
            description="Why this is not a root-cause verdict."
            meta={<span className="tabular">{finding.limitations.length}</span>}
            storageKey="diagnostic:limitations"
            defaultOpen
          >
            <ul className="notes-list">
              {finding.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </CollapsibleCard>

          <Card title="Seen in" subtitle="Trace ids attached to this finding">
            {finding.traceIds.length === 0 ? (
              <p className="muted">No trace id was attached to this finding.</p>
            ) : (
              <div className="stack stack--tight">
                {finding.traceIds.slice(0, 8).map((traceId) => (
                  <button
                    type="button"
                    key={traceId}
                    className="link mono"
                    title={traceId}
                    onClick={() => onNavigate(`/traces/${traceId}`)}
                  >
                    {shortId(traceId)}
                  </button>
                ))}
              </div>
            )}
          </Card>
        </PropertiesRail>
      </div>
    </>
  )
}
