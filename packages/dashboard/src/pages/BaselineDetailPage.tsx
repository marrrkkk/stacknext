import type { Baseline } from '@stacknext/regression'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  Card,
  CopyButton,
  ErrorState,
  Loading,
  PageHeader,
  StatCard,
} from '../components/ui'
import { Icon } from '../components/Icon'
import { formatDateTime, formatNumber, formatRelative } from '../format'
import {
  EnvironmentCard,
  ScenarioEvidence,
  validationNotes,
} from './RegressionScenarios'

export function BaselineDetailPage({
  baselineId,
  refreshKey,
  onNavigate,
}: {
  baselineId: string
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const state = useAsync<Baseline>(
    (signal) => api.baseline(baselineId, signal),
    `baseline:${baselineId}`,
    refreshKey,
  )

  return (
    <>
      <div className="breadcrumb">
        <button type="button" className="link" onClick={() => onNavigate('/baselines')}>
          <Icon name="chevron-left" size={14} /> Baselines
        </button>
        <span>/</span>
        <span className="mono">{baselineId}</span>
      </div>

      {state.loading && !state.data ? (
        <Loading rows={8} label="Loading baseline" />
      ) : state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={state.reload} />
      ) : state.data ? (
        <>
          <PageHeader
            eyebrow="Saved baseline"
            title={state.data.name}
            description={`${state.data.projectName} · ${formatDateTime(state.data.createdAt)} · ${state.data.scenarios.length} scenarios`}
            actions={
              <div className="button-row">
                <CopyButton value={state.data.id} label="Copy baseline id" />
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => onNavigate(`/runs/${state.data?.sourceRunId}`)}
                >
                  Source run <Icon name="arrow-right" size={14} />
                </button>
                <button type="button" className="button button--ghost" onClick={state.reload}>
                  <Icon name="refresh" size={15} /> Refresh
                </button>
              </div>
            }
          />

          <div className="badge-row">
            <Badge tone="good">baseline</Badge>
            <Badge tone="muted">format v{state.data.version}</Badge>
            <Badge tone="muted">{state.data.sourceRunId}</Badge>
            <Badge tone={state.data.stats.incompleteSamples > 0 ? 'warn' : 'good'}>
              {state.data.stats.incompleteSamples > 0
                ? `${state.data.stats.incompleteSamples} incomplete sample${state.data.stats.incompleteSamples === 1 ? '' : 's'}`
                : 'all samples verified'}
            </Badge>
          </div>

          <div className="stat-grid">
            <StatCard
              label="Scenarios"
              value={formatNumber(state.data.stats.scenarios)}
              hint="stable identity"
              icon="traces"
            />
            <StatCard
              label="Verified samples"
              value={formatNumber(state.data.stats.verifiedSamples)}
              hint={`${formatNumber(state.data.stats.samples)} total`}
              tone="good"
              icon="check"
            />
            <StatCard
              label="Traces"
              value={formatNumber(state.data.stats.traces)}
              hint={`${formatNumber(state.data.stats.spans)} spans`}
              icon="layers"
            />
            <StatCard
              label="Queries"
              value={formatNumber(state.data.stats.databaseQueries)}
              hint={`${formatNumber(state.data.stats.requests)} requests`}
              icon="database"
            />
          </div>

          <div className="grid grid--2-1">
            <div className="stack">
              <ScenarioEvidence
                scenarios={state.data.scenarios}
                emptyDescription="This baseline has no scenarios and cannot produce a meaningful comparison."
              />
              {validationNotes(state.data)}
            </div>

            <aside className="stack">
              <Card title="Baseline details">
                <dl className="key-values">
                  <div className="key-values__row">
                    <dt>Baseline</dt>
                    <dd className="mono">{state.data.id}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Source run</dt>
                    <dd className="mono">{state.data.sourceRunId}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Created</dt>
                    <dd title={formatDateTime(state.data.createdAt)}>
                      {formatRelative(state.data.createdAt)}
                    </dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Format</dt>
                    <dd className="mono">v{state.data.version}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Samples</dt>
                    <dd>{formatNumber(state.data.stats.samples)}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Errors</dt>
                    <dd>{formatNumber(state.data.stats.errors)}</dd>
                  </div>
                </dl>
                {state.data.notes.length > 0 && (
                  <ul className="notes-list">
                    {state.data.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                )}
              </Card>

              <EnvironmentCard environment={state.data.environment} />

              <Card title="Compare against this baseline">
                <p className="muted">
                  Both sides need the same scenario identity and environment unless you explicitly
                  ignore the mismatch.
                </p>
                <pre className="code-block code-block--scroll">
                  {`stacknext compare ${state.data.id} <candidate-run-id>`}
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
