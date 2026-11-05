import { useMemo, useState } from 'react'
import type { PageResult } from '@stacknext/core'
import type { ComparisonSummaryItem } from '@stacknext/regression'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
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
  cx,
} from '../components/ui'
import { Icon } from '../components/Icon'
import { formatDateTime, formatNumber, formatRelative } from '../format'
import { REGRESSION_SEVERITY_TONE, REGRESSION_STATUS_TONE } from './RegressionScenarios'

const LIMIT = 25

export function ComparisonsPage({
  refreshKey,
  onNavigate,
}: {
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const state = useAsync<PageResult<ComparisonSummaryItem>>(
    (signal) => api.comparisons({ limit: LIMIT, offset }, signal),
    `comparisons:${offset}`,
    refreshKey,
  )

  const comparisons = useMemo(() => state.data?.items ?? [], [state.data])
  const total = state.data?.total ?? 0
  const query = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!query) return comparisons
    return comparisons.filter((item) =>
      [
        item.id,
        item.baselineId,
        item.candidateId,
        item.status,
        item.severity,
        item.environmentCompatible ? 'compatible' : 'different',
      ].some((value) => value.toLowerCase().includes(query)),
    )
  }, [comparisons, query])

  const regressed = comparisons.reduce((sum, item) => sum + item.summary.regressed, 0)
  const improved = comparisons.reduce((sum, item) => sum + item.summary.improved, 0)
  const inconclusive = comparisons.reduce((sum, item) => sum + item.summary.inconclusive, 0)
  const latest = comparisons[0]
  const compatibleValues = new Set(comparisons.map((item) => item.environmentCompatible))
  const uniformEnvironment =
    compatibleValues.size === 1 ? [...compatibleValues][0] ?? null : null
  const searchActive = query.length > 0

  const columns = [
    { key: 'comparison', label: 'Comparison report' },
    { key: 'status', label: 'Status', width: '132px' },
    { key: 'severity', label: 'Severity', width: '100px' },
    { key: 'regressed', label: 'Regressed', align: 'right' as const, width: '88px' },
    { key: 'unchanged', label: 'Unchanged', align: 'right' as const, width: '96px' },
    { key: 'inconclusive', label: 'Inconclusive', align: 'right' as const, width: '110px' },
    { key: 'environment', label: 'Environment', width: '120px' },
    { key: 'created', label: 'Created', align: 'right' as const, width: '100px' },
  ]

  return (
    <PageLayout>
      <PageHeader
        eyebrow="Regression · 3 of 3 · Compare"
        title="Comparisons"
        description="Report-only results of a baseline versus a later candidate run."
        info="Status and severity are separate. Inconclusive is the default when evidence or environments do not line up. These are report-only medians, not significance tests."
        actions={
          <>
            <Badge tone="accent">Report only</Badge>
            <button type="button" className="button button--secondary" onClick={state.reload}>
              <Icon name="refresh" size={15} /> Refresh
            </button>
          </>
        }
      />

      {state.data ? (
        <StatStrip>
          <StatCard
            label="Comparison reports"
            value={formatNumber(total)}
            hint="In .stacknext/comparisons"
          />
          <StatCard
            label="Regressed · this page"
            value={formatNumber(regressed)}
            hint={`Across ${formatNumber(comparisons.length)} loaded comparison${comparisons.length === 1 ? '' : 's'}`}
            tone={regressed > 0 ? 'bad' : 'good'}
          />
          <StatCard
            label="Improved · this page"
            value={formatNumber(improved)}
            hint="Measured improvement only"
            tone={improved > 0 ? 'good' : 'default'}
          />
          <StatCard
            label="Inconclusive · this page"
            value={formatNumber(inconclusive)}
            hint="Missing or mismatched evidence"
            tone={inconclusive > 0 ? 'warn' : 'default'}
          />
        </StatStrip>
      ) : (
        <StatGridSkeleton />
      )}

      <Toolbar
        label="Filter comparisons"
        aside={
          <>
            {uniformEnvironment !== null && (
              <span className="toolbar__env">
                <Badge tone={uniformEnvironment ? 'good' : 'warn'}>
                  {uniformEnvironment ? 'Environments compatible' : 'Environments differ'}
                </Badge>
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
                ? `${formatNumber(filtered.length)} of ${formatNumber(comparisons.length)} on this page`
                : `${formatNumber(comparisons.length)} on this page`}
            </span>
          </>
        }
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search comparison or baseline…"
          label="Search comparisons"
        />
      </Toolbar>

      <Card padded={false}>
        {state.loading && !state.data ? (
          <ListTableSkeleton
            label="Loading comparisons"
            tableClassName="data-table--comparisons"
            columns={[
              { key: 'comparison', label: 'Comparison report', width: '30%', secondaryWidth: '22%' },
              { key: 'status', label: 'Status', width: '62%' },
              { key: 'severity', label: 'Severity', width: '58%' },
              { key: 'regressed', label: 'Regressed', className: 'numeric', width: '38%' },
              { key: 'unchanged', label: 'Unchanged', className: 'numeric', width: '42%' },
              { key: 'inconclusive', label: 'Inconclusive', className: 'numeric', width: '46%' },
              { key: 'environment', label: 'Environment', width: '54%' },
              { key: 'created', label: 'Created', className: 'numeric', width: '52%' },
            ]}
          />
        ) : state.error && !state.data ? (
          <div className="card__inner">
            <ErrorState message={state.error} onRetry={state.reload} />
          </div>
        ) : state.data && comparisons.length === 0 ? (
          <div className="card__inner">
            <EmptyState
              icon="pulse"
              title="No comparison reports saved"
              description={
                <>
                  Compare with{' '}
                  <code>stacknext compare &lt;baseline-id&gt; &lt;candidate-run-id&gt;</code>.
                </>
              }
            />
          </div>
        ) : (
          <>
            <DataTable
              label="Comparison reports"
              className="data-table--comparisons data-table--wide"
              columns={columns}
              empty={
                filtered.length === 0
                  ? 'No comparisons on this page match the search.'
                  : undefined
              }
            >
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="row-clickable"
                  tabIndex={0}
                  title={[
                    item.id,
                    `${item.baselineId} → ${item.candidateId}`,
                    `${item.status} · ${item.severity}`,
                    `${formatNumber(item.summary.scenarios)} scenarios · ${formatNumber(item.summary.regressed)} regressed · ${formatNumber(item.summary.improved)} improved · ${formatNumber(item.summary.unchanged)} unchanged · ${formatNumber(item.summary.inconclusive)} inconclusive`,
                    item.environmentCompatible ? 'environment compatible' : 'environment incompatible',
                    formatDateTime(item.createdAt),
                  ].join(' — ')}
                  onClick={() => onNavigate(`/comparisons/${item.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onNavigate(`/comparisons/${item.id}`)
                    }
                  }}
                >
                  <td>
                    <div className="route-cell">
                      <IdLink
                        value={item.id}
                        label="Open comparison"
                        onClick={() => onNavigate(`/comparisons/${item.id}`)}
                      />
                    </div>
                    <div className="sub-cell id-pair">
                      <IdLink
                        value={item.baselineId}
                        label="Open baseline"
                        onClick={() => onNavigate(`/baselines/${item.baselineId}`)}
                      />
                      <span className="id-pair__arrow" aria-hidden="true">
                        →
                      </span>
                      <IdLink
                        value={item.candidateId}
                        label="Open candidate run"
                        onClick={() => onNavigate(`/runs/${item.candidateId}`)}
                      />
                    </div>
                  </td>
                  <td>
                    <Badge tone={REGRESSION_STATUS_TONE[item.status]}>{item.status}</Badge>
                  </td>
                  <td>
                    <Badge tone={REGRESSION_SEVERITY_TONE[item.severity]}>
                      {item.severity}
                    </Badge>
                  </td>
                  <td
                    className={cx(
                      'numeric tabular',
                      item.summary.regressed === 0 && 'muted',
                    )}
                  >
                    {formatNumber(item.summary.regressed)}
                  </td>
                  <td
                    className={cx(
                      'numeric tabular',
                      item.summary.unchanged === 0 && 'muted',
                    )}
                  >
                    {formatNumber(item.summary.unchanged)}
                  </td>
                  <td
                    className={cx(
                      'numeric tabular',
                      item.summary.inconclusive === 0 && 'muted',
                    )}
                  >
                    {formatNumber(item.summary.inconclusive)}
                  </td>
                  <td>
                    <Badge tone={item.environmentCompatible ? 'good' : 'warn'}>
                      {item.environmentCompatible ? 'compatible' : 'different'}
                    </Badge>
                  </td>
                  <td
                    className="numeric muted tabular"
                    title={formatDateTime(item.createdAt)}
                  >
                    {formatRelative(item.createdAt)}
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
                      Newest on this page {formatRelative(latest.createdAt)} · medians only
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
