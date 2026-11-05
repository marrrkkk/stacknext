import { useMemo } from 'react'
import type { DatabaseQueryListItem, DiagnosticListResponse } from '@stacknext/core'
import type { ComparisonMetricRef } from '../api'
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
  PageHeader,
  PropertiesRail,
  Select,
  StatCard,
  StatStrip,
  StatGridSkeleton,
  shortId,
  type Tone,
} from '../components/ui'
import {
  CollapsibleCard,
  DurationValue,
  Notice,
  RefreshButton,
  RelativeTime,
  SqlBlock,
  Unmeasured,
  useUrlParam,
} from '../components/details'
import { Icon } from '../components/Icon'
import {
  formatDuration,
  formatNumber,
  plural,
} from '../format'
import {
  durationStats,
  groupQueriesByTrace,
  normalizeSql,
  queryShapeSummary,
  queryTitle,
} from '../sql'
import {
  REGRESSION_SEVERITY_TONE,
  REGRESSION_STATUS_TONE,
  formatMetricDelta,
  formatMetricValue,
} from './RegressionScenarios'

const EXECUTION_PAGE = 50

interface ShapeExtras {
  diagnostics: DiagnosticListResponse | null
  comparisons: ComparisonMetricRef[]
}

const EMPTY_EXTRAS: ShapeExtras = { diagnostics: null, comparisons: [] }

function routeKey(route: string | null): string {
  return route ?? '__uncorrelated__'
}

function routeLabel(route: string | null): string {
  return route ?? 'Uncorrelated'
}

function findingTone(severity: 'info' | 'warning' | 'error'): Tone {
  return severity === 'error' ? 'bad' : severity === 'warning' ? 'warn' : 'accent'
}

