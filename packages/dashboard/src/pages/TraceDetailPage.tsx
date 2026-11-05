import { useMemo, useState } from 'react'
import type {
  StackNextDatabaseQuery,
  StackNextError,
  StackNextSpan,
  TraceDetail,
} from '@stacknext/core'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  Card,
  CopyButton,
  EmptyState,
  ErrorState,
  Loading,
  MethodBadge,
  PageHeader,
  PropertiesRail,
  StatCard,
  StatStrip,
  StatGridSkeleton,
  StatusCodeBadge,
  shortId,
} from '../components/ui'
import {
  DetailsTabs,
  DurationValue,
  isMissingRecordError,
  Notice,
  RawJsonCard,
  RefreshButton,
  RelativeTime,
  StackTrace,
  Unmeasured,
  useUrlParam,
} from '../components/details'
import { SpanDetail, SpanTimeline } from '../components/Timeline'
import { Icon } from '../components/Icon'
import {
  formatAbsolute,
  formatDuration,
  formatNumber,
  plural,
  sqlPreview,
} from '../format'
import {
  durationStats,
  groupQueriesByShape,
  queryTitle,
} from '../sql'

type Tab = 'timeline' | 'errors' | 'database' | 'raw'

const TABS: Tab[] = ['timeline', 'errors', 'database', 'raw']

function TraceQueryGroup({
  group,
  defaultOpen,
  onNavigate,
  databasePath,
}: {
  group: ReturnType<typeof groupQueriesByShape>[number]
  defaultOpen: boolean
  onNavigate: (path: string) => void
  databasePath: string
}): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen)
  const title = queryTitle(group.sql)
  const stats = durationStats(group.queries)
  const measured = group.queries.filter((query) => query.durationMs !== null)
  const totalMs = measured.reduce((total, query) => total + (query.durationMs ?? 0), 0)

  return (
    <section className="query-group">
      <button
        type="button"
        className="query-group__head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="collapsible__chevron" aria-hidden="true">
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
        </span>
        <span className="query-group__main">
          <span className="query-group__title">
            <span className="mono">{title.operation}</span>
            {title.table && (
              <>
                <span className="detail-meta__dot" aria-hidden="true">
                  ·
                </span>
                <span>{title.table}</span>
              </>
            )}
            <Badge tone="accent">{group.databaseSystem}</Badge>
          </span>
          <span className="query-group__sql" title={group.shape}>
            {sqlPreview(group.shape, 160)}
          </span>
          <span className="query-group__meta">
            <span>{plural(group.queries.length, 'execution')}</span>
            <span>
              total{' '}
              {measured.length === 0 ? (
                <Unmeasured />
              ) : (
                formatDuration(totalMs)
              )}
            </span>
            <span>
              median <DurationValue ms={stats.median} />
            </span>
            {stats.measured < group.queries.length && (
              <span>{plural(group.queries.length - stats.measured, 'missing duration')}</span>
            )}
          </span>
        </span>
        <span className="query-group__stats">
          <span>{plural(stats.measured, 'measured')}</span>
        </span>
      </button>
      {open && (
        <div className="query-group__body">
          <div className="stack stack--tight">
            <div className="execution-list">
              {group.queries.map((query) => (
                <div className="execution-row" key={query.id}>
                  <span className="execution-row__sql" title={query.id}>
                    {query.source} · {query.success ? 'success' : 'failed'}
                    {query.errorMessage ? ` · ${query.errorMessage}` : ''}
                  </span>
                  <span className="execution-row__duration">
                    <DurationValue ms={query.durationMs} />
                  </span>
                  <span className="execution-row__time">
                    <RelativeTime timestamp={query.timestamp} />
                  </span>
                </div>
              ))}
            </div>
            <div className="button-row">
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() => onNavigate(databasePath)}
              >
                Open database view <Icon name="arrow-right" size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function TraceDatabaseTab({
  queries,
  onNavigate,
  databasePath,
}: {
  queries: StackNextDatabaseQuery[]
  onNavigate: (path: string) => void
  databasePath: string
}): React.ReactElement {
  const groups = useMemo(() => groupQueriesByShape(queries), [queries])
  if (queries.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="database"
          title="No database queries in this trace"
          description="Queries appear when the Drizzle or Prisma adapter is enabled and the request executes SQL."
          action={
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={() => onNavigate('/settings')}
            >
              Adapter setup
            </button>
          }
        />
      </Card>
    )
  }
  return (
    <Card
      title="Database"
      subtitle="Executions are grouped by normalized SQL shape. Literals and bind values are removed."
      meta={<span className="tabular">{plural(groups.length, 'shape')}</span>}
      padded={false}
    >
      <div className="query-groups">
        {groups.map((group, index) => (
          <TraceQueryGroup
            key={`${group.databaseSystem}:${group.shapeId}`}
            group={group}
            defaultOpen={index === 0}
            onNavigate={onNavigate}
            databasePath={databasePath}
          />
        ))}
      </div>
    </Card>
  )
}

function ErrorCard({
  error,
  onNavigate,
  basePath,
}: {
  error: StackNextError
  onNavigate: (path: string) => void
  basePath: string
}): React.ReactElement {
  return (
    <article className="error-card">
      <header>
        <div>
          <div className="error-card__name">{error.name}</div>
          <div className="error-card__message">{error.message}</div>
        </div>
        <div className="button-row">
          {error.digest && <Badge tone="muted">digest {error.digest.slice(0, 16)}</Badge>}
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => onNavigate(`${basePath}/errors/${error.id}`)}
          >
            Open error <Icon name="arrow-right" size={13} />
          </button>
        </div>
      </header>
      <div className="error-card__meta">
        <span>{error.route ?? 'unknown route'}</span>
        <span>{error.method ?? '—'}</span>
        <RelativeTime timestamp={error.timestamp} />
        {error.routerKind && <span>{error.routerKind}</span>}
        {error.routeType && <span>{error.routeType}</span>}
      </div>
      <StackTrace
        stack={error.stack}
        emptyTitle="No stack captured for this error"
        emptyDescription="The error hook reported the error without a stack trace."
      />
    </article>
  )
}

