import type { TestRun } from '@stacknext/regression'
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
import { formatDateTime, formatDuration, formatNumber, formatRelative } from '../format'
import {
  EnvironmentCard,
  RUN_STATUS_TONE,
  ScenarioEvidence,
  validationNotes,
} from './RegressionScenarios'

export function RunDetailPage({
  runId,
  refreshKey,
  onNavigate,
}: {
  runId: string
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const state = useAsync<TestRun>(
    (signal) => api.testRun(runId, signal),
    `run:${runId}`,
    refreshKey,
  )

  return (
    <>
      <div className="breadcrumb">
        <button type="button" className="link" onClick={() => onNavigate('/runs')}>
          <Icon name="chevron-left" size={14} /> Test runs
        </button>
        <span>/</span>
        <span className="mono">{runId}</span>
      </div>

      {state.loading && !state.data ? (
        <Loading rows={8} label="Loading test run" />
      ) : state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={state.reload} />
      ) : state.data ? (
        <>
          <PageHeader
            eyebrow="Captured test run"
            title={state.data.name}
            description={`${state.data.projectName} · ${formatDateTime(state.data.createdAt)} · ${state.data.scenarios.length} scenarios`}
            actions={
              <div className="button-row">
                <CopyButton value={state.data.id} label="Copy run id" />
                <button type="button" className="button button--ghost" onClick={state.reload}>
                  <Icon name="refresh" size={15} /> Refresh
                </button>
              </div>
            }
          />

          <div className="badge-row">
            <Badge tone={RUN_STATUS_TONE[state.data.status]}>{state.data.status}</Badge>
            <Badge tone={state.data.collector.connected ? 'good' : 'warn'}>
              collector {state.data.collector.connected ? 'connected' : 'not connected'}
            </Badge>
            <Badge tone={state.data.stats.incompleteSamples > 0 ? 'warn' : 'good'}>
              {state.data.stats.incompleteSamples > 0
                ? `${state.data.stats.incompleteSamples} incomplete sample${state.data.stats.incompleteSamples === 1 ? '' : 's'}`
                : 'all samples verified'}
            </Badge>
            <Badge tone="muted">format v{state.data.version}</Badge>
            <Badge tone="muted">local only</Badge>
          </div>

          <div className="stat-grid">
            <StatCard
              label="Scenarios"
              value={formatNumber(state.data.stats.scenarios)}
              hint="stable Playwright identity"
              icon="traces"
            />
            <StatCard
              label="Samples"
              value={formatNumber(state.data.stats.samples)}
              hint={`${formatNumber(state.data.stats.verifiedSamples)} verified`}
              tone={state.data.stats.incompleteSamples > 0 ? 'warn' : 'good'}
              icon="check"
            />
            <StatCard
              label="Traces"
              value={formatNumber(state.data.stats.traces)}
              hint={`${formatNumber(state.data.stats.spans)} spans`}
              icon="layers"
            />
            <StatCard
              label="Database"
              value={formatNumber(state.data.stats.databaseQueries)}
              hint={`${formatNumber(state.data.stats.errors)} captured errors`}
              icon="database"
            />
          </div>

          <div className="grid grid--2-1">
            <div className="stack">
              <ScenarioEvidence
                scenarios={state.data.scenarios}
                emptyDescription="Playwright did not report a scenario for this run. Check the fixture setup before using the run as a baseline."
              />
              {validationNotes(state.data)}
            </div>

            <aside className="stack">
              <Card title="Capture details">
                <dl className="key-values">
                  <div className="key-values__row">
                    <dt>Run</dt>
                    <dd className="mono">{state.data.id}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Created</dt>
                    <dd title={formatDateTime(state.data.createdAt)}>
                      {formatRelative(state.data.createdAt)}
                    </dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Completed</dt>
                    <dd>{formatDateTime(state.data.completedAt)}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Duration</dt>
                    <dd>{formatDuration(state.data.command.durationMs)}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Exit code</dt>
                    <dd>{state.data.command.exitCode ?? '—'}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Signal</dt>
                    <dd>{state.data.command.signal ?? '—'}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Collector</dt>
                    <dd className="mono">{state.data.collector.version}</dd>
                  </div>
                  <div className="key-values__row">
                    <dt>Engine</dt>
                    <dd className="mono">v{state.data.version}</dd>
                  </div>
                </dl>
                <pre className="code-block code-block--scroll">
                  {state.data.command.executable} {state.data.command.args.join(' ')}
                </pre>
              </Card>

              <EnvironmentCard environment={state.data.environment} />

              <Card title="Use this run">
                <p className="muted">
                  Save this run as a baseline from the project directory, then compare a later
                  candidate run against it.
                </p>
                <pre className="code-block code-block--scroll">
                  {`stacknext baseline save ${state.data.id} --name <name>\nstacknext compare <baseline-id> ${state.data.id}`}
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
