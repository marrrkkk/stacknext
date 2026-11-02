import { useState } from 'react'
import type { PageResult } from '@stacknext/core'
import type { BaselineSummary } from '@stacknext/regression'
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
import { formatDateTime, formatNumber, formatRelative } from '../format'

const LIMIT = 25

function environmentLine(baseline: BaselineSummary): string {
  const next = baseline.environment.nextVersion ? ` · Next.js ${baseline.environment.nextVersion}` : ''
  return `Node ${baseline.environment.nodeVersion}${next} · ${baseline.environment.platform}/${baseline.environment.arch}`
}

export function BaselinesPage({
  refreshKey,
  onNavigate,
}: {
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const [offset, setOffset] = useState(0)
  const state = useAsync<PageResult<BaselineSummary>>(
    (signal) => api.baselines({ limit: LIMIT, offset }, signal),
    `baselines:${offset}`,
    refreshKey,
  )

  const scenarios = state.data?.items.reduce((sum, baseline) => sum + baseline.scenarios, 0) ?? 0
  const samples = state.data?.items.reduce((sum, baseline) => sum + baseline.samples, 0) ?? 0
  const latest = state.data?.items[0]

  return (
    <>
      <PageHeader
        eyebrow="Runtime regression testing"
        title="Baselines"
        description="Saved reference runs under .stacknext/baselines. Baselines are immutable records, never uploaded and never deleted automatically."
        actions={
          <button type="button" className="button button--ghost" onClick={state.reload}>
            <Icon name="refresh" size={15} /> Refresh
          </button>
        }
      />

      {state.data && (
        <div className="stat-grid">
          <StatCard
            label="Baselines"
            value={state.data.total}
            hint="no auto-deletion"
            icon="shield"
          />
          <StatCard
            label="Scenarios"
            value={scenarios}
            hint={`${state.data.items.length} baselines in this page`}
            icon="traces"
          />
          <StatCard
            label="Samples"
            value={samples}
            hint="reference measurements"
            icon="layers"
          />
          <StatCard
            label="Latest"
            value={latest ? formatRelative(latest.createdAt) : '—'}
            hint={latest ? latest.name : 'no baseline yet'}
            icon="clock"
          />
        </div>
      )}

      <Card padded={false}>
        {state.loading && !state.data ? (
          <div className="card__inner">
            <Loading rows={6} label="Loading baselines" />
          </div>
        ) : state.error && !state.data ? (
          <div className="card__inner">
            <ErrorState message={state.error} onRetry={state.reload} />
          </div>
        ) : state.data && state.data.items.length === 0 ? (
          <div className="card__inner">
            <EmptyState
              icon="shield"
              title="No baselines saved"
              description={
                <>
                  Save a completed run as a baseline with{' '}
                  <code>stacknext baseline save &lt;run-id&gt; --name &lt;name&gt;</code>. Only runs
                  with verified telemetry and a completed status can become a baseline.
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
                    <th>Baseline</th>
                    <th>Source run</th>
                    <th className="numeric">Scenarios</th>
                    <th className="numeric">Samples</th>
                    <th>Environment</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data?.items.map((baseline) => (
                    <tr
                      key={baseline.id}
                      className="row-clickable"
                      tabIndex={0}
                      onClick={() => onNavigate(`/baselines/${baseline.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onNavigate(`/baselines/${baseline.id}`)
                        }
                      }}
                    >
                      <td>
                        <div className="route-cell">{baseline.name}</div>
                        <div className="sub-cell mono">{baseline.id}</div>
                      </td>
                      <td className="mono sub-cell">{baseline.sourceRunId}</td>
                      <td className="numeric">{baseline.scenarios}</td>
                      <td className="numeric">{formatNumber(baseline.samples)}</td>
                      <td>
                        <span className="sub-cell">{environmentLine(baseline)}</span>
                      </td>
                      <td title={formatDateTime(baseline.createdAt)}>
                        {formatRelative(baseline.createdAt)}
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
          <Badge tone="muted">reference</Badge> The newest baseline was created{' '}
          {formatRelative(latest.createdAt)}. Saving another baseline never replaces an existing
          record without an explicit overwrite confirmation.
        </p>
      )}
    </>
  )
}
