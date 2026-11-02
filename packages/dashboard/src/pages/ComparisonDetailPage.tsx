import type { Comparison, RegressionMetric, ScenarioComparison } from '@stacknext/regression'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  Card,
  CopyButton,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  StatCard,
} from '../components/ui'
import { Icon } from '../components/Icon'
import { formatDateTime, formatNumber, formatRelative } from '../format'
import {
  REGRESSION_SEVERITY_TONE,
  REGRESSION_STATUS_TONE,
  formatMetricDelta,
  formatMetricValue,
  validationNotes,
} from './RegressionScenarios'

function MetricTable({ metrics }: { metrics: RegressionMetric[] }): React.ReactElement {
  return (
    <div className="table-scroll">
      <table className="table table--compact">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Status</th>
            <th className="numeric">Baseline</th>
            <th className="numeric">Candidate</th>
            <th className="numeric">Delta</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric, index) => (
            <tr key={`${metric.key}:${index}`}>
              <td className="mono">{metric.label}</td>
              <td>
                <Badge tone={REGRESSION_STATUS_TONE[metric.status]}>{metric.status}</Badge>
              </td>
              <td className="numeric">{formatMetricValue(metric, metric.baselineValue)}</td>
              <td className="numeric">{formatMetricValue(metric, metric.candidateValue)}</td>
              <td className="numeric">{formatMetricDelta(metric)}</td>
              <td className="muted">{metric.note ?? `${metric.sampleCount} samples`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ScenarioComparisonCard({
  scenario,
}: {
  scenario: ScenarioComparison
}): React.ReactElement {
  const changed = scenario.metrics.filter((metric) => metric.status !== 'unchanged')
  const unchanged = scenario.metrics.length - changed.length
  return (
    <section className="regression-scenario">
      <header className="regression-scenario__header">
        <div>
          <h3>{scenario.title}</h3>
          <p className="muted">
            {scenario.file} · {scenario.project} ·{' '}
            <span className="mono">{scenario.scenarioId}</span>
          </p>
        </div>
        <div className="badge-row">
          <Badge tone={REGRESSION_STATUS_TONE[scenario.status]}>{scenario.status}</Badge>
          <Badge tone={REGRESSION_SEVERITY_TONE[scenario.severity]}>
            {scenario.severity} severity
          </Badge>
        </div>
      </header>

      <div className="regression-scenario__sides">
        <div>
          <span className="muted">Baseline</span>
          <strong>
            {scenario.baseline.verifiedSamples} verified / {scenario.baseline.samples} samples
          </strong>
          <span className="muted">
            {scenario.baseline.traces} traces · {scenario.baseline.findings} findings
          </span>
        </div>
        <div>
          <span className="muted">Candidate</span>
          <strong>
            {scenario.candidate.verifiedSamples} verified / {scenario.candidate.samples} samples
          </strong>
          <span className="muted">
            {scenario.candidate.traces} traces · {scenario.candidate.findings} findings
          </span>
        </div>
      </div>

      {scenario.reasons.length > 0 && (
        <div className="regression-reasons">
          <h4>Why this status</h4>
          <ul className="notes-list">
            {scenario.reasons.map((reason) => (
              <li key={reason} className="mono">
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {scenario.metrics.length === 0 ? (
        <p className="muted">
          No metrics are computed while this scenario is inconclusive. Time-window guesses and
          fabricated zeros are never used to fill the gap.
        </p>
      ) : changed.length > 0 ? (
        <div className="regression-metrics">
          <h4>Changed metrics</h4>
          <MetricTable metrics={changed} />
          {unchanged > 0 && (
            <details className="regression-metrics__all">
              <summary>{unchanged} unchanged metric{unchanged === 1 ? '' : 's'}</summary>
              <MetricTable metrics={scenario.metrics.filter((metric) => metric.status === 'unchanged')} />
            </details>
          )}
        </div>
      ) : (
        <details className="regression-metrics__all">
          <summary>{unchanged} metric{unchanged === 1 ? '' : 's'} measured as unchanged</summary>
          <MetricTable metrics={scenario.metrics} />
        </details>
      )}
    </section>
  )
}

export function ComparisonDetailPage({
  comparisonId,
  refreshKey,
  onNavigate,
}: {
  comparisonId: string
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const state = useAsync<Comparison>(
    (signal) => api.comparison(comparisonId, signal),
    `comparison:${comparisonId}`,
    refreshKey,
  )

  return (
    <>
      <div className="breadcrumb">
        <button type="button" className="link" onClick={() => onNavigate('/comparisons')}>
          <Icon name="chevron-left" size={14} /> Comparisons
        </button>
        <span>/</span>
        <span className="mono">{comparisonId}</span>
      </div>

      {state.loading && !state.data ? (
        <Loading rows={8} label="Loading comparison" />
      ) : state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={state.reload} />
      ) : state.data ? (
        <>
          <PageHeader
            eyebrow="Deterministic comparison"
            title={`Comparison ${state.data.status}`}
            description={`${state.data.projectName} · ${formatDateTime(state.data.createdAt)} · baseline ${state.data.baselineId} → candidate ${state.data.candidateId}`}
            actions={
              <div className="button-row">
                <CopyButton value={state.data.id} label="Copy comparison id" />
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => onNavigate(`/baselines/${state.data?.baselineId}`)}
                >
                  Baseline
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => onNavigate(`/runs/${state.data?.candidateId}`)}
                >
                  Candidate run
                </button>
                <button type="button" className="button button--ghost" onClick={state.reload}>
                  <Icon name="refresh" size={15} /> Refresh
                </button>
              </div>
            }
          />

          <div className="badge-row">
            <Badge tone={REGRESSION_STATUS_TONE[state.data.status]}>{state.data.status}</Badge>
            <Badge tone={REGRESSION_SEVERITY_TONE[state.data.severity]}>
              {state.data.severity} severity
            </Badge>
            <Badge tone={state.data.environment.compatible ? 'good' : 'warn'}>
              environment {state.data.environment.compatible ? 'compatible' : 'different'}
            </Badge>
            {state.data.environment.ignored && (
              <Badge tone="warn">environment mismatch explicitly ignored</Badge>
            )}
            <Badge tone="muted">format v{state.data.version}</Badge>
          </div>

          <div className="stat-grid">
            <StatCard
              label="Scenarios"
              value={formatNumber(state.data.summary.scenarios)}
              hint="matched by normalized identity"
              icon="traces"
            />
            <StatCard
              label="Regressed"
              value={formatNumber(state.data.summary.regressed)}
              hint="thresholds exceeded"
              tone={state.data.summary.regressed > 0 ? 'bad' : 'good'}
              icon="errors"
            />
            <StatCard
              label="Improved"
              value={formatNumber(state.data.summary.improved)}
              hint="not a significance claim"
              tone={state.data.summary.improved > 0 ? 'good' : 'default'}
              icon="check"
            />
            <StatCard
              label="Inconclusive"
              value={formatNumber(state.data.summary.inconclusive)}
              hint="insufficient or mismatched evidence"
              tone={state.data.summary.inconclusive > 0 ? 'warn' : 'default'}
              icon="shield"
            />
          </div>

          <div className="grid grid--2-1">
            <div className="stack">
              <Card
                title="Scenario results"
                subtitle="Only verified samples with matched scenario and trace evidence are compared"
                padded={false}
              >
                {state.data.scenarios.length === 0 ? (
                  <div className="card__inner">
                    <EmptyState
                      compact
                      icon="traces"
                      title="No matched scenarios"
                      description="This comparison has no scenario records. Check that both runs used the Playwright fixture and captured at least the minimum samples."
                    />
                  </div>
                ) : (
                  <div className="regression-scenarios">
                    {state.data.scenarios.map((scenario, index) => (
                      <ScenarioComparisonCard
                        key={`${scenario.scenarioId}:${index}`}
                        scenario={scenario}
                      />
                    ))}
                  </div>
                )}
              </Card>
              {validationNotes(state.data)}
            </div>

            <aside className="stack">
              <Card title="Comparison details">
                <dl className="key-values">
                  <div className="key-values__row">
                    <dt>Comparison</dt>
                    <dd className="mono">{state.data.id}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Status</dt>
                    <dd>{state.data.status}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Severity</dt>
                    <dd>{state.data.severity}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Baseline</dt>
                    <dd className="mono">{state.data.baselineId}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Candidate</dt>
                    <dd className="mono">{state.data.candidateId}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Created</dt>
                    <dd title={formatDateTime(state.data.createdAt)}>
                      {formatRelative(state.data.createdAt)}
                    </dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Min samples</dt>
                    <dd>{state.data.options.minSamples} per side</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Duration threshold</dt>
                    <dd>
                      {state.data.options.durationRegressionMs} ms or{' '}
                      {state.data.options.durationRegressionPct}%
                    </dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Count threshold</dt>
                    <dd>{state.data.options.countRegressionMin}</dd>
                  </div>
                </dl>
              </Card>

              <Card
                title="Environment"
                subtitle="Mismatches make the comparison inconclusive unless explicitly overridden"
              >
                <div className="badge-row">
                  <Badge tone={state.data.environment.compatible ? 'good' : 'warn'}>
                    {state.data.environment.compatible ? 'compatible' : 'different'}
                  </Badge>
                  {state.data.environment.ignored && <Badge tone="warn">ignored by override</Badge>}
                </div>
                {state.data.environment.differences.length === 0 ? (
                  <p className="muted">No environment differences were recorded.</p>
                ) : (
                  <dl className="key-values">
                    {state.data.environment.differences.map((difference) => (
                      <div className="key-values__row" key={difference.field}>
                        <dt>{difference.field}</dt>
                        <dd>
                          <span className="mono">{difference.baseline}</span>
                          {' → '}
                          <span className="mono">{difference.candidate}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </Card>

              <Card title="Method">
                <p className="muted">
                  Medians of per-sample measurements, minimum sample count per side, null durations
                  preserved as unmeasured and no significance test. Trace and span ids, timestamps
                  and ordering are ignored.
                </p>
                <pre className="code-block code-block--scroll">
                  {`stacknext diagnose\nstacknext runs show <run-id>\nstacknext compare ${state.data.baselineId} ${state.data.candidateId}`}
                </pre>
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
