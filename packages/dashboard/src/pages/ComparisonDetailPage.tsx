import { Fragment, useState } from 'react'
import type {
  Comparison,
  RegressionMetric,
  ScenarioComparison,
} from '@stacknext/regression'
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
  PageHeader,
  PropertiesRail,
  PropertySection,
  SearchInput,
  Select,
  StatCard,
  StatGridSkeleton,
  StatStrip,
} from '../components/ui'
import {
  CollapsibleCard,
  isMissingRecordError,
  Notice,
  RefreshButton,
  RelativeTime,
} from '../components/details'
import { Icon } from '../components/Icon'
import {
  formatDuration,
  formatNumber,
  formatThreshold,
  plural,
  truncate,
} from '../format'
import { queryShapeId } from '../sql'
import {
  REGRESSION_SEVERITY_TONE,
  REGRESSION_STATUS_TONE,
  formatMetricDelta,
  validationNotes,
} from './RegressionScenarios'

interface MetricSummary {
  total: number
  measured: number
  unmeasured: number
  regressed: number
  improved: number
  unchanged: number
  inconclusive: number
}

function summariseMetrics(comparison: Comparison): MetricSummary {
  const summary: MetricSummary = {
    total: 0,
    measured: 0,
    unmeasured: 0,
    regressed: 0,
    improved: 0,
    unchanged: 0,
    inconclusive: 0,
  }
  for (const scenario of comparison.scenarios) {
    for (const metric of scenario.metrics) {
      summary.total += 1
      summary[metric.status] += 1
      if (metric.unmeasured) summary.unmeasured += 1
      else summary.measured += 1
    }
  }
  return summary
}

function queryMetricShape(
  metric: RegressionMetric,
): { shapeId: string; sql: string } | null {
  const prefix = 'query-duration:'
  if (!metric.key.startsWith(prefix)) return null
  const rest = metric.key.slice(prefix.length)
  const split = rest.indexOf(':')
  if (split < 0) return null
  const sql = rest.slice(split + 1)
  if (!sql) return null
  return { shapeId: queryShapeId(sql), sql }
}

const METRIC_KIND_LABEL: Record<RegressionMetric['kind'], string> = {
  duration: 'Duration',
  count: 'Count',
  'test-status': 'Test status',
  error: 'Errors',
  finding: 'Diagnostic finding',
}

function metricLabelParts(metric: RegressionMetric): {
  kind: string
  subject: string
  shape: { shapeId: string; sql: string } | null
} {
  const shape = queryMetricShape(metric)
  if (shape) return { kind: 'Query duration', subject: shape.sql, shape }
  const split = metric.label.indexOf(': ')
  if (split > 0) {
    return {
      kind: metric.label.slice(0, split),
      subject: metric.label.slice(split + 2),
      shape: null,
    }
  }
  return {
    kind: METRIC_KIND_LABEL[metric.kind],
    subject: metric.label,
    shape: null,
  }
}

function MetricValue({
  metric,
  value,
}: {
  metric: RegressionMetric
  value: number | null
}): React.ReactElement {
  if (value === null) {
    if (metric.kind === 'duration') {
      return (
        <span
          className="unmeasured"
          title="The adapter did not measure this value. Null is never treated as zero."
        >
          unmeasured
        </span>
      )
    }
    return (
      <span className="muted" title="No value was recorded for this metric.">
        —
      </span>
    )
  }
  return (
    <span className="tabular">
      {metric.kind === 'duration' ? formatDuration(value) : formatNumber(value)}
    </span>
  )
}

