import { useMemo } from 'react'
import type { CaseView } from '@stacknext/core'
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
  StatCard,
  StatGridSkeleton,
  StatStrip,
  type Tone,
} from '../components/ui'
import { Icon } from '../components/Icon'
import { formatNumber, formatRelative } from '../format'

const LIMIT = 50

const STATUS_TONE: Record<CaseView['status'], Tone> = {
  open: 'warn',
  verified: 'good',
  refuted: 'bad',
  abandoned: 'muted',
}

export function CasesPage({
  refreshKey,
  onNavigate,
}: {
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const state = useAsync<{ items: CaseView[]; total: number; dropped: number }>(
    (signal) => api.cases({ limit: LIMIT }, signal),
    'cases',
    refreshKey,
    5_000,
  )
  const cases = useMemo(() => state.data?.items ?? [], [state.data])
  const verified = cases.filter((entry) => entry.status === 'verified').length
  const evidence = cases.reduce((sum, entry) => sum + entry.evidence.length, 0)

  return (
    <PageLayout>
      <PageHeader
        eyebrow="Investigation · local"
        title="Cases"
        description="Append-only records that link a hypothesis to the evidence that supports or refutes it."
        info="Cases are written with `stacknext case` from the CLI. This page is read-only; pinning is a copyable CLI command, never a dashboard write."
        actions={
          <button type="button" className="button button--secondary" onClick={state.reload}>
            <Icon name="refresh" size={15} /> Refresh
          </button>
        }
      />

      {state.data ? (
        <StatStrip>
          <StatCard label="Cases" value={formatNumber(state.data.total)} hint="In .stacknext/cases" />
          <StatCard label="Evidence ids" value={formatNumber(evidence)} hint="Across this page" />
          <StatCard
            label="Verified"
            value={formatNumber(verified)}
            hint="A recorded status, not a root cause"
            tone={verified > 0 ? 'good' : 'default'}
          />
          <StatCard
            label="Dropped"
            value={formatNumber(state.data.dropped)}
            hint="Malformed lines skipped"
            tone={state.data.dropped > 0 ? 'warn' : 'default'}
          />
        </StatStrip>
      ) : (
        <StatGridSkeleton />
      )}

      <Card padded={false}>
        {state.loading && !state.data ? (
          <ListTableSkeleton
            label="Loading cases"
            columns={[
              { key: 'title', label: 'Case', width: '40%' },
              { key: 'status', label: 'Status', width: '14%' },
              { key: 'evidence', label: 'Evidence', width: '12%' },
              { key: 'session', label: 'Session', width: '18%' },
              { key: 'updated', label: 'Updated', width: '16%' },
            ]}
          />
        ) : state.error && !state.data ? (
          <div className="card__inner">
            <ErrorState message={state.error} onRetry={state.reload} />
          </div>
        ) : cases.length === 0 ? (
          <div className="card__inner">
            <EmptyState
              icon="inbox"
              title="No investigation cases yet"
              description={
                <>
                  Create one with <code>stacknext case new --title &quot;...&quot;</code>.
                  Cases stay local under <code>.stacknext/cases</code>.
                </>
              }
            />
          </div>
        ) : (
          <DataTable
            label="Investigation cases"
            columns={[
              { key: 'title', label: 'Case', width: '40%' },
              { key: 'status', label: 'Status', width: '14%' },
              { key: 'evidence', label: 'Evidence', width: '12%', className: 'numeric' },
              { key: 'session', label: 'Session', width: '18%' },
              { key: 'updated', label: 'Updated', width: '16%' },
            ]}
          >
            {cases.map((entry) => (
              <tr
                key={entry.id}
                className="row-clickable"
                tabIndex={0}
                onClick={() => onNavigate(`/cases/${entry.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onNavigate(`/cases/${entry.id}`)
                  }
                }}
              >
                <td data-label="Case">
                  <strong>{entry.title}</strong>
                  <div className="row-secondary mono"><Id value={entry.id} /></div>
                </td>
                <td data-label="Status">
                  <Badge tone={STATUS_TONE[entry.status]}>{entry.status}</Badge>
                </td>
                <td data-label="Evidence" className="numeric">
                  {formatNumber(entry.evidence.length)}
                </td>
                <td data-label="Session" className="mono">
                  {entry.agentSessionId ? <Id value={entry.agentSessionId} /> : 'human'}
                </td>
                <td data-label="Updated" title={new Date(entry.updatedAt).toISOString()}>
                  {formatRelative(entry.updatedAt)}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </PageLayout>
  )
}
