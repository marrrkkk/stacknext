import { useState } from 'react'
import type { PageResult } from '@stacknext/core'
import type { RunSummary } from '@stacknext/regression'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  Pagination,
  StatCard,
} from '../components/ui'
import { Icon } from '../components/Icon'
import { formatDateTime, formatDuration, formatRelative } from '../format'
import { RUN_STATUS_TONE } from './RegressionScenarios'

const LIMIT = 25

function environmentLine(run: RunSummary): string {
  const next = run.environment.nextVersion ? ` · Next.js ${run.environment.nextVersion}` : ''
  return `Node ${run.environment.nodeVersion}${next} · ${run.environment.platform}/${run.environment.arch}`
}

export function RunsPage({
  refreshKey,
  onNavigate,
}: {
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const [offset, setOffset] = useState(0)
  const state = useAsync<PageResult<RunSummary>>(
    (signal) => api.testRuns({ limit: LIMIT, offset }, signal),
    `runs:${offset}`,
    refreshKey,
  )

  const verified = state.data?.items.reduce((sum, run) => sum + run.verifiedSamples, 0) ?? 0
  const incomplete = state.data?.items.reduce((sum, run) => sum + run.incompleteSamples, 0) ?? 0
  const scenarios = state.data?.items.reduce((sum, run) => sum + run.scenarios, 0) ?? 0
  const latest = state.data?.items[0]

  return (
    <>
      <PageHeader
        eyebrow="Runtime regression testing"
        title="Test runs"
        description="Local Playwright-linked captures stored under .stacknext/runs. Each run keeps its scenario identity, verified trace correlation, bounded evidence and environment snapshot."
        actions={
          <button type="button" className="button button--ghost" onClick={state.reload}>
            <Icon name="refresh" size={15} /> Refresh
          </button>
        }
      />

      {state.data && (
        <div className="stat-grid">
          <StatCard
            label="Saved runs"
            value={state.data.total}
            hint="never uploaded"
            icon="terminal"
          />
          <StatCard
            label="Scenarios"
            value={scenarios}
            hint={`${state.data.items.length} runs in this page`}
            icon="traces"
          />
          <StatCard
            label="Verified samples"
            value={verified}
            hint="trace correlation confirmed"
            tone="good"
            icon="check"
          />
          <StatCard
            label="Incomplete"
            value={incomplete}
            hint="reported, never fabricated"
            tone={incomplete > 0 ? 'warn' : 'default'}
            icon="pulse"
          />
        </div>
      )}

      <Card padded={false}>
        {state.loading && !state.data ? (
          <div className="card__inner">
            <Loading rows={7} label="Loading test runs" />
          </div>
        ) : state.error && !state.data ? (
          <div className="card__inner">
            <ErrorState message={state.error} onRetry={state.reload} />
          </div>
        ) : state.data && state.data.items.length === 0 ? (
          <div className="card__inner">
            <EmptyState
              icon="terminal"
              title="No saved test runs"
              description={
                <>
                  Capture a Playwright run with{' '}
                  <code>stacknext capture --name &lt;name&gt; -- npx playwright test</code>. Runs
                  appear here after the collector stores the completed sample.
                </>
              }
            />
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Status</th>
                    <th className="numeric">Scenarios</th>
                    <th className="numeric">Samples</th>
                    <th>Environment</th>
                    <th className="numeric">Duration</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data?.items.map((run) => (
                    <tr
                      key={run.id}
                      className="row-clickable"
                      tabIndex={0}
                      onClick={() => onNavigate(`/runs/${run.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onNavigate(`/runs/${run.id}`)
                        }
                      }}
                    >
                      <td>
                        <div className="route-cell">{run.name}</div>
                        <div className="sub-cell mono">{run.id}</div>
                      </td>
                      <td>
                        <Badge tone={RUN_STATUS_TONE[run.status]}>{run.status}</Badge>
                      </td>
                      <td className="numeric">{run.scenarios}</td>
                      <td className="numeric">
                        {run.samples}
                        <div className="sub-cell">
                          {run.verifiedSamples} verified
                          {run.incompleteSamples > 0
                            ? ` · ${run.incompleteSamples} incomplete`
                            : ''}
                        </div>
                      </td>
                      <td>
                        <span className="sub-cell">{environmentLine(run)}</span>
                      </td>
                      <td className="numeric">{formatDuration(run.durationMs)}</td>
                      <td title={formatDateTime(run.createdAt)}>
                        {formatRelative(run.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card__footer">
              <Pagination
                total={state.data?.total ?? 0}
                limit={LIMIT}
                offset={offset}
                onChange={setOffset}
              />
            </div>
          </>
        )}
      </Card>

      {latest && (
        <p className="muted dashboard-note">
          Latest capture {formatRelative(latest.createdAt)}: {latest.verifiedSamples} verified
          sample{latest.verifiedSamples === 1 ? '' : 's'} and {latest.incompleteSamples} incomplete.
          Runs are read-only in the dashboard; use the CLI to capture or save baselines.
        </p>
      )}
    </>
  )
}
