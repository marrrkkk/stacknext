import type { TestRun } from '@stacknext/regression'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  Card,
  CopyButton,
  ErrorState,
  KeyValue,
  Loading,
  PageHeader,
  PropertiesRail,
  PropertySection,
  StatCard,
  StatGridSkeleton,
  StatStrip,
} from '../components/ui'
import {
  DurationValue,
  isMissingRecordError,
  Notice,
  RefreshButton,
  RelativeTime,
} from '../components/details'
import { formatDateTime, formatNumber, plural } from '../format'
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
    3_000,
    (data) => data?.status === 'running',
  )

  const back = {
    label: 'Test runs',
    onClick: () => onNavigate('/runs'),
    trail: runId,
  }

  if (state.loading && !state.data) {
    return (
      <>
        <PageHeader detail title="Captured test run" back={back} />
        <StatGridSkeleton count={5} five />
        <Loading rows={8} label="Loading test run" />
      </>
    )
  }

  if (state.error && !state.data) {
    const missing = isMissingRecordError(state.error)
    return (
      <>
        <PageHeader detail title="Captured test run" back={back} />
        {missing ? (
          <Notice
            tone="muted"
            icon="traces"
            title="This run is not in the local store"
            action={
              <div className="button-row">
                <button
                  type="button"
                  className="button button--secondary button--small"
                  onClick={() => onNavigate('/runs')}
                >
                  Back to test runs
                </button>
                <RefreshButton onClick={state.reload} loading={state.loading} />
              </div>
            }
          >
            The run record may have been removed or the dashboard is pointed at a
            different project directory. Nothing is reconstructed or guessed.
          </Notice>
        ) : (
          <ErrorState message={state.error} onRetry={state.reload} />
        )}
      </>
    )
  }

  if (!state.data) return <Loading />

  const run = state.data
  const incomplete = run.stats.incompleteSamples
  const scenarioCount = plural(run.stats.scenarios, 'scenario')
  const created = formatDateTime(run.createdAt)

  return (
    <>
      <PageHeader
        detail
        back={back}
        eyebrow="Regression · Capture run"
        title={run.name}
        detailAside={
          <Badge tone={RUN_STATUS_TONE[run.status]}>{run.status}</Badge>
        }
        description={
          <>
            <span>{run.projectName}</span>
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <span title={created}>
              <RelativeTime timestamp={run.createdAt} />
            </span>
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <span>{scenarioCount}</span>
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <span className="mono" title={run.id}>
              {run.id}
            </span>
          </>
        }
        actions={
          <>
            <CopyButton value={run.id} label="Copy run id" primary />
            <RefreshButton onClick={state.reload} loading={state.loading} />
          </>
        }
      />

      <div className="badge-row">
        <Badge tone={run.collector.connected ? 'good' : 'warn'}>
          collector {run.collector.connected ? 'connected' : 'not connected'}
        </Badge>
        <Badge tone={incomplete > 0 ? 'warn' : 'good'}>
          {incomplete > 0
            ? plural(incomplete, 'incomplete sample')
            : 'all samples verified'}
        </Badge>
        <Badge tone={run.command.exitCode === 0 ? 'good' : 'muted'}>
          exit {run.command.exitCode ?? 'not recorded'}
        </Badge>
        <Badge tone="muted">format v{run.version}</Badge>
        <Badge tone="muted">local only</Badge>
      </div>

      {incomplete > 0 && (
        <Notice tone="warn" icon="shield" title="Some samples are not verified">
          {plural(incomplete, 'sample')} could not be linked to an injected trace
          id and a parented server span. Those samples stay visible as incomplete
          and are excluded from comparison evidence instead of being filled with a
          guessed sample.
        </Notice>
      )}

      {run.status === 'failed' && (
        <Notice tone="bad" icon="errors" title="The Playwright command failed">
          The run is stored with its captured evidence. Check the command exit
          code and sample statuses before using it as a baseline.
        </Notice>
      )}

      <StatStrip five>
        <StatCard
          label="Scenarios"
          value={formatNumber(run.stats.scenarios)}
          hint="stable Playwright identity"
        />
        <StatCard
          label="Samples"
          value={formatNumber(run.stats.samples)}
          hint={`${formatNumber(run.stats.verifiedSamples)} verified · ${formatNumber(incomplete)} incomplete`}
          tone={incomplete > 0 ? 'warn' : 'good'}
        />
        <StatCard
          label="Traces"
          value={formatNumber(run.stats.traces)}
          hint={`${plural(run.stats.spans, 'span')} · ${plural(run.stats.requests, 'request')}`}
        />
        <StatCard
          label="Database"
          value={formatNumber(run.stats.databaseQueries)}
          hint="Captured query records"
        />
        <StatCard
          label="Errors"
          value={formatNumber(run.stats.errors)}
          hint={run.stats.errors === 0 ? 'none captured' : 'correlated errors'}
          tone={run.stats.errors > 0 ? 'bad' : 'default'}
        />
      </StatStrip>

      <div className="layout">
        <div className="layout__main">
          <ScenarioEvidence
            scenarios={run.scenarios}
            onNavigate={onNavigate}
            storagePrefix={`run:${run.id}`}
            emptyDescription="Playwright did not report a scenario for this run. Check the fixture setup before using the run as a baseline."
          />
          {validationNotes(run)}
        </div>

        <PropertiesRail>
          <Card title="Run details" subtitle="Stored capture metadata and command result">
            <KeyValue
              entries={[
                { label: 'Run', value: <span className="mono">{run.id}</span> },
                {
                  label: 'Created',
                  value: <RelativeTime timestamp={run.createdAt} />,
                },
                {
                  label: 'Completed',
                  value: (
                    <RelativeTime timestamp={run.completedAt} fallback="not completed" />
                  ),
                },
                { label: 'Command duration', value: <DurationValue ms={run.command.durationMs} /> },
                {
                  label: 'Exit code',
                  value:
                    run.command.exitCode === null
                      ? 'not recorded'
                      : String(run.command.exitCode),
                },
                {
                  label: 'Signal',
                  value: run.command.signal ?? 'not recorded',
                },
                { label: 'Collector', value: <span className="mono">{run.collector.version}</span> },
                { label: 'Format', value: <span className="mono">v{run.version}</span> },
              ]}
            />
            <pre className="code-block code-block--scroll">
              {`${run.command.executable} ${run.command.args.join(' ')}`}
            </pre>
          </Card>

          <EnvironmentCard environment={run.environment} />

          <PropertySection
            title="Use this run"
            description="Save this run as a baseline from the project directory, then compare a later candidate run against it."
            code={`stacknext baseline save ${run.id} --name <name>\nstacknext compare <baseline-id> ${run.id}`}
          />
        </PropertiesRail>
      </div>
    </>
  )
}