export function TraceDetailPage({
  traceId,
  refreshKey,
  onNavigate,
  snapshotId,
}: {
  traceId: string
  refreshKey: number
  onNavigate: (path: string) => void
  snapshotId?: string
}): React.ReactElement {
  const state = useAsync<TraceDetail>(
    (signal) =>
      snapshotId
        ? api.snapshotTrace(snapshotId, traceId, signal)
        : api.trace(traceId, signal),
    `trace:${snapshotId ?? 'live'}:${traceId}`,
    refreshKey,
  )
  const basePath = snapshotId ? `/snapshots/${snapshotId}` : ''
  const [tabValue, setTab] = useUrlParam('tab', 'timeline')
  const [spanValue, setSpan] = useUrlParam('span', '')
  const tab: Tab = TABS.includes(tabValue as Tab) ? (tabValue as Tab) : 'timeline'

  const selectedSpan = useMemo<StackNextSpan | null>(() => {
    if (!state.data) return null
    if (spanValue) {
      const found = state.data.spans.find((span) => span.spanId === spanValue)
      if (found) return found
    }
    return (
      state.data.spans.find((span) => span.kind === 'server' && !span.parentSpanId) ??
      state.data.spans[0] ??
      null
    )
  }, [spanValue, state.data])

  const request = state.data?.request
  const back = {
    label: snapshotId ? 'Snapshot traces' : 'Traces',
    onClick: () => onNavigate(`${basePath}/traces`),
    trail: shortId(traceId),
  }

  if (state.loading && !state.data) {
    return (
      <>
        <PageHeader detail title="Trace" back={back} />
        <StatGridSkeleton count={4} />
        <Loading rows={8} label="Loading trace" />
      </>
    )
  }

  if (state.error && !state.data) {
    const missing = isMissingRecordError(state.error)
    return (
      <>
        <PageHeader detail title="Trace" back={back} />
        {missing ? (
          <Notice
            tone="muted"
            icon="traces"
            title={
              snapshotId
                ? 'This trace is not in the saved snapshot'
                : 'This trace is not in the current sample'
            }
            action={
              <div className="button-row">
                <button
                  type="button"
                  className="button button--secondary button--small"
                  onClick={() => onNavigate(`${basePath}/traces`)}
                >
                  Back to traces
                </button>
                <RefreshButton onClick={state.reload} loading={state.loading} />
              </div>
            }
          >
            {snapshotId
              ? 'The snapshot is immutable. If the trace was not saved with it, it cannot be reconstructed or guessed.'
              : 'The trace may have aged out of the retention window, or the collector restarted and cleared its in-memory store. Nothing is reconstructed or guessed.'}
          </Notice>
        ) : (
          <ErrorState message={state.error} onRetry={state.reload} />
        )}
      </>
    )
  }

  if (!state.data) return <Loading />

  const spans = state.data.spans
  const errors = state.data.errors
  const queries = state.data.databaseQueries
  const diagnostics = state.data.diagnostics
  const measuredQueries = queries.filter((query) => query.durationMs !== null).length
  const unmeasuredQueries = queries.length - measuredQueries
  const route = request?.route ?? request?.name ?? spans[0]?.name ?? 'Trace'

  return (
    <>
      <PageHeader
        detail
        back={back}
        eyebrow="Trace"
        title={
          <>
            <MethodBadge method={request?.method ?? null} />
            <span className="detail-title__text">{route}</span>
            <StatusCodeBadge
              code={request?.statusCode ?? null}
              failed={errors.length > 0}
            />
          </>
        }
        detailAside={
          <>
            {snapshotId && <Badge tone="accent">snapshot</Badge>}
            {request?.serviceName && <Badge tone="muted">{request.serviceName}</Badge>}
            {errors.length > 0 ? (
              <Badge tone="bad">{plural(errors.length, 'error')}</Badge>
            ) : (
              <Badge tone="good">no errors</Badge>
            )}
            {queries.length > 0 && (
              <Badge tone={unmeasuredQueries > 0 ? 'warn' : 'muted'}>
                {plural(queries.length, 'query', 'queries')}
              </Badge>
            )}
          </>
        }
        description={
          <>
            <span title={formatAbsolute(state.data.startTime)}>
              <RelativeTime timestamp={state.data.startTime} />
            </span>
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <span title="First span start to last span end; not a sum of span durations">
              window {formatDuration(state.data.durationMs)}
            </span>
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <span>{plural(spans.length, 'span')}</span>
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <span>{plural(errors.length, 'error')}</span>
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <span>{plural(queries.length, 'query', 'queries')}</span>
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <span className="mono" title={traceId}>
              {shortId(traceId)}
            </span>
          </>
        }
        actions={
          <>
            <CopyButton value={traceId} label="Copy trace id" primary />
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setTab('database')
                setSpan('')
              }}
            >
              <Icon name="database" size={15} />
              Queries
            </button>
            <RefreshButton onClick={state.reload} loading={state.loading} />
          </>
        }
      />

      <StatStrip five={diagnostics !== undefined}>
        <StatCard
          label="Window"
          value={<DurationValue ms={state.data.durationMs} />}
          hint="first start to last end"
        />
        <StatCard
          label="Spans"
          value={formatNumber(spans.length)}
          hint={`${formatNumber(new Set(spans.map((span) => span.kind)).size)} kinds`}
        />
        <StatCard
          label="Errors"
          value={formatNumber(errors.length)}
          hint={errors.length === 0 ? 'none captured' : 'open the errors tab'}
          tone={errors.length > 0 ? 'bad' : 'good'}
        />
        <StatCard
          label="Queries"
          value={formatNumber(queries.length)}
          hint={
            queries.length === 0
              ? 'no adapter events'
              : `${formatNumber(measuredQueries)} measured · ${formatNumber(unmeasuredQueries)} unmeasured`
          }
          tone={unmeasuredQueries > 0 ? 'warn' : 'default'}
        />
        {diagnostics !== undefined && (
          <StatCard
            label="Findings"
            value={formatNumber(diagnostics.length)}
            hint={
              diagnostics.length === 0
                ? 'no finding references this trace'
                : 'deterministic evidence, not a verdict'
            }
            tone={diagnostics.length > 0 ? 'warn' : 'default'}
          />
        )}
      </StatStrip>

      {state.data.warnings.length > 0 && (
        <Notice tone="warn" icon="errors" title="Evidence warnings">
          <ul>
            {state.data.warnings.map((warning, index) => (
              <li key={`${warning.code}:${warning.spanId ?? index}`}>
                <strong>{warning.code}</strong> {warning.message}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <DetailsTabs
        label="Trace sections"
        value={tab}
        onChange={(value) => setTab(value)}
        tabs={[
          { key: 'timeline', label: 'Timeline', count: spans.length },
          { key: 'errors', label: 'Errors', count: errors.length },
          { key: 'database', label: 'Database', count: queries.length },
          { key: 'raw', label: 'Raw' },
        ]}
      />

      {tab === 'timeline' && (
        <div className="trace-layout">
          <Card padded={false}>
            <SpanTimeline
              spans={spans}
              selectedSpanId={selectedSpan?.spanId ?? null}
              onSelect={(spanId) => setSpan(spanId)}
            />
          </Card>
          <PropertiesRail>
            {selectedSpan ? (
              <SpanDetail
                span={selectedSpan}
                traceStart={state.data.startTime}
                parentInTrace={
                  selectedSpan.parentSpanId !== undefined &&
                  spans.some((span) => span.spanId === selectedSpan.parentSpanId)
                }
                onSelectSpan={(spanId) => setSpan(spanId)}
              />
            ) : (
              <EmptyState
                compact
                icon="layers"
                title="Select a span"
                description="Choose any span in the timeline to inspect its identity, timing and attributes."
              />
            )}
          </PropertiesRail>
        </div>
      )}

      {tab === 'errors' && (
        <div className="stack">
          {errors.length === 0 ? (
            <Card>
              <EmptyState
                icon="shield"
                title="No errors in this trace"
                description="Errors reported through onRequestError are correlated by trace id and timestamp."
              />
            </Card>
          ) : (
            errors.map((error) => (
              <ErrorCard
                key={error.id}
                error={error}
                onNavigate={onNavigate}
                basePath={basePath}
              />
            ))
          )}
        </div>
      )}

      {tab === 'database' && (
        <TraceDatabaseTab
          queries={queries}
          onNavigate={onNavigate}
          databasePath={snapshotId ? `${basePath}/database` : '/database'}
        />
      )}

      {tab === 'raw' && (
        <RawJsonCard
          title="Raw trace payload"
          description={
            snapshotId
              ? 'The read-only detail stored in this snapshot. Snapshots never contain live diagnostics.'
              : 'The same read-only detail returned by the collector, including warnings and diagnostics references.'
          }
          value={state.data}
          filename={`trace-${traceId}.json`}
        />
      )}
    </>
  )
}
