import type {
  Baseline,
  CapturedSample,
  CapturedScenario,
  Comparison,
  EnvironmentSnapshot,
  RegressionMetric,
  RegressionSeverity,
  RegressionStatus,
  RunSummary,
  TestRun,
} from '@stacknext/regression'
import { Badge, Card, EmptyState, type Tone } from '../components/ui'
import { formatDateTime, formatDuration, formatNumber, formatRelative } from '../format'

export const RUN_STATUS_TONE: Record<TestRun['status'], Tone> = {
  running: 'accent',
  completed: 'good',
  failed: 'bad',
  interrupted: 'warn',
  incomplete: 'warn',
}

export const CORRELATION_TONE: Record<'verified' | 'incomplete', Tone> = {
  verified: 'good',
  incomplete: 'warn',
}

export const REGRESSION_STATUS_TONE: Record<RegressionStatus, Tone> = {
  improved: 'good',
  regressed: 'bad',
  unchanged: 'good',
  inconclusive: 'warn',
}

export const REGRESSION_SEVERITY_TONE: Record<RegressionSeverity, Tone> = {
  high: 'bad',
  medium: 'warn',
  low: 'accent',
  none: 'muted',
}

const SAMPLE_STATUS_LABEL: Record<CapturedSample['status'], string> = {
  passed: 'passed',
  failed: 'failed',
  timedOut: 'timed out',
  skipped: 'skipped',
  interrupted: 'interrupted',
}

const SAMPLE_STATUS_TONE: Record<CapturedSample['status'], Tone> = {
  passed: 'good',
  failed: 'bad',
  timedOut: 'warn',
  skipped: 'muted',
  interrupted: 'warn',
}

function verifiedCount(scenario: CapturedScenario): number {
  return scenario.samples.filter((sample) => sample.correlation.status === 'verified').length
}

function incompleteCount(scenario: CapturedScenario): number {
  return scenario.samples.length - verifiedCount(scenario)
}

function traceCount(scenario: CapturedScenario): number {
  return scenario.samples.reduce(
    (sum, sample) => sum + sample.correlation.traces.length,
    0,
  )
}

export function scenarioSummaryLine(scenario: CapturedScenario): string {
  const parts = [
    `${scenario.samples.length} sample${scenario.samples.length === 1 ? '' : 's'}`,
    `${verifiedCount(scenario)} verified`,
    `${traceCount(scenario)} trace${traceCount(scenario) === 1 ? '' : 's'}`,
    `${scenario.findings.length} finding${scenario.findings.length === 1 ? '' : 's'}`,
  ]
  if (incompleteCount(scenario) > 0) {
    parts.push(`${incompleteCount(scenario)} incomplete`)
  }
  return parts.join(' · ')
}

export function EnvironmentCard({
  environment,
  title = 'Environment',
}: {
  environment: EnvironmentSnapshot
  title?: string
}): React.ReactElement {
  return (
    <Card
      title={title}
      subtitle="Comparisons require these dimensions to match unless explicitly overridden"
    >
      <dl className="key-values">
        <div className="key-values__row">
          <dt>Node.js</dt>
          <dd className="mono">{environment.nodeVersion}</dd>
        </div>
        <div className="key-values__row">
          <dt>Next.js</dt>
          <dd className="mono">{environment.nextVersion ?? 'not detected'}</dd>
        </div>
        <div className="key-values__row">
          <dt>Platform</dt>
          <dd className="mono">
            {environment.platform}/{environment.arch} · {environment.runtime}
          </dd>
        </div>
        <div className="key-values__row">
          <dt>Databases</dt>
          <dd className="mono">{environment.databases.join(', ') || 'none detected'}</dd>
        </div>
        <div className="key-values__row">
          <dt>Tracing</dt>
          <dd>
            {environment.instrumentation.verbose
              ? `verbose (${environment.instrumentation.verboseSource})`
              : `standard (${environment.instrumentation.verboseSource})`}
            {environment.instrumentation.captureFetch ? ' · fetch' : ''}
            {environment.instrumentation.captureErrors ? ' · errors' : ''}
          </dd>
        </div>
        <div className="key-values__row">
          <dt>Versions</dt>
          <dd className="mono">
            SDK {environment.sdkVersion}
            {environment.playwrightVersion ? ` · Playwright ${environment.playwrightVersion}` : ''}
          </dd>
        </div>
      </dl>
    </Card>
  )
}