export function DatabaseQueryDetailPage({
  shapeId,
  refreshKey,
  onNavigate,
}: {
  shapeId: string
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const [route, setRoute] = useUrlParam('route', '')
  const state = useAsync(
    (signal) => api.databaseShape(shapeId, signal),
    `database-shape:${shapeId}`,
    refreshKey,
  )

  const loadedKey = state.data ? `${shapeId}:${state.data.items.length}` : 'idle'
  const extras = useAsync<ShapeExtras>(
    async (signal) => {
      const items = state.data?.items ?? []
      if (items.length === 0) return EMPTY_EXTRAS
      const traceIds = items
        .map((item) => item.resolvedTraceId)
        .filter((value): value is string => Boolean(value))
      const [diagnostics, comparisons] = await Promise.all([
        traceIds.length > 0 ? api.diagnosticsForTraces(traceIds, signal) : null,
        api.recentComparisonMetrics(4, signal).catch((error: unknown) => {
          if (signal.aborted) throw error
          return []
        }),
      ])
      return { diagnostics, comparisons }
    },
    `database-shape-extras:${loadedKey}`,
    refreshKey,
  )

  const items = useMemo(() => state.data?.items ?? [], [state.data?.items])
  const shapeSql = items[0]?.sql ?? ''
  const title = useMemo(() => queryTitle(shapeSql), [shapeSql])
  const routes = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of items) {
      const key = routeKey(item.route)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()].sort((left, right) => right[1] - left[1])
  }, [items])
  const filtered = useMemo(
    () =>
      route
        ? items.filter((item) => routeKey(item.route) === route)
        : items,
    [items, route],
  )
  const summary = useMemo(() => queryShapeSummary(items), [items])
  const stats = useMemo(() => durationStats(items), [items])
  const groups = useMemo(() => groupQueriesByTrace(filtered), [filtered])
  const visibleGroups = useMemo(() => {
    let remaining = EXECUTION_PAGE
    const result: Array<{ group: (typeof groups)[number]; queries: DatabaseQueryListItem[] }> = []
    for (const group of groups) {
      if (remaining <= 0) break
      const queries = group.queries.slice(0, remaining)
      result.push({ group, queries })
      remaining -= queries.length
    }
    return result
  }, [groups])
  const [showAll, setShowAll] = useUrlParam('rows', '')
  const expanded = showAll === 'all'
  const visibleGroupsFinal = useMemo(() => {
    if (expanded) return groups.map((group) => ({ group, queries: group.queries }))
    return visibleGroups
  }, [expanded, groups, visibleGroups])
  const shownExecutions = visibleGroupsFinal.reduce(
    (total, entry) => total + entry.queries.length,
    0,
  )

  const relatedFindings = useMemo(() => {
    const traceIds = new Set(
      items
        .map((item) => item.resolvedTraceId)
        .filter((value): value is string => Boolean(value)),
    )
    const normalized = normalizeSql(shapeSql)
    return (extras.data?.diagnostics?.items ?? []).filter(
      (finding) =>
        finding.traceIds.some((traceId) => traceIds.has(traceId)) ||
        finding.evidence.queries.some(
          (query) => query.sqlFingerprint === normalized,
        ),
    )
  }, [extras.data?.diagnostics?.items, items, shapeSql])
  const normalizedShape = useMemo(() => normalizeSql(shapeSql), [shapeSql])
  const relatedComparisons = (extras.data?.comparisons ?? []).filter((ref) =>
    ref.metric.queryFingerprint === normalizedShape,
  )

  const back = {
    label: 'Database',
    onClick: () => onNavigate('/database'),
    trail: shortId(shapeId),
  }

  if (state.loading && !state.data) {
    return (
      <>
        <PageHeader detail title="Query shape" back={back} />
        <StatGridSkeleton count={5} five />
        <Loading rows={6} label="Loading query shape" />
      </>
    )
  }

  if (state.error && !state.data) {
    return (
      <>
        <PageHeader detail title="Query shape" back={back} />
        <ErrorState message={state.error} onRetry={state.reload} />
      </>
    )
  }

  if (!state.data) return <Loading />

  if (items.length === 0) {
    return (
      <>
        <PageHeader
          detail
          title={
            <>
              Query shape <span className="mono">{shortId(shapeId)}</span>
            </>
          }
          back={back}
          eyebrow="Database"
        />
        <Notice
          tone="muted"
          icon="database"
          title="This query shape is not in the current sample"
          action={
            <div className="button-row">
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() => onNavigate('/database')}
              >
                Back to database
              </button>
              <RefreshButton onClick={state.reload} loading={state.loading} />
            </div>
          }
        >
          The shape may have aged out of the retention window or the query may use
          literals that normalize to a different identity. Nothing is repaired or
          guessed; open the database list to inspect the current sample.
        </Notice>
      </>
    )
  }

  const headerTitle = title.table ? (
    <>
      <span className="mono">{title.operation}</span>
      <span className="detail-meta__dot" aria-hidden="true">
        ·
      </span>
      <span className="detail-title__text">{title.table}</span>
    </>
  ) : (
    <>
      <span className="detail-title__text">Query shape</span>
      <span className="mono muted">{shortId(shapeId)}</span>
    </>
  )

  const meta = (
    <>
      <span>{plural(summary.executions, 'execution')}</span>
      <span className="detail-meta__dot" aria-hidden="true">
        ·
      </span>
      <span>{plural(summary.traces, 'trace')}</span>
      <span className="detail-meta__dot" aria-hidden="true">
        ·
      </span>
      <span>{plural(summary.routes, 'route')}</span>
      <span className="detail-meta__dot" aria-hidden="true">
        ·
      </span>
      <span>
        first seen <RelativeTime timestamp={summary.firstSeen} />
      </span>
      <span className="detail-meta__dot" aria-hidden="true">
        ·
      </span>
      <span>
        last seen <RelativeTime timestamp={summary.lastSeen} />
      </span>
    </>
  )

  const p95Hint =
    stats.p95 !== null
      ? `p95 ${formatDuration(stats.p95)} · measured only`
      : `${formatNumber(stats.measured)} measured · p95 needs 20`

  return (
    <>
      <PageHeader
        detail
        back={back}
        eyebrow="Database · normalized shape"
        title={headerTitle}
        detailAside={
          <>
            <Badge tone="accent">{summary.systems.join(', ')}</Badge>
            <Badge tone="muted">normalized SQL</Badge>
            {summary.failed > 0 && (
              <Badge tone="bad">{plural(summary.failed, 'failure')}</Badge>
            )}
          </>
        }
        description={meta}
        actions={
          <>
            <CopyButton value={shapeId} label="Copy shape id" primary />
            <RefreshButton onClick={state.reload} loading={state.loading} />
          </>
        }
      />

      <StatStrip five>
        <StatCard
          label="Executions"
          value={formatNumber(summary.executions)}
          hint={`${formatNumber(summary.measured)} measured · ${formatNumber(summary.unmeasured)} unmeasured`}
        />
        <StatCard
          label="Median duration"
          value={<DurationValue ms={stats.median} />}
          hint={p95Hint}
        />
        <StatCard
          label="Min duration"
          value={<DurationValue ms={stats.min} />}
          hint="fastest measured execution"
        />
        <StatCard
          label="Max duration"
          value={<DurationValue ms={stats.max} />}
          hint="slowest measured execution"
        />
        <StatCard
          label="Traces"
          value={formatNumber(summary.traces)}
          hint={`${plural(summary.routes, 'route')} · ${summary.sources.join(', ') || 'source unknown'}`}
        />
      </StatStrip>

      {summary.unmeasured > 0 && (
        <Notice
          tone="muted"
          icon="info"
          title={`${plural(summary.unmeasured, 'execution')} without a measured duration`}
        >
          The adapter reported a null duration. Null stays unmeasured and is never
          displayed as <code>0 ms</code>; min, median, max and p95 use measured
          values only.
        </Notice>
      )}

      {state.data.truncated && (
        <Notice
          tone="warn"
          icon="database"
          title="Only part of the store was scanned"
        >
          The collector holds {formatNumber(state.data.total)} queries and this view
          reads at most {formatNumber(state.data.scanned)} of them. The execution
          list may omit older matches.
        </Notice>
      )}

      <div className="layout">
        <div className="layout__main">
          <Card
            title="Normalized SQL"
            subtitle="Literals and bind values are removed before this shape is displayed. The stored SQL is never changed."
            actions={<Badge tone="muted">read-only</Badge>}
          >
            <SqlBlock sql={shapeSql} />
          </Card>

          <Card
            title="Executions"
            subtitle="Grouped by the trace that resolved the query; order inside each group is chronological."
            meta={
              <span className="tabular">
                {formatNumber(shownExecutions)} of {formatNumber(filtered.length)}
              </span>
            }
            actions={
              <Select
                label="Filter executions by route"
                value={route}
                onChange={(value) => {
                  setRoute(value)
                  setShowAll('')
                }}
                options={[
                  { value: '', label: 'All routes' },
                  ...routes.map(([key, count]) => ({
                    value: key,
                    label: `${routeLabel(key === '__uncorrelated__' ? null : key)} (${count})`,
                  })),
                ]}
              />
            }
            padded={false}
          >
            {groups.length === 0 ? (
              <div className="card__inner">
                <EmptyState
                  compact
                  icon="database"
                  title="No executions match this route"
                  description="Clear the route filter to see every execution in the shape."
                  action={
                    <button
                      type="button"
                      className="button button--secondary button--small"
                      onClick={() => setRoute('')}
                    >
                      Clear route filter
                    </button>
                  }
                />
              </div>
            ) : (
              <>
                <div className="query-groups">
                  {visibleGroupsFinal.map(({ group, queries }) => {
                    const groupStats = durationStats(queries)
                    return (
                      <section className="query-group" key={group.traceId ?? 'uncorrelated'}>
                        <div className="query-group__head">
                          <div className="query-group__main">
                            <div className="query-group__title">
                              <span>{routeLabel(group.route)}</span>
                              {group.traceId ? (
                                <button
                                  type="button"
                                  className="link mono"
                                  title={group.traceId}
                                  onClick={() => onNavigate(`/traces/${group.traceId}`)}
                                >
                                  trace {shortId(group.traceId)}
                                </button>
                              ) : (
                                <Badge tone="muted">no trace</Badge>
                              )}
                            </div>
                            <div className="query-group__meta">
                              <span>{plural(group.queries.length, 'execution')}</span>
                              <span>
                                total{' '}
                                {group.totalMs === null ? (
                                  <Unmeasured label="unmeasured" />
                                ) : (
                                  formatDuration(group.totalMs)
                                )}
                              </span>
                              <span>
                                median <DurationValue ms={groupStats.median} />
                              </span>
                              {groupStats.measured < group.queries.length && (
                                <span className="muted">
                                  {plural(group.queries.length - groupStats.measured, 'missing duration')}
                                </span>
                              )}
                            </div>
                          </div>
                          {group.traceId && (
                            <button
                              type="button"
                              className="button button--ghost button--small"
                              onClick={() => onNavigate(`/traces/${group.traceId}`)}
                            >
                              Open trace <Icon name="arrow-right" size={13} />
                            </button>
                          )}
                        </div>
                        <div className="query-group__body">
                          <div className="execution-list">
                            {queries.map((query) => (
                              <div className="execution-row" key={query.id}>
                                <span
                                  className="execution-row__sql"
                                  title={`${query.source} · ${query.success ? 'success' : 'failed'}`}
                                >
                                  {query.source}
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
                        </div>
                      </section>
                    )
                  })}
                </div>
                {!expanded && shownExecutions < filtered.length && (
                  <div className="shape-more">
                    <button
                      type="button"
                      className="button button--secondary button--small"
                      onClick={() => setShowAll('all')}
                    >
                      Show {Math.min(EXECUTION_PAGE, filtered.length - shownExecutions)} more
                      <Icon name="chevron-down" size={14} />
                    </button>
                  </div>
                )}
                {expanded && filtered.length > EXECUTION_PAGE && (
                  <div className="shape-more">
                    <button
                      type="button"
                      className="button button--ghost button--small"
                      onClick={() => setShowAll('')}
                    >
                      Show fewer
                    </button>
                  </div>
                )}
              </>
            )}
          </Card>

          <Card
            title="Related findings"
            subtitle="Deterministic findings that reference these traces in the current sample."
            meta={
              extras.loading ? (
                <span className="muted">loading…</span>
              ) : (
                <span className="tabular">{formatNumber(relatedFindings.length)}</span>
              )
            }
          >
            {extras.loading && !extras.data ? (
              <Loading rows={2} label="Loading related findings" />
            ) : relatedFindings.length === 0 ? (
              <p className="muted">
                No diagnostic finding references these traces. This is an absence of
                evidence in the current sample, not proof that the query is healthy.
              </p>
            ) : (
              <div className="stack stack--tight">
                {relatedFindings.map((finding) => (
                  <button
                    type="button"
                    key={finding.id}
                    className="list-row list-row--no-leading"
                    onClick={() => onNavigate(`/diagnostics/${finding.id}`)}
                    aria-label={`Open finding ${finding.title}`}
                    title={finding.title}
                  >
                    <span className="list-row__text">
                      <span className="list-row__primary">{finding.title}</span>
                      <span className="list-row__secondary">
                        {finding.ruleId} · {finding.route ?? 'no route'} ·{' '}
                        {finding.status}
                      </span>
                    </span>
                    <span className="list-row__meta">
                      <Badge tone={findingTone(finding.severity)}>
                        {finding.severity}
                      </Badge>
                    </span>
                    <span className="list-row__chevron" aria-hidden="true">
                      <Icon name="chevron-right" size={14} />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {relatedComparisons.length > 0 && (
            <CollapsibleCard
              title="In comparisons"
              description="Query-duration metrics that reference this normalized shape. Comparisons are report-only."
              meta={<span className="tabular">{formatNumber(relatedComparisons.length)}</span>}
              defaultOpen={false}
              storageKey={`database-shape:${shapeId}:comparisons`}
            >
              <div className="stack stack--tight">
                {relatedComparisons.map((ref) => (
                  <div className="evidence-block" key={`${ref.comparison.id}:${ref.metric.key}`}>
                    <div className="evidence-block__top">
                      <button
                        type="button"
                        className="link"
                        onClick={() => onNavigate(`/comparisons/${ref.comparison.id}`)}
                      >
                        {shortId(ref.comparison.id)}
                      </button>
                      <Badge tone={REGRESSION_STATUS_TONE[ref.metric.status]}>
                        {ref.metric.status}
                      </Badge>
                      <Badge tone={REGRESSION_SEVERITY_TONE[ref.metric.severity]}>
                        {ref.metric.severity}
                      </Badge>
                      <span className="muted">{ref.scenarioTitle}</span>
                    </div>
                    <div className="execution-row">
                      <span className="execution-row__sql">
                        baseline {formatMetricValue(ref.metric, ref.metric.baselineValue)} ·
                        candidate {formatMetricValue(ref.metric, ref.metric.candidateValue)}
                      </span>
                      <span className="execution-row__duration">
                        {formatMetricDelta(ref.metric)}
                      </span>
                      <span className="execution-row__time">
                        {ref.metric.note ??
                          plural(ref.metric.sampleCount, 'sample')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleCard>
          )}
        </div>

        <PropertiesRail>
          <Card title="Details">
            <KeyValue
              entries={[
                { label: 'Operation', value: title.operation, mono: true },
                {
                  label: 'Tables',
                  value: title.tables.length > 0 ? title.tables.join(', ') : '—',
                  mono: true,
                  emptyReason: 'The normalized SQL did not expose a table name.',
                },
                { label: 'System', value: summary.systems.join(', ') },
                {
                  label: 'Sources',
                  value: summary.sources.join(', ') || 'unknown',
                },
                {
                  label: 'First seen',
                  value: <RelativeTime timestamp={summary.firstSeen} />,
                },
                {
                  label: 'Last seen',
                  value: <RelativeTime timestamp={summary.lastSeen} />,
                },
                {
                  label: 'Executions',
                  value: formatNumber(summary.executions),
                  numeric: true,
                },
                {
                  label: 'Measured',
                  value: formatNumber(summary.measured),
                  numeric: true,
                },
                {
                  label: 'Unmeasured',
                  value: formatNumber(summary.unmeasured),
                  numeric: true,
                },
                {
                  label: 'Failures',
                  value: formatNumber(summary.failed),
                  numeric: true,
                },
              ]}
            />
          </Card>

          <Card
            title="Fingerprint"
            subtitle="Client-derived from the same SQL normalization as diagnostics"
          >
            <div className="stack">
              <div className="fingerprint">
                <code>{shapeId}</code>
                <CopyButton value={shapeId} label="Copy shape id" small />
              </div>
              <p className="muted">
                The collector does not store a shape id. This identity is derived
                locally from the redacted SQL and is stable for the current
                normalization version.
              </p>
            </div>
          </Card>

          <Card title="Seen in" subtitle="Traces that executed this shape">
            {summary.traces === 0 ? (
              <p className="muted">No query in this shape resolved to a trace.</p>
            ) : (
              <div className="stack stack--tight">
                {[
                  ...new Set(
                    filtered
                      .map((item) => item.resolvedTraceId)
                      .filter((value): value is string => Boolean(value)),
                  ),
                ]
                  .slice(0, 8)
                  .map((traceId) => (
                    <button
                      type="button"
                      key={traceId}
                      className="link mono"
                      title={traceId}
                      onClick={() => onNavigate(`/traces/${traceId}`)}
                    >
                      {shortId(traceId)}
                    </button>
                  ))}
              </div>
            )}
            {summary.routes > 0 && (
              <div className="badge-row" style={{ marginTop: 'var(--sp-3)' }}>
                {routes
                  .filter(([key]) => key !== '__uncorrelated__')
                  .slice(0, 4)
                  .map(([key]) => (
                    <Badge tone="muted" key={key} title={key}>
                      {key}
                    </Badge>
                  ))}
              </div>
            )}
          </Card>

          <Card title="Limitations" subtitle="What this view cannot prove">
            <ul className="notes-list">
              <li>
                The shape is derived from stored SQL after redaction. Literals and
                bind values are removed and are never shown.
              </li>
              <li>
                Executions are read by paging the existing database API, up to the
                store cap. Older rows may be absent.
              </li>
              <li>
                Null durations stay unmeasured. Statistics use measured values only
                and do not imply a performance target.
              </li>
              <li>
                Related findings are deterministic heuristics over the current
                sample, not a confirmed root cause.
              </li>
              <li>
                Comparison references are report-only and may be inconclusive when
                either side has no measured duration.
              </li>
            </ul>
          </Card>
        </PropertiesRail>
      </div>
    </>
  )
}
