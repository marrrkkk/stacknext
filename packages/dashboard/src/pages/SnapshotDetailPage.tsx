import { useState } from 'react'
import type { SnapshotDetailResponse } from '@stacknext/core'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  Banner,
  Card,
  CopyButton,
  EmptyState,
  KeyValue,
  ListRow,
  Loading,
  MethodBadge,
  PageHeader,
  PropertiesRail,
  StatCard,
  StatGridSkeleton,
  StatStrip,
  shortId,
} from '../components/ui'
import { DurationValue, Notice, RefreshButton } from '../components/details'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelative,
  plural,
  sqlPreview,
} from '../format'
import { snapshotSourceLabel, snapshotSourceTone, snapshotWindowLabel } from './SnapshotsPage'

export function SnapshotDetailPage({
  snapshotId,
  refreshKey,
  onNavigate,
}: {
  snapshotId: string
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const state = useAsync<SnapshotDetailResponse>(
    (signal) => api.snapshot(snapshotId, signal),
    `snapshot:${snapshotId}`,
    refreshKey,
  )
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const back = {
    label: 'Snapshots',
    onClick: () => onNavigate('/snapshots'),
    trail: shortId(snapshotId),
  }

  const remove = async (): Promise<void> => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.deleteSnapshot(snapshotId)
      onNavigate('/snapshots')
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error))
      setDeleting(false)
    }
  }

  const cancelDelete = (): void => {
    if (deleting) return
    setConfirmOpen(false)
    setDeleteError(null)
  }

  if (state.loading && !state.data) {
    return (
      <>
        <PageHeader detail title="Snapshot" back={back} />
        <StatGridSkeleton count={5} five />
        <Loading rows={8} label="Loading snapshot" />
      </>
    )
  }

  if (state.error && !state.data) {
    return (
      <>
        <PageHeader detail title="Snapshot" back={back} />
        <Notice
          tone="muted"
          icon="layers"
          title="This snapshot could not be read"
          action={
            <div className="button-row">
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() => onNavigate('/snapshots')}
              >
                Back to snapshots
              </button>
              <RefreshButton onClick={state.reload} loading={state.loading} />
            </div>
          }
        >
          {state.error} Invalid or incomplete snapshot files are left on disk rather than repaired
          or deleted automatically.
        </Notice>
      </>
    )
  }

  if (!state.data) return <Loading />

  const { snapshot, config, limitations, traces, errors, databaseQueries } = state.data
  const basePath = `/snapshots/${snapshot.id}`
  const openTrace = (traceId: string): void => onNavigate(`${basePath}/traces/${traceId}`)

  return (
    <>
      <PageHeader
        detail
        back={back}
        eyebrow={`Snapshot · ${snapshotSourceLabel(snapshot.source)}`}
        title={<span className="detail-title__text">{snapshot.label ?? 'Saved sample'}</span>}
        detailAside={
          <>
            <Badge tone={snapshotSourceTone(snapshot.source)}>
              {snapshotSourceLabel(snapshot.source)}
            </Badge>
            <Badge tone="accent">frozen</Badge>
            <Badge tone="muted">read-only</Badge>
          </>
        }
        description={
          <>
            <span title={formatDateTime(snapshot.createdAt)}>
              saved {formatRelative(snapshot.createdAt)}
            </span>
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <span>{snapshotWindowLabel(snapshot)}</span>
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <span>{formatBytes(snapshot.bytes)}</span>
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <span className="mono" title={snapshot.id}>
              {shortId(snapshot.id)}
            </span>
          </>
        }
        actions={
          <>
            <a
              className="button button--secondary"
              href={api.snapshotExportUrl(snapshot.id)}
              download
            >
              <Icon name="download" size={15} /> Export
            </a>
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                setDeleteError(null)
                setConfirmOpen(true)
              }}
              disabled={deleting}
            >
              <Icon name="close" size={15} /> {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <RefreshButton onClick={state.reload} loading={state.loading} />
          </>
        }
      />

      <Banner tone="accent" icon="layers" title="Frozen snapshot">
        This page reads a saved, redacted copy of one collector sample. It is not live telemetry,
        it is never replayed into the store, and it has no diagnostics or coverage report. Data
        captured after the snapshot does not appear here.
      </Banner>

      <StatStrip five>
        <StatCard
          label="Requests"
          value={formatNumber(snapshot.stats.requests)}
          hint="Request-root traces"
        />
        <StatCard
          label="Spans"
          value={formatNumber(snapshot.stats.spans)}
          hint="Full stored span tree"
        />
        <StatCard
          label="Errors"
          value={formatNumber(snapshot.stats.errors)}
          hint={snapshot.stats.errors > 0 ? 'Inspect saved errors' : 'none captured'}
          tone={snapshot.stats.errors > 0 ? 'bad' : 'good'}
        />
        <StatCard
          label="Queries"
          value={formatNumber(snapshot.stats.databaseQueries)}
          hint="Redacted adapter events"
        />
        <StatCard
          label="Snapshot size"
          value={formatBytes(snapshot.bytes)}
          hint={`limit ${formatBytes(config.snapshots.maxBytes)}`}
        />
      </StatStrip>

      <div className="layout">
        <div className="layout__main">
          <Card
            title="Traces"
            subtitle="The first traces stored in this snapshot. Open one for the full read-only timeline."
            meta={<span className="tabular">{plural(traces.length, 'shown')}</span>}
            actions={
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() => onNavigate(`${basePath}/traces`)}
              >
                Browse all traces <Icon name="arrow-right" size={13} />
              </button>
            }
          >
            {traces.length === 0 ? (
              <EmptyState
                compact
                icon="traces"
                title="No traces in this snapshot"
                description="The sample contained no spans when it was saved."
              />
            ) : (
              <div className="stack stack--tight">
                {traces.slice(0, 10).map((trace) => {
                  const request = trace.request
                  return (
                    <ListRow
                      key={trace.traceId}
                      leading={<MethodBadge method={request?.method} />}
                      primary={request?.route ?? trace.rootName}
                      secondary={
                        <>
                          {formatRelative(trace.startTime)} ·{' '}
                          {plural(trace.spanCount, 'span')} ·{' '}
                          {plural(trace.errorCount, 'error')} ·{' '}
                          {plural(trace.databaseQueryCount, 'query', 'queries')}
                        </>
                      }
                      meta={<DurationValue ms={trace.durationMs} />}
                      onClick={() => openTrace(trace.traceId)}
                      ariaLabel={`Open trace ${request?.route ?? trace.rootName}`}
                    />
                  )
                })}
              </div>
            )}
          </Card>

          <Card
            title="Errors"
            subtitle="The first errors stored in this snapshot, grouped by fingerprint in the list view."
            meta={<span className="tabular">{plural(errors.length, 'shown')}</span>}
            actions={
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() => onNavigate(`${basePath}/errors`)}
              >
                Browse all errors <Icon name="arrow-right" size={13} />
              </button>
            }
          >
            {errors.length === 0 ? (
              <EmptyState
                compact
                icon="shield"
                title="No errors in this snapshot"
                description="The saved sample contained no server errors."
              />
            ) : (
              <div className="stack stack--tight">
                {errors.slice(0, 10).map((error) => (
                  <ListRow
                    key={error.id}
                    primary={error.name}
                    secondary={
                      <>
                        {error.message} · {error.route ?? 'unknown route'}
                      </>
                    }
                    meta={<span>{formatRelative(error.timestamp)}</span>}
                    onClick={() => onNavigate(`${basePath}/errors/${error.id}`)}
                    ariaLabel={`Open error ${error.name}`}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Database queries"
            subtitle="Redacted SQL stored in this snapshot. Query-shape detail is only available live."
            meta={<span className="tabular">{plural(databaseQueries.length, 'shown')}</span>}
            actions={
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() => onNavigate(`${basePath}/database`)}
              >
                Browse all queries <Icon name="arrow-right" size={13} />
              </button>
            }
          >
            {databaseQueries.length === 0 ? (
              <EmptyState
                compact
                icon="database"
                title="No database queries in this snapshot"
                description="The sample contained no adapter query events."
              />
            ) : (
              <div className="stack stack--tight">
                {databaseQueries.slice(0, 10).map((query) => (
                  <ListRow
                    key={query.id}
                    primary={<span className="mono">{sqlPreview(query.sql, 110)}</span>}
                    secondary={
                      <>
                        {query.databaseSystem} · {query.route ?? 'uncorrelated'} ·{' '}
                        {formatRelative(query.timestamp)}
                      </>
                    }
                    meta={<DurationValue ms={query.durationMs} />}
                    onClick={
                      query.resolvedTraceId
                        ? () => openTrace(query.resolvedTraceId as string)
                        : undefined
                    }
                    ariaLabel="Open the linked trace"
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        <PropertiesRail>
          <Card title="Capture details">
            <KeyValue
              entries={[
                {
                  label: 'Snapshot ID',
                  value: <span className="mono">{snapshot.id}</span>,
                  copyValue: snapshot.id,
                },
                {
                  label: 'Saved',
                  value: (
                    <>
                      {formatRelative(snapshot.createdAt)}
                      <span className="muted"> · {formatDateTime(snapshot.createdAt)}</span>
                    </>
                  ),
                },
                { label: 'Source', value: snapshotSourceLabel(snapshot.source) },
                { label: 'Project', value: snapshot.projectName },
                { label: 'Collector', value: snapshot.collectorVersion },
                { label: 'Sample window', value: snapshotWindowLabel(snapshot) },
                {
                  label: 'Retention at capture',
                  value: formatDuration(snapshot.sample.retentionMs),
                },
                { label: 'File size', value: formatBytes(snapshot.bytes) },
              ]}
            />
            <div className="button-row">
              <CopyButton value={snapshot.id} label="Copy snapshot id" small />
            </div>
          </Card>

          <Card title="Captured configuration" subtitle="Settings used when this sample was saved">
            <KeyValue
              entries={[
                {
                  label: 'Live retention',
                  value: formatDuration(config.collector.retentionMs),
                },
                { label: 'Max spans', value: formatNumber(config.collector.maxSpans) },
                { label: 'Slow threshold', value: formatDuration(config.slowRequestMs) },
                {
                  label: 'Auto-save on exit',
                  value: config.snapshots.autoOnExit ? 'enabled' : 'disabled',
                },
                {
                  label: 'Auto-save on error',
                  value: config.snapshots.autoOnError ? 'enabled' : 'disabled',
                },
                {
                  label: 'Automatic keep',
                  value: `${formatNumber(config.snapshots.autoKeep)} snapshots`,
                },
                {
                  label: 'Snapshot cap',
                  value: formatBytes(config.snapshots.maxBytes),
                },
              ]}
            />
          </Card>

          <Card title="Limitations" subtitle="What this snapshot cannot prove">
            <ul className="notes-list">
              {limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </Card>
        </PropertiesRail>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete snapshot?"
        description={
          <>
            Permanently removes <strong>{snapshot.label ?? 'this saved sample'}</strong> from
            local snapshots. This cannot be undone.
          </>
        }
        details={<span className="mono">{snapshot.id}</span>}
        confirmLabel="Delete"
        busyLabel="Deleting…"
        busy={deleting}
        error={deleteError}
        onConfirm={() => void remove()}
        onCancel={cancelDelete}
      />
    </>
  )
}