function TraceEvidence({
  trace,
}: {
  trace: CapturedScenario['samples'][number]['correlation']['traces'][number]
}): React.ReactElement {
  return (
    <details className="regression-trace">
      <summary>
        <span className="mono">{trace.route ?? trace.rootName}</span>
        <span className="muted">
          {trace.method ?? '—'} · {formatDuration(trace.durationMs)} · {trace.spanCount} spans ·{' '}
          {trace.databaseQueryCount} queries · {trace.errorCount} errors
        </span>
        {trace.statusCode !== null && (
          <Badge tone={trace.statusCode >= 500 ? 'bad' : trace.statusCode >= 400 ? 'warn' : 'good'}>
            {trace.statusCode}
          </Badge>
        )}
      </summary>
      <div className="regression-trace__body">
        <p className="muted mono">
          trace {trace.traceId} · matched via injected parent {trace.injectedSpanId} · key {trace.key}
        </p>
        {trace.spans.length > 0 && (
          <table className="table table--compact">
            <thead>
              <tr>
                <th>Span</th>
                <th>Category</th>
                <th className="numeric">Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {trace.spans.map((span, index) => (
                <tr key={`${span.key}:${index}`}>
                  <td className="mono">{span.name}</td>
                  <td>
                    <Badge tone="muted">{span.category}</Badge>
                  </td>
                  <td className="numeric">{formatDuration(span.durationMs)}</td>
                  <td>
                    <Badge tone={span.status === 'error' ? 'bad' : 'muted'}>{span.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {trace.queries.length > 0 && (
          <div className="regression-trace__queries">
            <h4>Database queries</h4>
            {trace.queries.map((query, index) => (
              <div className="evidence-block" key={`${query.key}:${index}`}>
                <div className="evidence-block__top">
                  <Badge tone="muted">{query.source}</Badge>
                  <span className="muted">
                    {query.durationMs === null ? 'duration unmeasured' : formatDuration(query.durationMs)}
                  </span>
                  {!query.success && <Badge tone="bad">failed</Badge>}
                </div>
                <pre className="code-block code-block--scroll">{query.shape}</pre>
              </div>
            ))}
          </div>
        )}
        {trace.errors.length > 0 && (
          <div className="regression-trace__queries">
            <h4>Errors</h4>
            <ul className="notes-list">
              {trace.errors.map((error, index) => (
                <li key={`${error.key}:${index}`}>
                  <span className="mono">{error.name}</span> {error.message}
                  {error.route ? ` · ${error.route}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  )
}

function SampleEvidence({ sample }: { sample: CapturedSample }): React.ReactElement {
  return (
    <details className="regression-sample">
      <summary>
        <Badge tone={SAMPLE_STATUS_TONE[sample.status]}>
          {SAMPLE_STATUS_LABEL[sample.status]}
        </Badge>
        <Badge tone={CORRELATION_TONE[sample.correlation.status]}>
          {sample.correlation.status}
        </Badge>
        <span className="muted">
          retry {sample.retry} · repeat {sample.repeatEachIndex} · {formatDuration(sample.durationMs)}
        </span>
        <span className="regression-sample__time muted">
          {formatRelative(sample.capturedAt)}
        </span>
      </summary>
      <div className="regression-sample__body">
        {sample.correlation.reasons.length > 0 && (
          <ul className="notes-list">
            {sample.correlation.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {sample.correlation.traces.length === 0 ? (
          <p className="muted">
            No trace was verified for this sample. Missing telemetry is reported as incomplete, not
            as a zero measurement.
          </p>
        ) : (
          sample.correlation.traces.map((trace) => (
            <TraceEvidence key={`${trace.traceId}:${trace.key}`} trace={trace} />
          ))
        )}
      </div>
    </details>
  )
}

export function ScenarioEvidence({
  scenarios,
  emptyDescription = 'No scenario samples were captured for this record.',
}: {
  scenarios: CapturedScenario[]
  emptyDescription?: string
}): React.ReactElement {
  if (scenarios.length === 0) {
    return (
      <Card>
        <EmptyState
          compact
          icon="traces"
          title="No scenarios captured"
          description={emptyDescription}
        />
      </Card>
    )
  }
  return (
    <Card
      title="Scenarios"
      subtitle="Playwright scenario identity, verified correlation evidence and bounded diagnostics"
      padded={false}
    >
      <div className="regression-scenarios">
        {scenarios.map((scenario) => (
          <section className="regression-scenario" key={scenario.identity.id}>
            <header className="regression-scenario__header">
              <div>
                <h3>{scenario.identity.title}</h3>
                <p className="muted">
                  {scenario.identity.file} · {scenario.identity.project} ·{' '}
                  <span className="mono">{scenario.identity.id}</span>
                </p>
              </div>
              <div className="badge-row">
                <Badge tone="muted">{scenario.identity.source}</Badge>
                <Badge tone={incompleteCount(scenario) > 0 ? 'warn' : 'good'}>
                  {verifiedCount(scenario)} verified
                </Badge>
                {incompleteCount(scenario) > 0 && (
                  <Badge tone="warn">{incompleteCount(scenario)} incomplete</Badge>
                )}
                <Badge tone="muted">{scenario.findings.length} findings</Badge>
              </div>
            </header>
            {scenario.identity.tags.length > 0 && (
              <div className="badge-row">
                {scenario.identity.tags.map((tag) => (
                  <Badge tone="accent" key={tag}>
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            <div className="regression-samples">
              {scenario.samples.map((sample, index) => (
                <SampleEvidence
                  key={`${sample.id}:${index}`}
                  sample={sample}
                />
              ))}
            </div>
            {scenario.findings.length > 0 && (
              <div className="regression-scenario__findings">
                <h4>Diagnostic findings in verified samples</h4>
                <div className="badge-row">
                  {scenario.findings.map((finding, index) => (
                    <Badge
                      key={`${finding.key}:${index}`}
                      tone={
                        finding.severity === 'error'
                          ? 'bad'
                          : finding.severity === 'warning'
                            ? 'warn'
                            : 'accent'
                      }
                    >
                      {finding.ruleId}: {finding.status}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {(scenario.notes.length > 0 || scenario.limitations.length > 0) && (
              <div className="regression-scenario__notes">
                {scenario.notes.length > 0 && (
                  <ul className="notes-list">
                    {scenario.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                )}
                {scenario.limitations.length > 0 && (
                  <ul className="notes-list">
                    {scenario.limitations.map((limitation) => (
                      <li key={limitation}>{limitation}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        ))}
      </div>
    </Card>
  )
}

export function runTelemetrySummary(run: TestRun, summary?: RunSummary): string {
  const stats = summary
    ? {
        scenarios: summary.scenarios,
        samples: summary.samples,
        verifiedSamples: summary.verifiedSamples,
        incompleteSamples: summary.incompleteSamples,
        traces: undefined,
      }
    : run.stats
  return [
    `${formatNumber(stats.scenarios)} scenarios`,
    `${formatNumber(stats.samples)} samples`,
    `${formatNumber(stats.verifiedSamples)} verified`,
    `${formatNumber(stats.incompleteSamples)} incomplete`,
    stats.traces === undefined ? null : `${formatNumber(stats.traces)} traces`,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function formatMetricValue(
  metric: RegressionMetric,
  value: number | null,
): string {
  if (value === null) return '—'
  if (metric.kind === 'duration') return formatDuration(value)
  return formatNumber(value)
}

export function formatMetricDelta(metric: RegressionMetric): string {
  if (metric.delta === null) return '—'
  const sign = metric.delta > 0 ? '+' : ''
  const delta =
    metric.kind === 'duration'
      ? `${sign}${formatDuration(Math.abs(metric.delta))}`
      : `${sign}${formatNumber(metric.delta)}`
  const absolute = metric.delta < 0 && metric.kind === 'duration' ? `-${formatDuration(Math.abs(metric.delta))}` : delta
  return metric.percent === null ? absolute : `${absolute} (${metric.percent > 0 ? '+' : ''}${metric.percent}%)`
}

export function comparisonScope(comparison: Comparison): string {
  return `${formatNumber(comparison.summary.scenarios)} scenarios · ${formatNumber(comparison.summary.regressed)} regressed · ${formatNumber(comparison.summary.improved)} improved · ${formatNumber(comparison.summary.unchanged)} unchanged · ${formatNumber(comparison.summary.inconclusive)} inconclusive`
}

export function baselineSource(baseline: Baseline): string {
  return baseline.sourceRunId
}

export function validationNotes(record: {
  warnings: string[]
  limitations: string[]
}): React.ReactElement {
  return (
    <Card title="Warnings & limitations" subtitle="Keep the evidence boundary visible">
      {record.warnings.length > 0 ? (
        <ul className="notes-list">
          {record.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">No capture warnings were recorded.</p>
      )}
      {record.limitations.length > 0 && (
        <ul className="notes-list">
          {record.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function capturedAt(timestamp: number): string {
  return formatDateTime(timestamp)
}
