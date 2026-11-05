import { useMemo, useState } from 'react'
import type { PageResult } from '@stacknext/core'
import type { RunSummary } from '@stacknext/regression'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Id,
  ListTableSkeleton,
  PageHeader,
  PageLayout,
  SearchInput,
  StatCard,
  StatGridSkeleton,
  StatStrip,
  TableFooter,
  Toolbar,
} from '../components/ui'
import { Icon } from '../components/Icon'
import { formatDateTime, formatDuration, formatNumber, formatRelative } from '../format'
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
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const state = useAsync<PageResult<RunSummary>>(
    (signal) => api.testRuns({ limit: LIMIT, offset }, signal),
    `runs:${offset}`,
    refreshKey,
  )

  const runs = useMemo(() => state.data?.items ?? [], [state.data])
  const total = state.data?.total ?? 0
  const query = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!query) return runs
    return runs.filter((run) =>
      [run.name, run.id, run.status, environmentLine(run)].some((value) =>
        value.toLowerCase().includes(query),
      ),
    )
  }, [runs, query])

  const verified = runs.reduce((sum, run) => sum + run.verifiedSamples, 0)
  const incomplete = runs.reduce((sum, run) => sum + run.incompleteSamples, 0)
  const scenarios = runs.reduce((sum, run) => sum + run.scenarios, 0)
  const latest = runs[0]
  const environmentValues = new Set(runs.map(environmentLine))
  const uniformEnvironment = environmentValues.size === 1 ? [...environmentValues][0] ?? null : null
  const searchActive = query.length > 0

  const columns = [
    { key: 'run', label: 'Capture run' },
    { key: 'status', label: 'Status', width: '132px' },
    { key: 'scenarios', label: 'Scenarios', align: 'right' as const, width: '96px' },
    { key: 'samples', label: 'Samples', align: 'right' as const, width: '104px' },
    ...(uniformEnvironment
      ? []
      : [{ key: 'environment', label: 'Environment', width: '280px' }]),
    { key: 'duration', label: 'Duration', align: 'right' as const, width: '96px' },
    { key: 'created', label: 'Created', align: 'right' as const, width: '110px' },
  ]

  return (
    <PageLayout>
      <PageHeader
        eyebrow="Regression · 1 of 3 · Capture"
        title="Test runs"
        description="Every capture is a historical record. Failed and incomplete runs stay visible here."
        info="A test run is not a baseline. Save a completed run with verified samples to create an immutable reference for comparison."
        actions={
          <>
            <Badge tone="muted">Capture history</Badge>
            <button type="button" className="button button--secondary" onClick={state.reload}>
              <Icon name="refresh" size={15} /> Refresh
            </button>
          </>
        }
      />

      {state.data ? (
        <StatStrip>
          <StatCard
            label="Capture runs"
            value={formatNumber(total)}
            hint="In .stacknext/runs"
          />
          <StatCard
            label="Scenarios · this page"
            value={formatNumber(scenarios)}
            hint={`Across ${formatNumber(runs.length)} loaded run${runs.length === 1 ? '' : 's'}`}
          />
          <StatCard
            label="Verified samples · this page"
            value={formatNumber(verified)}
            hint="Trace correlation confirmed"
            tone="good"
          />
          <StatCard
            label="Incomplete · this page"
            value={formatNumber(incomplete)}
            hint="Reported, never fabricated"
            tone={incomplete > 0 ? 'warn' : 'default'}
          />
        </StatStrip>
      ) : (
        <StatGridSkeleton />
      )}

      <Toolbar
        label="Filter test runs"
        aside={
          <>
            {uniformEnvironment && (
              <span className="toolbar__env" title={uniformEnvironment}>
                <Badge tone="muted">{uniformEnvironment}</Badge>
              </span>
            )}
            {searchActive && (
              <button
                type="button"
                className="button button--ghost list-toolbar__clear"
                onClick={() => setSearch('')}
              >
                Clear search
              </button>
            )}
            <span className="toolbar__count">
              {searchActive
                ? `${formatNumber(filtered.length)} of ${formatNumber(runs.length)} on this page`
                : `${formatNumber(runs.length)} on this page`}
            </span>
          </>
        }
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search runs or environment…"
          label="Search test runs"
        />
      </Toolbar>

      <Card padded={false}>
        {state.loading && !state.data ? (
          <ListTableSkeleton
            label="Loading test runs"
            tableClassName="data-table--runs"
            columns={[
              { key: 'run', label: 'Capture run', width: '34%', secondaryWidth: '24%' },
              { key: 'status', label: 'Status', width: '64%' },
              { key: 'scenarios', label: 'Scenarios', className: 'numeric', width: '36%' },
              { key: 'samples', label: 'Samples', className: 'numeric', width: '42%' },
              { key: 'duration', label: 'Duration', className: 'numeric', width: '44%' },
              { key: 'created', label: 'Created', className: 'numeric', width: '52%' },
            ]}
          />
        ) : state.error && !state.data ? (
          <div className="card__inner">
            <ErrorState message={state.error} onRetry={state.reload} />
          </div>
        ) : state.data && runs.length === 0 ? (
          <div className="card__inner">
            <EmptyState
              icon="terminal"
              title="No capture runs yet"
              description={
                <>
                  Capture one with{' '}
                  <code>stacknext capture --name &lt;name&gt; -- npx playwright test</code>.
                </>
              }
            />
          </div>
        ) : (
          <>
            <DataTable
              label="Capture runs"
              className="data-table--runs"
              columns={columns}
              empty={
                filtered.length === 0
                  ? 'No runs on this page match the search.'
                  : undefined
              }
            >
              {filtered.map((run) => (
                <tr
                  key={run.id}
                  className="row-clickable"
                  tabIndex={0}
                  title={[
                    run.name,
                    run.id,
                    run.status,
                    `${formatNumber(run.scenarios)} scenarios · ${formatNumber(run.samples)} samples · ${formatNumber(run.verifiedSamples)} verified · ${formatNumber(run.incompleteSamples)} incomplete`,
                    environmentLine(run),
                    formatDuration(run.durationMs),
                    formatDateTime(run.createdAt),
                  ].join(' — ')}
                  onClick={() => onNavigate(`/runs/${run.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onNavigate(`/runs/${run.id}`)
                    }
                  }}
                >
                  <td>
                    <div className="route-cell" title={run.name}>
                      {run.name}
                    </div>
                    <div className="sub-cell">
                      <Id value={run.id} />
                    </div>
                  </td>
                  <td>
                    <Badge tone={RUN_STATUS_TONE[run.status]}>{run.status}</Badge>
                  </td>
                  <td className="numeric tabular">{formatNumber(run.scenarios)}</td>
                  <td className="numeric">
                    {formatNumber(run.samples)}
                    <div className="sub-cell">
                      {formatNumber(run.verifiedSamples)} verified
                      {run.incompleteSamples > 0
                        ? ` · ${formatNumber(run.incompleteSamples)} incomplete`
                        : ''}
                    </div>
                  </td>
                  {!uniformEnvironment && (
                    <td className="env-cell muted" title={environmentLine(run)}>
                      {environmentLine(run)}
                    </td>
                  )}
                  <td className="numeric tabular">{formatDuration(run.durationMs)}</td>
                  <td
                    className="numeric muted tabular"
                    title={formatDateTime(run.createdAt)}
                  >
                    {formatRelative(run.createdAt)}
                  </td>
                </tr>
              ))}
            </DataTable>
            <div className="card__footer">
              <TableFooter
                total={total}
                limit={LIMIT}
                offset={offset}
                onChange={setOffset}
                note={
                  latest ? (
                    <>
                      Newest on this page {formatRelative(latest.createdAt)}:{' '}
                      {formatNumber(latest.verifiedSamples)} verified ·{' '}
                      {formatNumber(latest.incompleteSamples)} incomplete
                    </>
                  ) : undefined
                }
              />
            </div>
          </>
        )}
      </Card>
    </PageLayout>
  )
}
