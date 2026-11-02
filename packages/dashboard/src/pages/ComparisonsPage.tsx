import { useState } from 'react'
import type { PageResult } from '@stacknext/core'
import type { ComparisonSummaryItem } from '@stacknext/regression'
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
import { formatDateTime, formatRelative } from '../format'
import { REGRESSION_SEVERITY_TONE, REGRESSION_STATUS_TONE } from './RegressionScenarios'

const LIMIT = 25

export function ComparisonsPage({
  refreshKey,
  onNavigate,
}: {
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const [offset, setOffset] = useState(0)
  const state = useAsync<PageResult<ComparisonSummaryItem>>(
    (signal) => api.comparisons({ limit: LIMIT, offset }, signal),
    `comparisons:${offset}`,
    refreshKey,
  )

  const regressed = state.data?.items.reduce((sum, item) => sum + item.summary.regressed, 0) ?? 0
  const improved = state.data?.items.reduce((sum, item) => sum + item.summary.improved, 0) ?? 0
  const inconclusive =
    state.data?.items.reduce((sum, item) => sum + item.summary.inconclusive, 0) ?? 0
  const latest = state.data?.items[0]

  return (
    <>
      <PageHeader
        eyebrow="Runtime regression testing"
        title="Comparisons"
        description="Deterministic comparisons between a saved baseline and a candidate run. Status and severity are separate; inconclusive is the default when evidence or environments do not line up."
        actions={
          <button type="button" className="button button--ghost" onClick={state.reload}>
            <Icon name="refresh" size={15} /> Refresh
          </button>
        }
      />

      {state.data && (
        <div className="stat-grid">
          <StatCard
            label="Comparisons"
            value={state.data.total}
            hint="stored under .stacknext/comparisons"
            icon="pulse"
          />
          <StatCard
            label="Regressed scenarios"
            value={regressed}
            hint={`${state.data.items.length} comparisons in this page`}
            tone={regressed > 0 ? 'bad' : 'good'}
            icon="errors"
          />
          <StatCard
            label="Improved scenarios"
            value={improved}
            hint="measured improvement only"
            tone={improved > 0 ? 'good' : 'default'}
            icon="check"
          />
          <StatCard
            label="Inconclusive"
            value={inconclusive}
            hint="missing or mismatched evidence"
            tone={inconclusive > 0 ? 'warn' : 'default'}
            icon="shield"
          />
        </div>
      )}

      <Card padded={false}>
        {state.loading && !state.data ? (
          <div className="card__inner">
            <Loading rows={6} label="Loading comparisons" />
          </div>
        ) : state.error && !state.data ? (
          <div className="card__inner">
            <ErrorState message={state.error} onRetry={state.reload} />
          </div>
        ) : state.data && state.data.items.length === 0 ? (
          <div className="card__inner">
            <EmptyState
              icon="pulse"
              title="No comparisons saved"
              description={
                <>
                  Compare a baseline with a later run using{' '}
                  <code>stacknext compare &lt;baseline-id&gt; &lt;candidate-run-id&gt;</code>. StackNext
                  writes the comparison locally and never uploads it.
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
                    <th>Comparison</th>
                    <th>Status</th>
                    <th>Severity</th>
                    <th>Scenarios</th>
                    <th>Environment</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data?.items.map((item) => (
                    <tr
                      key={item.id}
                      className="row-clickable"
                      tabIndex={0}
                      onClick={() => onNavigate(`/comparisons/${item.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onNavigate(`/comparisons/${item.id}`)
                        }
                      }}
                    >
                      <td>
                        <div className="route-cell mono">{item.id}</div>
                        <div className="sub-cell mono">
                          {item.baselineId} → {item.candidateId}
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
                      <td>
                        <div className="regression-counts">
                          <span className="regression-counts__regressed">
                            {item.summary.regressed} regressed
                          </span>
                          <span>{item.summary.unchanged} unchanged</span>
                          <span>{item.summary.inconclusive} inconclusive</span>
                        </div>
                      </td>
                      <td>
                        <Badge tone={item.environmentCompatible ? 'good' : 'warn'}>
                          {item.environmentCompatible ? 'compatible' : 'different'}
                        </Badge>
                      </td>
                      <td title={formatDateTime(item.createdAt)}>
                        {formatRelative(item.createdAt)}
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
          Latest comparison {formatRelative(latest.createdAt)}: {latest.summary.regressed}{' '}
          regressed, {latest.summary.improved} improved, {latest.summary.unchanged} unchanged and{' '}
          {latest.summary.inconclusive} inconclusive scenario
          {latest.summary.scenarios === 1 ? '' : 's'}. StackNext makes no statistical significance
          claim from these local medians.
        </p>
      )}
    </>
  )
}