function MetricTable({
  metrics,
  onNavigate,
}: {
  metrics: RegressionMetric[]
  onNavigate: (path: string) => void
}): React.ReactElement {
  return (
    <div
      className="table-scroll"
      role="region"
      aria-label="Metric comparison"
      tabIndex={0}
    >
      <table className="table table--compact comparison-metric-table">
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">Status</th>
            <th className="numeric" scope="col">
              Baseline
            </th>
            <th className="numeric" scope="col">
              Candidate
            </th>
            <th className="numeric" scope="col">
              Delta
            </th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric, index) => {
            const parts = metricLabelParts(metric)
            return (
              <tr key={`${metric.key}:${index}`}>
                <td>
                  <div className="metric-label">
                    <span className="metric-label__kind">{parts.kind}</span>
                    <code className="metric-label__sql" title={parts.subject}>
                      {truncate(parts.subject, 240)}
                    </code>
                    {parts.shape && (
                      <button
                        type="button"
                        className="link metric-label__link"
                        onClick={() =>
                          onNavigate(`/database/${parts.shape?.shapeId}`)
                        }
                        title="Open this normalized query shape and its executions"
                      >
                        Open query shape <Icon name="arrow-right" size={11} />
                      </button>
                    )}
                    {metric.unmeasured ? (
                      <Badge tone="warn" title={metric.note}>
                        unmeasured inputs
                      </Badge>
                    ) : (
                      <span className="metric-note">
                        {metric.note ??
                          `${plural(metric.sampleCount, 'sample')} on each side`}
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <span className="metric-status-cell">
                    <Badge tone={REGRESSION_STATUS_TONE[metric.status]}>
                      {metric.status}
                    </Badge>
                    {metric.severity !== 'none' && (
                      <Badge tone={REGRESSION_SEVERITY_TONE[metric.severity]}>
                        {metric.severity}
                      </Badge>
                    )}
                  </span>
                </td>
                <td className="numeric">
                  <MetricValue metric={metric} value={metric.baselineValue} />
                </td>
                <td className="numeric">
                  <MetricValue metric={metric} value={metric.candidateValue} />
                </td>
                <td className="numeric">
                  {metric.unmeasured ? (
                    <span className="muted">not compared</span>
                  ) : (
                    formatMetricDelta(metric)
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ScenarioDetail({
  scenario,
  onNavigate,
}: {
  scenario: ScenarioComparison
  onNavigate: (path: string) => void
}): React.ReactElement {
  const changed = scenario.metrics.filter((metric) => metric.status !== 'unchanged')
  const unchanged = scenario.metrics.length - changed.length

  return (
    <div className="comparison-scenario-detail__body">
      <div className="regression-scenario__sides">
        <div>
          <span className="muted">Baseline</span>
          <strong>
            {scenario.baseline.verifiedSamples} verified / {scenario.baseline.samples}{' '}
            samples
          </strong>
          <span className="muted">
            {plural(scenario.baseline.traces, 'trace')} ·{' '}
            {plural(scenario.baseline.findings, 'finding')}
          </span>
        </div>
        <div>
          <span className="muted">Candidate</span>
          <strong>
            {scenario.candidate.verifiedSamples} verified / {scenario.candidate.samples}{' '}
            samples
          </strong>
          <span className="muted">
            {plural(scenario.candidate.traces, 'trace')} ·{' '}
            {plural(scenario.candidate.findings, 'finding')}
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

      <div className="regression-metrics">
        <h4>Metrics</h4>
        {scenario.metrics.length === 0 ? (
          <p className="muted">
            No metrics are computed while this scenario is inconclusive. Time-window
            guesses and fabricated zeros are never used to fill the gap.
          </p>
        ) : changed.length > 0 ? (
          <>
            <MetricTable metrics={changed} onNavigate={onNavigate} />
            {unchanged > 0 && (
              <details className="regression-metrics__all">
                <summary>
                  {plural(unchanged, 'unchanged metric')}
                </summary>
                <MetricTable
                  metrics={scenario.metrics.filter(
                    (metric) => metric.status === 'unchanged',
                  )}
                  onNavigate={onNavigate}
                />
              </details>
            )}
          </>
        ) : (
          <details className="regression-metrics__all">
            <summary>
              {plural(unchanged, 'metric')} measured as unchanged
            </summary>
            <MetricTable metrics={scenario.metrics} onNavigate={onNavigate} />
          </details>
        )}
      </div>
    </div>
  )
}

type ScenarioSort = 'status' | 'title' | 'metrics' | 'file'

const STATUS_ORDER: Record<ScenarioComparison['status'], number> = {
  regressed: 0,
  inconclusive: 1,
  improved: 2,
  unchanged: 3,
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
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState<ScenarioSort>('status')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const back = {
    label: 'Comparisons',
    onClick: () => onNavigate('/comparisons'),
    trail: comparisonId,
  }

  if (state.loading && !state.data) {
    return (
      <>
        <PageHeader detail title="Comparison" back={back} />
        <StatGridSkeleton count={5} five />
        <Loading rows={8} label="Loading comparison" />
      </>
    )
  }

  if (state.error && !state.data) {
    const missing = isMissingRecordError(state.error)
    return (
      <>
        <PageHeader detail title="Comparison" back={back} />
        {missing ? (
          <Notice
            tone="muted"
            icon="layers"
            title="This comparison is not in the local store"
            action={
              <div className="button-row">
                <button
                  type="button"
                  className="button button--secondary button--small"
                  onClick={() => onNavigate('/comparisons')}
                >
                  Back to comparisons
                </button>
                <RefreshButton onClick={state.reload} loading={state.loading} />
              </div>
            }
          >
            The comparison record may have been removed or the dashboard is
            pointed at a different project directory. Nothing is reconstructed or
            guessed.
          </Notice>
        ) : (
          <ErrorState message={state.error} onRetry={state.reload} />
        )}
      </>
    )
  }

  if (!state.data) return <Loading />

  const comparison = state.data
  const metrics = summariseMetrics(comparison)
  const scenarioCount = comparison.scenarios.length
  const query = search.trim().toLowerCase()

  const visibleScenarios = comparison.scenarios
    .filter((scenario) => {
      if (status !== 'all' && scenario.status !== status) return false
      if (!query) return true
      return [
        scenario.title,
        scenario.file,
        scenario.project,
        scenario.scenarioId,
      ].some((value) => value.toLowerCase().includes(query))
    })
    .sort((left, right) => {
      if (sort === 'title') return left.title.localeCompare(right.title)
      if (sort === 'file') {
        return (
          left.file.localeCompare(right.file) || left.title.localeCompare(right.title)
        )
      }
      if (sort === 'metrics') {
        const leftChanged = left.metrics.filter(
          (metric) => metric.status !== 'unchanged',
        ).length
        const rightChanged = right.metrics.filter(
          (metric) => metric.status !== 'unchanged',
        ).length
        return rightChanged - leftChanged || left.title.localeCompare(right.title)
      }
      return (
        STATUS_ORDER[left.status] - STATUS_ORDER[right.status] ||
        left.title.localeCompare(right.title)
      )
    })

  const toggleScenario = (scenarioId: string): void => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(scenarioId)) next.delete(scenarioId)
      else next.add(scenarioId)
      return next
    })
  }

  return (
    <>
      <PageHeader
        detail
        back={back}
        eyebrow="Regression · Deterministic comparison"
        title="Comparison"
        detailAside={
          <>
            <Badge tone={REGRESSION_STATUS_TONE[comparison.status]}>
              {comparison.status}
            </Badge>
            <Badge tone={REGRESSION_SEVERITY_TONE[comparison.severity]}>
              {comparison.severity} severity
            </Badge>
          </>
        }
        description={
          <>
            <span>{comparison.projectName}</span>
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <RelativeTime timestamp={comparison.createdAt} />
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <span className="mono" title={comparison.baselineId}>
              {comparison.baselineId}
            </span>
            <span aria-hidden="true"> → </span>
            <span className="mono" title={comparison.candidateId}>
              {comparison.candidateId}
            </span>
          </>
        }
        actions={
          <>
            <CopyButton value={comparison.id} label="Copy comparison id" primary />
            <button
              type="button"
              className="button button--secondary"
              onClick={() => onNavigate(`/baselines/${comparison.baselineId}`)}
            >
              <Icon name="layers" size={15} />
              Baseline
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => onNavigate(`/runs/${comparison.candidateId}`)}
            >
              <Icon name="terminal" size={15} />
              Candidate run
            </button>
            <RefreshButton onClick={state.reload} loading={state.loading} />
          </>
        }
      />

      <div className="badge-row">
        <Badge tone={comparison.environment.compatible ? 'good' : 'warn'}>
          environment {comparison.environment.compatible ? 'compatible' : 'different'}
        </Badge>
        {comparison.environment.ignored && (
          <Badge tone="warn">environment mismatch explicitly ignored</Badge>
        )}
        <Badge tone="muted">format v{comparison.version}</Badge>
        <Badge tone="muted">report only · no significance test</Badge>
      </div>

      {!comparison.environment.compatible && !comparison.environment.ignored && (
        <Notice tone="warn" icon="shield" title="The environments differ">
          Scenarios are kept inconclusive because Node.js, Next.js, platform or
          instrumentation settings do not match. Use the explicit ignore option
          only when the difference is known to be irrelevant.
        </Notice>
      )}

      {comparison.summary.inconclusive > 0 && (
        <Notice tone="warn" icon="info" title="Some scenarios are inconclusive">
          {plural(comparison.summary.inconclusive, 'scenario')} did not have enough
          matched, verified evidence for a metric verdict. Inconclusive is not a
          pass, and the comparison never falls back to a time window or a
          fabricated zero.
        </Notice>
      )}

      <StatStrip five>
        <StatCard
          label="Scenarios"
          value={formatNumber(comparison.summary.scenarios)}
          hint={`${formatNumber(comparison.summary.unchanged)} unchanged · ${formatNumber(comparison.summary.inconclusive)} inconclusive`}
        />
        <StatCard
          label="Metrics"
          value={formatNumber(metrics.total)}
          hint={`${formatNumber(metrics.measured)} measured · ${formatNumber(metrics.unmeasured)} unmeasured`}
          tone={metrics.unmeasured > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="Regressed metrics"
          value={formatNumber(metrics.regressed)}
          hint={`${plural(comparison.summary.regressed, 'scenario')} regressed`}
          tone={metrics.regressed > 0 ? 'bad' : 'good'}
        />
        <StatCard
          label="Improved metrics"
          value={formatNumber(metrics.improved)}
          hint={`${plural(comparison.summary.improved, 'scenario')} improved`}
          tone={metrics.improved > 0 ? 'good' : 'default'}
        />
        <StatCard
          label="Inconclusive metrics"
          value={formatNumber(metrics.inconclusive)}
          hint={
            metrics.unmeasured > 0
              ? `${formatNumber(metrics.unmeasured)} with unmeasured inputs`
              : `${plural(comparison.summary.inconclusive, 'scenario')} inconclusive`
          }
          tone={metrics.inconclusive > 0 ? 'warn' : 'default'}
        />
      </StatStrip>

      <div className="layout">
        <div className="layout__main">
          <Card
            title="Metric summary"
            subtitle="Counts across every metric in every matched scenario. Metric status is separate from the scenario verdict."
          >
            <div className="comparison-summary-grid">
              <div className="comparison-summary-grid__item">
                <span className="comparison-summary-grid__label">Total metrics</span>
                <span className="comparison-summary-grid__value">
                  {formatNumber(metrics.total)}
                </span>
              </div>
              <div className="comparison-summary-grid__item">
                <span className="comparison-summary-grid__label">
                  Unmeasured inputs
                </span>
                <span className="comparison-summary-grid__value">
                  {formatNumber(metrics.unmeasured)}
                </span>
              </div>
              <div className="comparison-summary-grid__item">
                <span className="comparison-summary-grid__label">Regressed</span>
                <span className="comparison-summary-grid__value">
                  {formatNumber(metrics.regressed)}
                </span>
              </div>
              <div className="comparison-summary-grid__item">
                <span className="comparison-summary-grid__label">Improved</span>
                <span className="comparison-summary-grid__value">
                  {formatNumber(metrics.improved)}
                </span>
              </div>
              <div className="comparison-summary-grid__item">
                <span className="comparison-summary-grid__label">Unchanged</span>
                <span className="comparison-summary-grid__value">
                  {formatNumber(metrics.unchanged)}
                </span>
              </div>
              <div className="comparison-summary-grid__item">
                <span className="comparison-summary-grid__label">Inconclusive</span>
                <span className="comparison-summary-grid__value">
                  {formatNumber(metrics.inconclusive)}
                </span>
              </div>
            </div>
            <p className="muted comparison-summary-note">
              Scenario verdicts: {formatNumber(comparison.summary.regressed)} regressed
              {' · '}
              {formatNumber(comparison.summary.improved)} improved
              {' · '}
              {formatNumber(comparison.summary.unchanged)} unchanged
              {' · '}
              {formatNumber(comparison.summary.inconclusive)} inconclusive.
              {metrics.unmeasured > 0
                ? ' Metrics with null durations stay inconclusive even when the scenario verdict is unchanged.'
                : ''}
            </p>
          </Card>

          <Card
            title="Scenarios"
            subtitle="Search, filter and sort matched scenarios. Open a row for reasons and metric evidence."
            meta={
              <span className="tabular">
                {formatNumber(visibleScenarios.length)} of{' '}
                {formatNumber(scenarioCount)}
              </span>
            }
            padded={false}
          >
            {scenarioCount === 0 ? (
              <div className="card__inner">
                <EmptyState
                  compact
                  icon="traces"
                  title="No matched scenarios"
                  description="This comparison has no scenario records. Check that both runs used the Playwright fixture and captured at least the minimum samples."
                />
              </div>
            ) : (
              <>
                <div className="comparison-toolbar">
                  <div className="list-toolbar__search">
                    <SearchInput
                      value={search}
                      onChange={setSearch}
                      placeholder="Search scenarios…"
                      label="Search scenarios"
                    />
                  </div>
                  <div className="list-toolbar__controls">
                    <Select
                      label="Scenario status"
                      value={status}
                      onChange={setStatus}
                      options={[
                        { value: 'all', label: 'All statuses' },
                        { value: 'regressed', label: 'Regressed' },
                        { value: 'improved', label: 'Improved' },
                        { value: 'unchanged', label: 'Unchanged' },
                        { value: 'inconclusive', label: 'Inconclusive' },
                      ]}
                    />
                    <Select
                      label="Sort scenarios"
                      value={sort}
                      onChange={(value) => setSort(value as ScenarioSort)}
                      options={[
                        { value: 'status', label: 'Status first' },
                        { value: 'title', label: 'Title' },
                        { value: 'metrics', label: 'Most changed metrics' },
                        { value: 'file', label: 'File' },
                      ]}
                    />
                  </div>
                </div>

                {visibleScenarios.length === 0 ? (
                  <div className="list-state">
                    <EmptyState
                      compact
                      icon="search"
                      title="No scenarios match these filters"
                      description="Clear the search or choose a different status."
                      action={
                        <button
                          type="button"
                          className="button button--secondary button--small"
                          onClick={() => {
                            setSearch('')
                            setStatus('all')
                          }}
                        >
                          Clear filters
                        </button>
                      }
                    />
                  </div>
                ) : (
                  <div
                    className="table-scroll"
                    role="region"
                    aria-label="Scenario comparisons"
                    tabIndex={0}
                  >
                    <table className="table table--compact comparison-scenario-table">
                      <thead>
                        <tr>
                          <th scope="col">Scenario</th>
                          <th scope="col">Verdict</th>
                          <th scope="col">Metrics</th>
                          <th scope="col">Evidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleScenarios.map((scenario) => {
                          const open = expanded.has(scenario.scenarioId)
                          const changed = scenario.metrics.filter(
                            (metric) => metric.status !== 'unchanged',
                          ).length
                          return (
                            <Fragment key={scenario.scenarioId}>
                              <tr className={open ? 'is-expanded' : undefined}>
                                <td>
                                  <button
                                    type="button"
                                    className="scenario-toggle"
                                    aria-expanded={open}
                                    onClick={() =>
                                      toggleScenario(scenario.scenarioId)
                                    }
                                  >
                                    <Icon
                                      name={open ? 'chevron-down' : 'chevron-right'}
                                      size={13}
                                    />
                                    <span>{scenario.title}</span>
                                  </button>
                                  <span className="sub-cell">
                                    {scenario.file} · {scenario.project} ·{' '}
                                    <span className="mono">{scenario.scenarioId}</span>
                                  </span>
                                </td>
                                <td>
                                  <Badge
                                    tone={REGRESSION_STATUS_TONE[scenario.status]}
                                  >
                                    {scenario.status}
                                  </Badge>
                                  <span
                                    className={`comparison-verdict__severity ${
                                      scenario.severity === 'none'
                                        ? 'muted'
                                        : `severity--${scenario.severity}`
                                    }`}
                                  >
                                    {scenario.severity === 'none'
                                      ? 'no severity'
                                      : `${scenario.severity} severity`}
                                  </span>
                                </td>
                                <td>
                                  <span className="tabular">
                                    {formatNumber(changed)} changed /{' '}
                                    {formatNumber(scenario.metrics.length)}
                                  </span>
                                  {scenario.metrics.length === 0 && (
                                    <span className="sub-cell">
                                      no metrics computed
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <span className="comparison-evidence-line">
                                    B {scenario.baseline.verifiedSamples}/
                                    {scenario.baseline.samples} ·{' '}
                                    {plural(scenario.baseline.traces, 'trace')} ·{' '}
                                    {plural(scenario.baseline.findings, 'finding')}
                                  </span>
                                  <span className="comparison-evidence-line">
                                    C {scenario.candidate.verifiedSamples}/
                                    {scenario.candidate.samples} ·{' '}
                                    {plural(scenario.candidate.traces, 'trace')} ·{' '}
                                    {plural(scenario.candidate.findings, 'finding')}
                                  </span>
                                </td>
                              </tr>
                              {open && (
                                <tr className="comparison-scenario-detail">
                                  <td colSpan={4}>
                                    <ScenarioDetail
                                      scenario={scenario}
                                      onNavigate={onNavigate}
                                    />
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </Card>

          {validationNotes(comparison)}
        </div>

        <PropertiesRail>
          <PropertySection
            title="Comparison details"
            entries={[
              {
                label: 'Comparison',
                value: <span className="mono">{comparison.id}</span>,
              },
              { label: 'Status', value: comparison.status },
              { label: 'Severity', value: comparison.severity },
              {
                label: 'Baseline',
                value: <span className="mono">{comparison.baselineId}</span>,
              },
              {
                label: 'Candidate',
                value: <span className="mono">{comparison.candidateId}</span>,
              },
              {
                label: 'Created',
                value: <RelativeTime timestamp={comparison.createdAt} />,
              },
              { label: 'Format', value: <span className="mono">v{comparison.version}</span> },
            ]}
          />

          <Card
            title="Thresholds"
            subtitle="Both the absolute and percentage conditions must hold for duration status."
          >
            <div className="threshold-grid">
              <div className="threshold-grid__item">
                <span className="threshold-grid__label">Minimum samples</span>
                <span className="threshold-grid__value">
                  {comparison.options.minSamples} per side
                </span>
              </div>
              <div className="threshold-grid__item">
                <span className="threshold-grid__label">Duration regression</span>
                <span className="threshold-grid__value">
                  {formatThreshold(
                    comparison.options.durationRegressionMs,
                    comparison.options.durationRegressionPct,
                  )}
                </span>
              </div>
              <div className="threshold-grid__item">
                <span className="threshold-grid__label">Duration improvement</span>
                <span className="threshold-grid__value">
                  {formatThreshold(
                    comparison.options.durationImprovementMs,
                    comparison.options.durationImprovementPct,
                  )}
                </span>
              </div>
              <div className="threshold-grid__item">
                <span className="threshold-grid__label">Count change</span>
                <span className="threshold-grid__value">
                  {formatNumber(comparison.options.countRegressionMin)} events
                </span>
              </div>
              <div className="threshold-grid__item">
                <span className="threshold-grid__label">Environment</span>
                <span className="threshold-grid__value">
                  {comparison.environment.ignored
                    ? 'mismatch ignored'
                    : 'must match'}
                </span>
              </div>
            </div>
          </Card>

          <CollapsibleCard
            title="Environment"
            description="Differences are recorded when the two sides do not match"
            defaultOpen={!comparison.environment.compatible}
            storageKey={`comparison:${comparison.id}:environment`}
          >
            <div className="badge-row">
              <Badge
                tone={comparison.environment.compatible ? 'good' : 'warn'}
              >
                {comparison.environment.compatible ? 'compatible' : 'different'}
              </Badge>
              {comparison.environment.ignored && (
                <Badge tone="warn">ignored by override</Badge>
              )}
            </div>
            {comparison.environment.differences.length === 0 ? (
              <p className="muted">No environment differences were recorded.</p>
            ) : (
              <KeyValue
                entries={comparison.environment.differences.map((difference) => ({
                  label: difference.field,
                  value: (
                    <>
                      <span className="mono">{difference.baseline}</span>
                      {' → '}
                      <span className="mono">{difference.candidate}</span>
                    </>
                  ),
                }))}
              />
            )}
          </CollapsibleCard>

          <PropertySection
            title="Method"
            description="Medians of per-sample measurements, a minimum sample count per side, null durations preserved as unmeasured and no significance test. Trace and span ids, timestamps and ordering are ignored."
            code={`stacknext diagnose\nstacknext runs show <run-id>\nstacknext compare ${comparison.baselineId} ${comparison.candidateId}`}
          />
        </PropertiesRail>
      </div>
    </>
  )
}
