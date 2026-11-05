import type { Baseline } from '@stacknext/regression'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  CopyButton,
  ErrorState,
  Loading,
  PageHeader,
  PropertiesRail,
  PropertySection,
  StatCard,
  StatStrip,
} from '../components/ui'
import { Icon } from '../components/Icon'
import { formatDateTime, formatNumber, formatRelative, plural } from '../format'
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

  if (state.loading && !state.data) {
    return (
      <>
        <PageHeader
          detail
          title="Saved baseline"
          back={{ label: 'Baselines', onClick: () => onNavigate('/baselines'), trail: baselineId }}
        />
        <Loading rows={8} label="Loading baseline" />
      </>
    )
  }

  if (state.error && !state.data) {
    return (
      <>
        <PageHeader
          detail
          title="Saved baseline"
          back={{ label: 'Baselines', onClick: () => onNavigate('/baselines'), trail: baselineId }}
        />
        <ErrorState message={state.error} onRetry={state.reload} />
      </>
    )
  }

  if (!state.data) return <Loading />

  return (
    <>
      <PageHeader
        detail
        back={{ label: 'Baselines', onClick: () => onNavigate('/baselines'), trail: baselineId }}
        eyebrow="Regression · 2 of 3 · Saved baseline"
        title={state.data.name}
        description={`${state.data.projectName} · ${formatDateTime(state.data.createdAt)} · ${plural(state.data.scenarios.length, 'scenario')}`}
        actions={
          <>
            <CopyButton value={state.data.id} label="Copy baseline id" />
            <button
              type="button"
              className="button button--secondary"
              onClick={() => onNavigate(`/runs/${state.data?.sourceRunId}`)}
            >
              Source run <Icon name="arrow-right" size={14} />
            </button>
            <button type="button" className="button button--secondary" onClick={state.reload}>
              <Icon name="refresh" size={15} /> Refresh
            </button>
          </>
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

      <StatStrip>
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
          hint={plural(state.data.stats.spans, 'span')}
          icon="layers"
        />
        <StatCard
          label="Queries"
          value={formatNumber(state.data.stats.databaseQueries)}
          hint={plural(state.data.stats.requests, 'request')}
          icon="database"
        />
      </StatStrip>

      <div className="layout">
        <div className="layout__main">
          <ScenarioEvidence
            scenarios={state.data.scenarios}
            onNavigate={onNavigate}
            storagePrefix={`baseline:${state.data.id}`}
            emptyDescription="This baseline has no scenarios and cannot produce a meaningful comparison."
          />
          {validationNotes(state.data)}
        </div>

        <PropertiesRail>
          <EnvironmentCard environment={state.data.environment} />

          <PropertySection
            title="Baseline details"
            entries={[
              { label: 'Baseline', value: <span className="mono">{state.data.id}</span> },
              { label: 'Source run', value: <span className="mono">{state.data.sourceRunId}</span> },
              {
                label: 'Created',
                value: (
                  <span title={formatDateTime(state.data.createdAt)}>
                    {formatRelative(state.data.createdAt)}
                  </span>
                ),
              },
              { label: 'Format', value: <span className="mono">v{state.data.version}</span> },
              { label: 'Samples', value: formatNumber(state.data.stats.samples) },
              { label: 'Errors', value: formatNumber(state.data.stats.errors) },
            ]}
          >
            {state.data.notes.length > 0 && (
              <ul className="notes-list">
                {state.data.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </PropertySection>

          <PropertySection
            title="Compare against this baseline"
            description="Both sides need the same scenario identity and environment unless you explicitly ignore the mismatch."
            code={`stacknext compare ${state.data.id} <candidate-run-id>`}
          />
        </PropertiesRail>
      </div>
    </>
  )
}
