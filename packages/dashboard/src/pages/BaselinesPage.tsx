import { useMemo, useState } from 'react'
import type { PageResult } from '@stacknext/core'
import type { BaselineSummary } from '@stacknext/regression'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Id,
  IdLink,
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
import { formatDateTime, formatNumber, formatRelative } from '../format'
const LIMIT = 25

function environmentLine(baseline: BaselineSummary): string {
  const next = baseline.environment.nextVersion
    ? ` · Next.js ${baseline.environment.nextVersion}`
    : ''
  return `Node ${baseline.environment.nodeVersion}${next} · ${baseline.environment.platform}/${baseline.environment.arch}`
}

export function BaselinesPage({
  refreshKey,
  onNavigate,
}: {
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const state = useAsync<PageResult<BaselineSummary>>(
    (signal) => api.baselines({ limit: LIMIT, offset }, signal),
    `baselines:${offset}`,
    refreshKey,
  )

  const baselines = useMemo(() => state.data?.items ?? [], [state.data])
  const total = state.data?.total ?? 0
  const query = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!query) return baselines
    return baselines.filter((baseline) =>
      [baseline.name, baseline.id, baseline.sourceRunId, environmentLine(baseline)].some(
        (value) => value.toLowerCase().includes(query),
      ),
    )
  }, [baselines, query])

  const scenarios = baselines.reduce((sum, baseline) => sum + baseline.scenarios, 0)
  const samples = baselines.reduce((sum, baseline) => sum + baseline.samples, 0)
  const latest = baselines[0]
  const environmentValues = new Set(baselines.map(environmentLine))
  const uniformEnvironment =
    environmentValues.size === 1 ? [...environmentValues][0] ?? null : null
  const searchActive = query.length > 0

  const columns = [
    { key: 'baseline', label: 'Reference baseline' },
    { key: 'source', label: 'Source run', width: '176px' },
    { key: 'scenarios', label: 'Scenarios', align: 'right' as const, width: '96px' },
    { key: 'samples', label: 'Samples', align: 'right' as const, width: '104px' },
    ...(uniformEnvironment
      ? []
      : [{ key: 'environment', label: 'Environment', width: '280px' }]),
    { key: 'created', label: 'Created', align: 'right' as const, width: '110px' },
  ]

  return (
    <PageLayout>
      <PageHeader
        eyebrow="Regression · 2 of 3 · Reference"
        title="Baselines"
        description="Immutable snapshots saved from completed runs. A baseline is the reference side of a comparison."
        info="Baselines copy evidence from one completed run. They do not follow the run or the live collector, and they are never pruned automatically."
        actions={
          <>
            <Badge tone="good">Immutable reference</Badge>
            <button type="button" className="button button--secondary" onClick={state.reload}>
              <Icon name="refresh" size={15} /> Refresh
            </button>
          </>
        }
      />

      {state.data ? (
        <StatStrip>
          <StatCard
            label="Reference baselines"
            value={formatNumber(total)}
            hint="In .stacknext/baselines"
          />
          <StatCard
            label="Scenarios · this page"
            value={formatNumber(scenarios)}
            hint={`Across ${formatNumber(baselines.length)} loaded baseline${baselines.length === 1 ? '' : 's'}`}
          />
          <StatCard
            label="Reference samples · this page"
            value={formatNumber(samples)}
            hint="Frozen measurements"
          />
          <StatCard
            label="Latest saved · this page"
            value={latest ? formatRelative(latest.createdAt) : 'None'}
            hint={latest ? latest.name : 'No baseline loaded'}
          />
        </StatStrip>
      ) : (
        <StatGridSkeleton />
      )}

      <Toolbar
        label="Filter baselines"
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
                ? `${formatNumber(filtered.length)} of ${formatNumber(baselines.length)} on this page`
                : `${formatNumber(baselines.length)} on this page`}
            </span>
          </>
        }
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search baselines or source run…"
          label="Search baselines"
        />
      </Toolbar>

      <Card padded={false}>
        {state.loading && !state.data ? (
          <ListTableSkeleton
            label="Loading baselines"
            tableClassName="data-table--baselines"
            columns={[
              { key: 'baseline', label: 'Reference baseline', width: '34%', secondaryWidth: '24%' },
              { key: 'source', label: 'Source run', width: '58%' },
              { key: 'scenarios', label: 'Scenarios', className: 'numeric', width: '36%' },
              { key: 'samples', label: 'Samples', className: 'numeric', width: '44%' },
              { key: 'created', label: 'Created', className: 'numeric', width: '54%' },
            ]}
          />
        ) : state.error && !state.data ? (
          <div className="card__inner">
            <ErrorState message={state.error} onRetry={state.reload} />
          </div>
        ) : state.data && baselines.length === 0 ? (
          <div className="card__inner">
            <EmptyState
              icon="shield"
              title="No reference baselines saved"
              description={
                <>
                  Save one from a completed run with{' '}
                  <code>stacknext baseline save &lt;run-id&gt; --name &lt;name&gt;</code>.
                </>
              }
            />
          </div>
        ) : (
          <>
            <DataTable
              label="Baselines"
              className="data-table--baselines"
              columns={columns}
              empty={
                filtered.length === 0
                  ? 'No baselines on this page match the search.'
                  : undefined
              }
            >
              {filtered.map((baseline) => (
                <tr
                  key={baseline.id}
                  className="row-clickable"
                  tabIndex={0}
                  title={[
                    baseline.name,
                    baseline.id,
                    `source run ${baseline.sourceRunId}`,
                    `${formatNumber(baseline.scenarios)} scenarios · ${formatNumber(baseline.samples)} samples`,
                    environmentLine(baseline),
                    formatDateTime(baseline.createdAt),
                  ].join(' — ')}
                  onClick={() => onNavigate(`/baselines/${baseline.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onNavigate(`/baselines/${baseline.id}`)
                    }
                  }}
                >
                  <td>
                    <div className="route-cell" title={baseline.name}>
                      {baseline.name}
                    </div>
                    <div className="sub-cell">
                      <Id value={baseline.id} />
                    </div>
                  </td>
                  <td>
                    <IdLink
                      value={baseline.sourceRunId}
                      label="Open source run"
                      onClick={() => onNavigate(`/runs/${baseline.sourceRunId}`)}
                    />
                  </td>
                  <td className="numeric tabular">{formatNumber(baseline.scenarios)}</td>
                  <td className="numeric tabular">{formatNumber(baseline.samples)}</td>
                  {!uniformEnvironment && (
                    <td className="env-cell muted" title={environmentLine(baseline)}>
                      {environmentLine(baseline)}
                    </td>
                  )}
                  <td
                    className="numeric muted tabular"
                    title={formatDateTime(baseline.createdAt)}
                  >
                    {formatRelative(baseline.createdAt)}
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
                      Newest on this page {formatRelative(latest.createdAt)}: {latest.name}
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
