import { useMemo } from 'react'
import type { ErrorDetailResponse, ErrorListResponse } from '@stacknext/core'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  Card,
  CopyButton,
  EmptyState,
  ErrorState,
  KeyValue,
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
  CollapsibleCard,
  DurationValue,
  isMissingRecordError,
  Notice,
  RefreshButton,
  RelativeTime,
  StackTrace,
} from '../components/details'
import { Icon } from '../components/Icon'
import {
  formatAbsolute,
  formatDateTime,
  formatNumber,
  plural,
} from '../format'

export function ErrorDetailPage({
  errorId,
  refreshKey,
  onNavigate,
  snapshotId,
}: {
  errorId: string
  refreshKey: number
  onNavigate: (path: string) => void
  snapshotId?: string
}): React.ReactElement {
  const state = useAsync<ErrorDetailResponse>(
    (signal) =>
      snapshotId
        ? api.snapshotError(snapshotId, errorId, signal)
        : api.error(errorId, signal),
    `error:${snapshotId ?? 'live'}:${errorId}`,
    refreshKey,
  )
  const sample = useAsync<ErrorListResponse>(
    (signal) =>
      snapshotId
        ? api.snapshotErrors(snapshotId, { limit: 200 }, signal)
        : api.errors({ limit: 200 }, signal),
    `error-sample:${snapshotId ?? 'live'}:${errorId}`,
    refreshKey,
  )
  const basePath = snapshotId ? `/snapshots/${snapshotId}` : ''

  const error = state.data?.error
  const group = useMemo(
    () =>
      error
        ? sample.data?.groups.find((item) => item.fingerprint === error.fingerprint)
        : undefined,
    [error, sample.data],
  )
  const occurrences = useMemo(
    () =>
      error
        ? (sample.data?.items ?? []).filter(
            (item) => item.fingerprint === error.fingerprint,
          )
        : [],
    [error, sample.data],
  )

  const back = {
    label: snapshotId ? 'Snapshot errors' : 'Errors',
    onClick: () => onNavigate(`${basePath}/errors`),
    trail: shortId(errorId),
  }

  if (state.loading && !state.data) {
    return (
      <>
        <PageHeader detail title="Error" back={back} />
        <StatGridSkeleton count={5} five />
        <Loading rows={7} label="Loading error" />
      </>
    )
  }

  if (state.error && !state.data) {
    const missing = isMissingRecordError(state.error)
    return (
      <>
        <PageHeader detail title="Error" back={back} />
        {missing ? (
          <Notice
            tone="muted"
            icon="errors"
            title={
              snapshotId
                ? 'This error is not in the saved snapshot'
                : 'This error is not in the current sample'
            }
            action={
              <div className="button-row">
                <button
                  type="button"
                  className="button button--secondary button--small"
                  onClick={() => onNavigate(`${basePath}/errors`)}
                >
                  Back to errors
                </button>
                <RefreshButton onClick={() => { state.reload(); sample.reload() }} loading={state.loading} />
              </div>
            }
          >
            {snapshotId
              ? 'The snapshot is immutable. If the error was not saved with it, it cannot be reconstructed or guessed.'
              : 'The error may have aged out of retention, or the collector restarted and cleared its in-memory store. Nothing is reconstructed or guessed.'}
          </Notice>
        ) : (
          <ErrorState message={state.error} onRetry={state.reload} />
        )}
      </>
    )
  }

  if (!state.data || !error) return <Loading />

  const trace = state.data.trace
  const linkedTraceId = trace?.traceId ?? error.traceId ?? null

  return (
    <>
      <PageHeader
        detail
        back={back}
        eyebrow="Error"
        title={<span className="detail-title__text">{error.name}</span>}
        detailAside={
          <>
            {snapshotId && <Badge tone="accent">snapshot</Badge>}
            <Badge tone="bad">error</Badge>
            {error.route && <Badge tone="muted">{error.route}</Badge>}
            {error.method && <Badge tone="muted">{error.method}</Badge>}
          </>
        }
        description={
          <>
            <span title={formatAbsolute(error.timestamp)}>
              <RelativeTime timestamp={error.timestamp} />
            </span>
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <span>{error.route ?? 'unknown route'}</span>
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <span>{error.method ?? 'no method'}</span>
            {error.routerKind && (
              <>
                <span className="detail-meta__dot" aria-hidden="true">
                  ·
                </span>
                <span>{error.routerKind}</span>
              </>
            )}
            {error.routeType && (
              <>
                <span className="detail-meta__dot" aria-hidden="true">
                  ·
                </span>
                <span>{error.routeType}</span>
              </>
            )}
            <span className="detail-meta__dot" aria-hidden="true">
              ·
            </span>
            <span className="mono" title={error.fingerprint}>
              {shortId(error.fingerprint)}
            </span>
          </>
        }
        actions={
          <>
            <CopyButton value={error.id} label="Copy error id" primary />
            {linkedTraceId && (
              <button
                type="button"
                className="button button--secondary"
                onClick={() => onNavigate(`${basePath}/traces/${linkedTraceId}`)}
              >
                <Icon name="traces" size={15} />
                Open trace
              </button>
            )}
            <RefreshButton onClick={() => { state.reload(); sample.reload() }} loading={state.loading} />
          </>
        }
      />

      <StatStrip five>
        <StatCard
          label="Occurrences"
          value={formatNumber(group?.count ?? occurrences.length)}
          hint={
            group
              ? 'grouped by fingerprint in the current sample'
              : 'count unavailable in this sample'
          }
          tone={(group?.count ?? 0) > 1 ? 'warn' : 'default'}
        />
        <StatCard
          label="First seen"
          value={<RelativeTime timestamp={group?.firstSeen ?? error.timestamp} />}
          hint={
            group
              ? formatDateTime(group.firstSeen)
              : 'first occurrence not in the current sample'
          }
        />
        <StatCard
          label="Last seen"
          value={<RelativeTime timestamp={group?.lastSeen ?? error.timestamp} />}
          hint={
            group
              ? formatDateTime(group.lastSeen)
              : 'last occurrence not in the current sample'
          }
        />
        <StatCard
          label="Trace"
          value={linkedTraceId ? 'linked' : 'not linked'}
          hint={linkedTraceId ? shortId(linkedTraceId) : 'no matching trace context'}
          tone={linkedTraceId ? 'good' : 'warn'}
        />
        <StatCard
          label="Fingerprint"
          value={<span className="mono">{shortId(error.fingerprint)}</span>}
          hint="stable error signature"
        />
      </StatStrip>

      <div className="layout">
        <div className="layout__main">
          <Card
            title="Correlated trace"
            subtitle="Matched by OpenTelemetry trace context, or by route and time as a fallback."
            actions={
              linkedTraceId ? (
                <Badge tone={trace ? 'good' : 'warn'}>
                  {trace ? 'trace loaded' : 'id only'}
                </Badge>
              ) : (
                <Badge tone="warn">no trace</Badge>
              )
            }
          >
            {trace ? (
              <div className="trace-summary">
                <div className="trace-summary__main">
                  <MethodBadge method={trace.request?.method ?? null} />
                  <div>
                    <div className="route-cell">
                      {trace.request?.route ?? trace.request?.name ?? 'Trace'}
                    </div>
                    <div className="sub-cell">
                      <RelativeTime timestamp={trace.startTime} /> ·{' '}
                      <DurationValue ms={trace.durationMs} />
                    </div>
                  </div>
                  <StatusCodeBadge
                    code={trace.request?.statusCode ?? null}
                    failed={trace.errors.length > 0}
                  />
                </div>
                <div className="trace-summary__stats">
                  <span>{plural(trace.spans.length, 'span')}</span>
                  <span>{plural(trace.errors.length, 'error')}</span>
                  <span>{plural(trace.databaseQueries.length, 'query', 'queries')}</span>
                </div>
                <div className="correlation-note">
                  <span className="mono" title={trace.traceId}>
                    {trace.traceId}
                  </span>
                  <CopyButton value={trace.traceId} label="Copy trace id" small />
                </div>
                <div className="button-row">
                  <button
                    type="button"
                    className="button button--primary button--small"
                    onClick={() => onNavigate(`${basePath}/traces/${trace.traceId}`)}
                  >
                    Open timeline <Icon name="arrow-right" size={14} />
                  </button>
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    onClick={() => onNavigate(`${basePath}/traces/${trace.traceId}?tab=database`)}
                  >
                    <Icon name="database" size={14} />
                    View queries ({formatNumber(trace.databaseQueries.length)})
                  </button>
                  {!snapshotId &&
                    trace.diagnostics !== undefined &&
                    trace.diagnostics.length > 0 && (
                    <button
                      type="button"
                      className="button button--secondary button--small"
                      onClick={() =>
                        onNavigate(`/diagnostics?traceId=${trace.traceId}`)
                      }
                    >
                      Findings ({formatNumber(trace.diagnostics.length)})
                    </button>
                  )}
                </div>
              </div>
            ) : linkedTraceId ? (
              <div className="stack">
                <p className="muted">
                  The error references trace{' '}
                  <span className="mono">{linkedTraceId}</span>, but the trace is
                  no longer in the current sample. The link is kept as evidence
                  rather than replaced with a time-window guess.
                </p>
                <div className="button-row">
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    onClick={() => onNavigate(`${basePath}/traces/${linkedTraceId}`)}
                  >
                    Try the trace view
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState
                compact
                icon="traces"
                title="No trace linked"
                description="The error happened outside a captured request, or the trace has aged out of retention. Correlation never falls back to a nearest request."
              />
            )}
          </Card>

          <Card
            title="Message"
            subtitle="Redacted text reported by the Next.js error hook."
            actions={
              error.digest ? (
                <Badge tone="muted">digest {error.digest.slice(0, 20)}</Badge>
              ) : undefined
            }
          >
            <p className="error-detail__message">{error.message}</p>
            <div className="correlation-note">
              <span>
                reported <RelativeTime timestamp={error.timestamp} />
              </span>
              <span>·</span>
              <span>{formatDateTime(error.timestamp)}</span>
            </div>
          </Card>

          <Card
            title="Stack trace"
            subtitle={
              error.stack
                ? 'Redacted server stack. Filtering and wrapping are display-only; copy uses the original text.'
                : 'No stack was captured for this error.'
            }
            actions={
              error.stack ? <Badge tone="muted">redacted</Badge> : undefined
            }
          >
            <StackTrace
              stack={error.stack}
              emptyTitle="No stack available"
              emptyDescription="The error was reported without a stack trace. The message and trace evidence above are still usable."
            />
          </Card>

          <Card
            title="Recent occurrences"
            subtitle="Matching errors from the latest 200 stored records. This is a sample, not a lifetime count."
            meta={
              <span className="tabular">
                {formatNumber(Math.min(occurrences.length, 8))} shown · {formatNumber(group?.count ?? occurrences.length)} total
              </span>
            }
          >
            {occurrences.length === 0 ? (
              <p className="muted">
                No other occurrence of this fingerprint is in the current sample.
              </p>
            ) : (
              <div className="stack stack--tight">
                {occurrences.slice(0, 8).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="list-row list-row--no-leading"
                    onClick={() => onNavigate(`${basePath}/errors/${item.id}`)}
                    aria-label={`Open error occurrence from ${formatDateTime(item.timestamp)}`}
                    title={item.message}
                  >
                    <span className="list-row__text">
                      <span className="list-row__primary">
                        {item.route ?? 'unknown route'} · {item.method ?? 'no method'}
                      </span>
                      <span className="list-row__secondary">
                        {item.message}
                      </span>
                    </span>
                    <span className="list-row__meta">
                      <RelativeTime timestamp={item.timestamp} />
                    </span>
                    <span className="list-row__chevron" aria-hidden="true">
                      <Icon name="chevron-right" size={14} />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <CollapsibleCard
            title="Attributes"
            description="Redacted metadata attached to this error."
            meta={<span className="tabular">{Object.keys(error.attributes).length}</span>}
            storageKey="error:attributes"
          >
            {Object.keys(error.attributes).length === 0 ? (
              <p className="muted">No attributes were captured.</p>
            ) : (
              <pre className="json-view" style={{ maxHeight: 320 }}>
                {JSON.stringify(error.attributes, null, 2)}
              </pre>
            )}
          </CollapsibleCard>
        </div>

        <PropertiesRail>
          <Card title="Details">
            <KeyValue
              entries={[
                { label: 'Name', value: error.name },
                {
                  label: 'Route',
                  value: <span className="mono">{error.route ?? '—'}</span>,
                  emptyReason: 'No route was attached to this error.',
                },
                {
                  label: 'Method',
                  value: error.method ?? null,
                  emptyReason: 'No HTTP method was attached to this error.',
                },
                {
                  label: 'Router',
                  value: error.routerKind ?? null,
                  emptyReason: 'Next.js did not report a router kind.',
                },
                {
                  label: 'Route type',
                  value: error.routeType ?? null,
                  emptyReason: 'Next.js did not report a route type.',
                },
                {
                  label: 'Render source',
                  value: error.renderSource ?? null,
                  emptyReason: 'Next.js did not report a render source.',
                },
                {
                  label: 'Digest',
                  value: error.digest ? (
                    <span className="mono">{error.digest}</span>
                  ) : null,
                  emptyReason: 'No React error digest was attached.',
                },
                {
                  label: 'Error ID',
                  value: <span className="mono">{error.id}</span>,
                  copyValue: error.id,
                },
                {
                  label: 'Trace ID',
                  value: linkedTraceId ? (
                    <span className="mono">{linkedTraceId}</span>
                  ) : null,
                  copyValue: linkedTraceId ?? undefined,
                  emptyReason: 'This error was not correlated to a trace.',
                },
                {
                  label: 'Span ID',
                  value: error.spanId ? (
                    <span className="mono">{error.spanId}</span>
                  ) : null,
                  emptyReason: 'No span id was attached to this error.',
                },
                {
                  label: 'Seen',
                  value: <RelativeTime timestamp={error.timestamp} />,
                },
              ]}
            />
          </Card>

          <Card title="Fingerprint" subtitle="Repeated errors are grouped by this hash">
            <div className="stack">
              <div className="fingerprint">
                <code>{error.fingerprint}</code>
                <CopyButton value={error.fingerprint} label="Copy fingerprint" small />
              </div>
              <div className="badge-row">
                <Badge tone="bad">counted</Badge>
                <Badge tone="muted">read-only</Badge>
              </div>
              <p className="muted">
                Grouping is a deterministic heuristic. It does not establish a
                root cause and does not merge different stack signatures.
              </p>
            </div>
          </Card>

          <Card title="Limitations" subtitle="What this view cannot prove">
            <ul className="notes-list">
              <li>
                Occurrence counts and first/last times come from the current
                in-memory sample, not a lifetime database.
              </li>
              <li>
                Stacks are redacted before storage. Source lines are not available
                and this view never reads project files.
              </li>
              <li>
                Trace correlation prefers OpenTelemetry context and may fall back
                to route and time; a missing trace is left missing.
              </li>
              <li>
                The error message is evidence, not a confirmed cause. Verify it
                against a fresh trace and the calling code.
              </li>
            </ul>
          </Card>
        </PropertiesRail>
      </div>
    </>
  )
}
