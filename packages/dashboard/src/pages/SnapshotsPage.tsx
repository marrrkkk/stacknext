import { useMemo, useState } from 'react'
import type { SnapshotListResponse, SnapshotSource, SnapshotSummary } from '@stacknext/core'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  Banner,
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
  TableFooter,
  type Tone,
} from '../components/ui'
import { Icon } from '../components/Icon'
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelative,
} from '../format'

const LIMIT = 50

export function snapshotSourceLabel(source: SnapshotSource): string {
  if (source === 'exit') return 'Auto · exit'
  if (source === 'error') return 'Auto · error'
  if (source === 'import') return 'Imported'
  return 'Manual'
}

export function snapshotSourceTone(source: SnapshotSource): Tone {
  if (source === 'error') return 'warn'
  if (source === 'exit') return 'muted'
  if (source === 'import') return 'good'
  return 'accent'
}

export function snapshotWindowLabel(snapshot: SnapshotSummary): string {
  const { firstEventTime, lastEventTime } = snapshot.sample
  if (firstEventTime === null || lastEventTime === null) return 'no timestamped events'
  const span = Math.max(0, lastEventTime - firstEventTime)
  return span < 1_000 ? 'single moment' : `${formatDuration(span)} window`
}

export function SnapshotsPage({
  refreshKey,
  onNavigate,
}: {
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const [offset, setOffset] = useState(0)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const state = useAsync<SnapshotListResponse>(
    (signal) => api.snapshots({ limit: LIMIT, offset }, signal),
    `snapshots:${offset}`,
    refreshKey,
  )

  const snapshots = useMemo(() => state.data?.items ?? [], [state.data])
  const total = state.data?.total ?? 0
  const invalid = state.data?.invalid ?? 0
  const automatic = snapshots.filter(
    (snapshot) => snapshot.source === 'exit' || snapshot.source === 'error',
  ).length
  const retained = snapshots.filter(
    (snapshot) => snapshot.source === 'manual' || snapshot.source === 'import',
  ).length
  const bytes = snapshots.reduce((sum, snapshot) => sum + snapshot.bytes, 0)
  const latest = snapshots[0]

  const save = async (): Promise<void> => {
    setSaving(true)
    setNotice(null)
    try {
      const snapshot = await api.saveSnapshot()
      setNotice({
        tone: 'good',
        text: `Saved ${snapshot.id}. Open it to browse the frozen sample.`,
      })
      setOffset(0)
      state.reload()
    } catch (error) {
      setNotice({
        tone: 'bad',
        text: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageLayout>
      <PageHeader
        eyebrow="Saved samples"
        title="Snapshots"
        description="Frozen, redacted copies of the in-memory sample. Snapshots keep traces, errors and queries after the live retention window ends."
        info="Automatic exit and error snapshots rotate. Manual and imported snapshots are never deleted automatically. Snapshots do not contain diagnostics or coverage."
        actions={
          <>
            <button
              type="button"
              className="button button--primary"
              onClick={() => void save()}
              disabled={saving}
              aria-busy={saving || undefined}
            >
              <Icon name={saving ? 'refresh' : 'layers'} size={15} className={saving ? 'icon-button__spin' : undefined} />
              {saving ? 'Saving…' : 'Save current sample'}
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={state.reload}
              disabled={state.loading}
            >
              <Icon name="refresh" size={15} /> Refresh
            </button>
          </>
        }
      />

      {notice && (
        <Banner
          tone={notice.tone}
          icon={notice.tone === 'good' ? 'check' : 'errors'}
          role={notice.tone === 'bad' ? 'alert' : 'note'}
        >
          {notice.text}
        </Banner>
      )}

      {invalid > 0 && (
        <Banner tone="warn" icon="errors" title="Some snapshot records are unreadable">
          {formatNumber(invalid)} snapshot record{invalid === 1 ? '' : 's'} could not be read
          and {invalid === 1 ? 'was' : 'were'} left on disk instead of being repaired or deleted.
        </Banner>
      )}

      {state.data ? (
        <StatStrip>
          <StatCard
            label="Saved snapshots"
            value={formatNumber(total)}
            hint="Under .stacknext/snapshots"
          />
          <StatCard
            label="Automatic · this page"
            value={formatNumber(automatic)}
            hint="Rotated by exit/error saves"
          />
          <StatCard
            label="Manual + imported · this page"
            value={formatNumber(retained)}
            hint="Never auto-deleted"
          />
          <StatCard
            label="Stored · this page"
            value={formatBytes(bytes)}
            hint={latest ? `Newest ${formatRelative(latest.createdAt)}` : 'No snapshots yet'}
          />
        </StatStrip>
      ) : (
        <StatGridSkeleton />
      )}

      <Card padded={false}>
        {state.loading && !state.data ? (
          <ListTableSkeleton
            label="Loading snapshots"
            tableClassName="data-table--snapshots"
            columns={[
              { key: 'snapshot', label: 'Snapshot', width: '34%', secondaryWidth: '28%' },
              { key: 'source', label: 'Source', width: '42%' },
              { key: 'captured', label: 'Captured', width: '52%' },
              { key: 'requests', label: 'Requests', className: 'numeric', width: '30%' },
              { key: 'spans', label: 'Spans', className: 'numeric', width: '30%' },
              { key: 'errors', label: 'Errors', className: 'numeric', width: '30%' },
              { key: 'queries', label: 'Queries', className: 'numeric', width: '30%' },
              { key: 'size', label: 'Size', className: 'numeric', width: '30%' },
            ]}
          />
        ) : state.error && !state.data ? (
          <div className="card__inner">
            <ErrorState message={state.error} onRetry={state.reload} />
          </div>
        ) : state.data && snapshots.length === 0 ? (
          <div className="card__inner">
            <EmptyState
              icon="layers"
              title="No snapshots saved yet"
              description={
                <>
                  StackNext saves one automatically when the dev process exits cleanly and one on
                  the first server error. You can also save the current sample above or with{' '}
                  <code>stacknext snapshot save --label &lt;name&gt;</code>.
                </>
              }
              action={
                <button
                  type="button"
                  className="button button--secondary button--small"
                  onClick={() => void save()}
                  disabled={saving}
                >
                  Save current sample
                </button>
              }
            />
          </div>
        ) : (
          <>
            <DataTable
              label="Snapshots"
              className="data-table--snapshots"
              columns={[
                { key: 'snapshot', label: 'Snapshot' },
                { key: 'source', label: 'Source', width: '128px' },
                { key: 'captured', label: 'Captured', width: '188px' },
                { key: 'requests', label: 'Requests', align: 'right', width: '92px' },
                { key: 'spans', label: 'Spans', align: 'right', width: '84px' },
                { key: 'errors', label: 'Errors', align: 'right', width: '84px' },
                { key: 'queries', label: 'Queries', align: 'right', width: '84px' },
                { key: 'size', label: 'Size', align: 'right', width: '84px' },
              ]}
            >
              {snapshots.map((snapshot) => (
                <tr
                  key={snapshot.id}
                  className="row-clickable"
                  tabIndex={0}
                  title={[
                    snapshot.label ?? snapshot.id,
                    snapshot.id,
                    snapshotSourceLabel(snapshot.source),
                    formatDateTime(snapshot.createdAt),
                    `${formatNumber(snapshot.stats.requests)} requests · ${formatNumber(snapshot.stats.spans)} spans`,
                    snapshotWindowLabel(snapshot),
                  ].join(' — ')}
                  onClick={() => onNavigate(`/snapshots/${snapshot.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onNavigate(`/snapshots/${snapshot.id}`)
                    }
                  }}
                >
                  <td>
                    <div className="route-cell" title={snapshot.label ?? snapshot.id}>
                      {snapshot.label ?? 'Untitled sample'}
                    </div>
                    <div className="sub-cell">
                      <Id value={snapshot.id} />
                    </div>
                  </td>
                  <td>
                    <Badge tone={snapshotSourceTone(snapshot.source)}>
                      {snapshotSourceLabel(snapshot.source)}
                    </Badge>
                  </td>
                  <td>
                    <div className="tabular" title={formatDateTime(snapshot.createdAt)}>
                      {formatRelative(snapshot.createdAt)}
                    </div>
                    <div className="sub-cell">{snapshotWindowLabel(snapshot)}</div>
                  </td>
                  <td className="numeric tabular">{formatNumber(snapshot.stats.requests)}</td>
                  <td className="numeric tabular">{formatNumber(snapshot.stats.spans)}</td>
                  <td className="numeric tabular">{formatNumber(snapshot.stats.errors)}</td>
                  <td className="numeric tabular">
                    {formatNumber(snapshot.stats.databaseQueries)}
                  </td>
                  <td className="numeric muted tabular">{formatBytes(snapshot.bytes)}</td>
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
                      {latest.label ?? latest.id}
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
