import { useEffect, useMemo, useState } from 'react'
import type {
  CoverageItem,
  CoverageReport,
  CoverageStatus,
  DiagnosticFinding,
  DiagnosticOverview,
  DiagnosticSeverity,
  ErrorGroup,
  OverviewResponse,
  PageResult,
  RequestSummary,
} from '@stacknext/core'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Card,
  cx,
  EmptyState,
  ErrorState,
  IconButton,
  InfoHint,
  KpiTile,
  ListRow,
  Loading,
  MethodBadge,
  PageHeader,
  SegmentBar,
  StatusCodeBadge,
  StatusIcon,
  type Segment,
} from '../components/ui'
import { Icon } from '../components/Icon'
import { LatencyChart, LatencyLegend, latencyStats } from '../components/LatencyChart'
import {
  errorRate,
  errorRateParts,
  formatDateTime,
  formatDuration,
  formatDurationParts,
  formatNumber,
  formatRelative,
} from '../format'

interface OverviewData {
  overview: OverviewResponse | null
  requests: PageResult<RequestSummary> | null
  coverage: CoverageReport | null
  coverageError: string | null
  errorGroups: ErrorGroup[] | null
  errorTotal: number | null
  errorError: string | null
  errors: {
    overview: string | null
    requests: string | null
  }
}

interface FindingGroup {
  key: string
  severity: DiagnosticSeverity
  title: string
  route: string | null
  count: number
  firstSeen: number
  lastSeen: number
  findings: DiagnosticFinding[]
}

const SEVERITY_RANK: Record<DiagnosticSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
}

const SEVERITY_TONE: Record<DiagnosticSeverity, Segment['tone']> = {
  error: 'danger',
  warning: 'warning',
  info: 'info',
}

const SEVERITY_STATUS = {
  error: 'error',
  warning: 'warning',
  info: 'info',
} as const

const COVERAGE_SEGMENTS: Array<{
  status: CoverageStatus
  tone: Segment['tone']
}> = [
  { status: 'not-observed', tone: 'warning' },
  { status: 'unknown', tone: 'neutral' },
  { status: 'active', tone: 'info' },
  { status: 'configured', tone: 'neutral' },
  { status: 'observed', tone: 'success' },
  { status: 'unsupported', tone: 'muted' },
]

const COVERAGE_RANK: Record<CoverageStatus, number> = {
  'not-observed': 0,
  unknown: 1,
  observed: 2,
  active: 3,
  configured: 4,
  unsupported: 5,
}

/** The coverage table is split into two real tables only when two columns fit. */
function useWideCoverage(): boolean {
  const [wide, setWide] = useState(
    () => window.matchMedia('(min-width: 1280px)').matches,
  )
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1280px)')
    const update = (): void => setWide(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return wide
}

function rejectionMessage(result: PromiseSettledResult<unknown>): string | null {
  if (result.status === 'fulfilled') return null
  return result.reason instanceof Error ? result.reason.message : String(result.reason)
}

function fulfilledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null
}

function pathFor(request: RequestSummary): string {
  return request.route ?? request.name
}

function groupFindings(findings: DiagnosticFinding[]): FindingGroup[] {
  const groups = new Map<string, FindingGroup>()
  for (const finding of findings) {
    const key = `${finding.ruleId}:${finding.route ?? ''}:${finding.title}`
    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
      existing.firstSeen = Math.min(existing.firstSeen, finding.firstSeen)
      existing.lastSeen = Math.max(existing.lastSeen, finding.lastSeen)
      existing.findings.push(finding)
      continue
    }
    groups.set(key, {
      key,
      severity: finding.severity,
      title: finding.title,
      route: finding.route,
      count: 1,
      firstSeen: finding.firstSeen,
      lastSeen: finding.lastSeen,
      findings: [finding],
    })
  }
  return [...groups.values()].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.count - a.count ||
      b.lastSeen - a.lastSeen,
  )
}

function redactedMessage(message: string): React.ReactNode {
  return message.split(/(\[redacted\])/g).map((part, index) =>
    part === '[redacted]' ? (
      <span key={index} className="mono error-redacted">
        {part}
      </span>
    ) : (
      part
    ),
  )
}

function ViewAll({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button type="button" className="card__link" onClick={onClick}>
      View all <Icon name="arrow-right" size={14} />
    </button>
  )
}

function CoverageGrid({
  items,
  maxVolume,
  continuation = false,
}: {
  items: CoverageItem[]
  maxVolume: number
  continuation?: boolean
}): React.ReactElement {
  return (
    <div
      className="coverage-grid"
      role="table"
      aria-label={
        continuation ? 'Instrumentation coverage continued' : 'Instrumentation coverage'
      }
    >
      <div
        className={cx(
          'coverage-grid__header',
          continuation && 'coverage-grid__header--continuation',
        )}
        role="row"
      >
        <span className="coverage-cell coverage-cell--status" role="columnheader">
          <span className="sr-only">Status</span>
        </span>
        <span className="coverage-cell coverage-cell--signal" role="columnheader">
          Signal
        </span>
        <span className="coverage-cell coverage-cell--category" role="columnheader">
          Category
        </span>
        <span className="coverage-cell coverage-cell--volume" role="columnheader">
          Volume
        </span>
        <span className="coverage-cell coverage-cell--seen" role="columnheader">
          Last seen
        </span>
      </div>
      {items.map((item: CoverageItem) => (
        <div className="coverage-row" role="row" key={item.id}>
          <span className="coverage-cell coverage-cell--status" role="cell">
            <StatusIcon
              status={item.status}
              label={`${item.status}: ${item.label}`}
            />
          </span>
          <span className="coverage-cell coverage-cell--signal" role="cell">
            <span className="coverage-signal__name">
              <span className="coverage-signal__label" title={item.label}>
                {item.label}
              </span>
              <span className="coverage-signal__category">{item.category}</span>
            </span>
            <span className="coverage-signal__description" title={item.description}>
              {item.description}
            </span>
            {item.limitations.length > 0 && (
              <InfoHint label={`${item.label}: ${item.limitations.join(' ')}`}>
                {item.limitations.join(' ')}
              </InfoHint>
            )}
          </span>
          <span className="coverage-cell coverage-cell--category" role="cell">
            {item.category}
          </span>
          <span className="coverage-cell coverage-cell--volume" role="cell">
            {item.evidence.count > 0 ? (
              <span className="coverage-volume">
                <span className="magnitude coverage-volume__bar" aria-hidden="true">
                  <span
                    className="magnitude__fill"
                    style={{
                      width: `${Math.max(
                        4,
                        (item.evidence.count / maxVolume) * 100,
                      )}%`,
                    }}
                  />
                </span>
                <span className="coverage-volume__count tabular">
                  {formatNumber(item.evidence.count)}
                </span>
              </span>
            ) : (
              <span className="muted">—</span>
            )}
          </span>
          <span
            className="coverage-cell coverage-cell--seen"
            role="cell"
            title={
              item.evidence.lastSeen
                ? formatDateTime(item.evidence.lastSeen)
                : 'No evidence in this sample'
            }
          >
            {item.evidence.lastSeen ? formatRelative(item.evidence.lastSeen) : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

function OverviewSkeleton(): React.ReactElement {
  return (
    <div className="overview" aria-busy="true" aria-label="Loading overview">
      <div className="overview__kpis">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="kpi kpi--skeleton">
            <span className="skeleton skeleton--label" />
            <span className="skeleton skeleton--value" />
            <span className="skeleton skeleton--line" />
            <span className="skeleton skeleton--spark" />
          </div>
        ))}
      </div>
      <div className="overview__row">
        <div className="overview__half">
          <div className="card">
            <div className="card__header">
              <span className="skeleton skeleton--title" />
            </div>
            <div className="card__body">
              <span className="skeleton skeleton--chart" />
            </div>
          </div>
        </div>
        <div className="overview__half">
          <div className="card">
            <div className="card__header">
              <span className="skeleton skeleton--title" />
            </div>
            <div className="card__body overview-skeleton__rows">
              {Array.from({ length: 5 }, (_, index) => (
                <span key={index} className="skeleton skeleton--row" />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="overview__row">
        <div className="overview__half">
          <div className="card">
            <div className="card__header">
              <span className="skeleton skeleton--title" />
            </div>
            <div className="card__body overview-skeleton__rows">
              {Array.from({ length: 5 }, (_, index) => (
                <span key={index} className="skeleton skeleton--row" />
              ))}
            </div>
          </div>
        </div>
        <div className="overview__half">
          <div className="card">
            <div className="card__header">
              <span className="skeleton skeleton--title" />
            </div>
            <div className="card__body overview-skeleton__rows">
              {Array.from({ length: 5 }, (_, index) => (
                <span key={index} className="skeleton skeleton--row" />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="overview__full">
        <div className="card">
          <div className="card__header">
            <span className="skeleton skeleton--title" />
          </div>
          <div className="card__body overview-skeleton__rows">
            {Array.from({ length: 6 }, (_, index) => (
              <span key={index} className="skeleton skeleton--row" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function OverviewPage({
  refreshKey,
  onNavigate,
  liveStatus = 'live',
  paused = false,
  pendingLive = 0,
  onTogglePause,
}: {
  refreshKey: number
  onNavigate: (path: string) => void
  liveStatus?: 'connecting' | 'live' | 'reconnecting'
  paused?: boolean
  pendingLive?: number
  onTogglePause?: () => void
}): React.ReactElement {
  const state = useAsync<OverviewData>(
    async (signal) => {
      const [overview, requests] = await Promise.allSettled([
        api.overview(signal),
        api.requests({ limit: 24, sort: 'recent' }, signal),
      ])
      const overviewValue = fulfilledValue(overview)
      // `/api/summary` already carries coverage and bounded error groups on
      // current collectors. Only ask for them separately when talking to an
      // older collector.
      let coverage = overviewValue?.coverage ?? null
      let coverageError: string | null = null
      if (!coverage) {
        const fallback = await Promise.allSettled([api.coverage(signal)])
        coverage = fulfilledValue(fallback[0])
        coverageError = rejectionMessage(fallback[0])
      }
      let errorGroups = overviewValue?.recentErrorGroups ?? null
      let errorTotal = overviewValue?.summary.errorCount ?? null
      let errorError: string | null = null
      if (!errorGroups) {
        const fallback = await Promise.allSettled([api.errors({ limit: 5 }, signal)])
        const errorList = fulfilledValue(fallback[0])
        errorGroups = errorList?.groups ?? null
        errorTotal = errorList?.total ?? errorTotal
        errorError = rejectionMessage(fallback[0])
      }
      return {
        overview: overviewValue,
        requests: fulfilledValue(requests),
        coverage,
        coverageError,
        errorGroups,
        errorTotal,
        errorError,
        errors: {
          overview: rejectionMessage(overview),
          requests: rejectionMessage(requests),
        },
      }
    },
    'overview',
    refreshKey,
    15_000,
    paused,
  )
  const reload = state.reload

  const [coverageFilter, setCoverageFilter] = useState<CoverageStatus | null>(null)
  const [showUnsupported, setShowUnsupported] = useState(false)
  const [severityFilter, setSeverityFilter] = useState<DiagnosticSeverity | null>(null)
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null)
  const wideCoverage = useWideCoverage()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== 'r'
      ) {
        return
      }
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement)
      ) {
        return
      }
      event.preventDefault()
      reload()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [reload])

  const data = state.data
  const overview = data?.overview ?? null
  const coverage = data?.coverage ?? null
  const health = overview?.health ?? null
  const summary = overview?.summary ?? null
  const diagnosticOverview: DiagnosticOverview | undefined =
    overview?.diagnosticOverview
  const thresholdMs = health?.config.slowRequestMs ?? null
  const requests = data?.requests
  const recentRequests = useMemo(() => requests?.items ?? [], [requests])
  const connectedInstance = health?.connections.find((connection) => connection.connected)
  const projectName = health?.projectName ?? coverage?.projectName ?? 'StackNext'
  const connected = health?.connected ?? coverage?.sample.connected ?? false

  const coverageItems = useMemo(() => coverage?.items ?? [], [coverage])
  const coverageCounts = useMemo(() => {
    const counts: Record<CoverageStatus, number> = {
      observed: 0,
      active: 0,
      configured: 0,
      'not-observed': 0,
      unsupported: 0,
      unknown: 0,
    }
    for (const item of coverageItems) counts[item.status] += 1
    return counts
  }, [coverageItems])

  const coverageSegments: Segment[] = useMemo(
    () =>
      COVERAGE_SEGMENTS.map(({ status, tone }) => ({
        key: status,
        label: status,
        count: coverageCounts[status],
        tone,
      })),
    [coverageCounts],
  )

  const activeCoverageFilter =
    coverageFilter !== null && coverageCounts[coverageFilter] > 0
      ? coverageFilter
      : null

  const visibleCoverage = useMemo(() => {
    const sorted = [...coverageItems].sort(
      (a, b) => COVERAGE_RANK[a.status] - COVERAGE_RANK[b.status],
    )
    if (activeCoverageFilter) {
      return sorted.filter((item) => item.status === activeCoverageFilter)
    }
    return sorted.filter((item) => showUnsupported || item.status !== 'unsupported')
  }, [activeCoverageFilter, coverageItems, showUnsupported])

  const coverageColumns = useMemo(() => {
    if (!wideCoverage) return [visibleCoverage]
    const split = Math.ceil(visibleCoverage.length / 2)
    return [visibleCoverage.slice(0, split), visibleCoverage.slice(split)]
  }, [visibleCoverage, wideCoverage])

  const maxCoverageVolume = useMemo(
    () => Math.max(1, ...coverageItems.map((item) => item.evidence.count)),
    [coverageItems],
  )
  const unsupportedCount = coverageCounts.unsupported

  const findingGroups = useMemo(
    () => groupFindings(diagnosticOverview?.topFindings ?? []),
    [diagnosticOverview],
  )

  const severityCounts = useMemo(() => {
    const counts: Record<DiagnosticSeverity, number> = {
      error: 0,
      warning: 0,
      info: 0,
    }
    for (const group of findingGroups) counts[group.severity] += 1
    return counts
  }, [findingGroups])

  const activeSeverityFilter =
    severityFilter !== null && severityCounts[severityFilter] > 0
      ? severityFilter
      : null
  const visibleFindingGroups = activeSeverityFilter
    ? findingGroups.filter((group) => group.severity === activeSeverityFilter)
    : findingGroups

  const severitySegments: Segment[] = (
    ['error', 'warning', 'info'] as DiagnosticSeverity[]
  )
    .map((severity) => ({
      key: severity,
      label: severity,
      count: severityCounts[severity],
      tone: SEVERITY_TONE[severity],
    }))
    .filter((segment) => segment.count > 0)

  const errorGroups = useMemo(() => data?.errorGroups ?? [], [data?.errorGroups])
  const errorTotal = data?.errorTotal ?? summary?.errorCount ?? 0
  const visibleErrorGroups = errorGroups.slice(0, 5)

  const slowestGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string
        method: string | null
        route: string
        count: number
        maxDuration: number
        slowest: RequestSummary
        errorCount: number
      }
    >()
    for (const request of recentRequests) {
      const route = pathFor(request)
      const key = `${request.method ?? ''}:${route}`
      const existing = groups.get(key)
      if (existing) {
        existing.count += 1
        if ((request.durationMs ?? 0) > existing.maxDuration) {
          existing.maxDuration = request.durationMs ?? 0
          existing.slowest = request
        }
        existing.errorCount += request.failed ? 1 : 0
      } else {
        groups.set(key, {
          key,
          method: request.method,
          route,
          count: 1,
          maxDuration: request.durationMs ?? 0,
          slowest: request,
          errorCount: request.failed ? 1 : 0,
        })
      }
    }
    return [...groups.values()]
      .sort((a, b) => b.maxDuration - a.maxDuration)
      .slice(0, 5)
  }, [recentRequests])

  const {
    slowestAboveThreshold,
    maxSlowest,
    requestSpark,
    errorSpark,
    slowSpark,
    sparkLabels,
    errorSparkLabels,
    slowSparkLabels,
    latency,
  } = useMemo(() => {
    const recentForSpark = [...recentRequests]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-24)
    return {
      slowestAboveThreshold: slowestGroups.filter(
        (group) => thresholdMs !== null && group.maxDuration > thresholdMs,
      ).length,
      maxSlowest: Math.max(
        1,
        ...slowestGroups.map((group) => group.maxDuration),
      ),
      requestSpark: recentForSpark.map((request) => request.durationMs ?? 0),
      errorSpark: recentForSpark.map((request) => (request.failed ? 1 : 0)),
      slowSpark: recentForSpark.map((request) => (request.slow ? 1 : 0)),
      sparkLabels: recentForSpark.map(
        (request) =>
          `${request.method ?? 'Request'} ${pathFor(request)} — ${formatDuration(request.durationMs)}`,
      ),
      errorSparkLabels: recentForSpark.map(
        (request) =>
          `${request.method ?? 'Request'} ${pathFor(request)} — ${request.failed ? 'error' : 'ok'}`,
      ),
      slowSparkLabels: recentForSpark.map(
        (request) =>
          `${request.method ?? 'Request'} ${pathFor(request)} — ${request.slow ? 'slow' : (thresholdMs === null ? 'not flagged slow' : `under ${formatDuration(thresholdMs)}`)}`,
      ),
      latency: latencyStats(recentRequests, thresholdMs),
    }
  }, [recentRequests, slowestGroups, thresholdMs])

  if (state.loading && !state.data) {
    return (
      <div className="overview-page">
        <PageHeader title="Overview" description="Loading local telemetry…" />
        <OverviewSkeleton />
      </div>
    )
  }

  const lastUpdate = health?.time ?? coverage?.generatedAt
  const stale = liveStatus === 'reconnecting'
  const liveLine = stale ? (
    <span className="overview-live-line">
      <StatusIcon status="warning" size={13} label="Live feed disconnected" />
      Showing the last sample from {formatRelative(lastUpdate)}
    </span>
  ) : connected ? (
    <span className="overview-live-line">
      <span className="overview-live-dot" aria-hidden="true" />
      Live · {connectedInstance?.serviceName ?? projectName} · updated{' '}
      {formatRelative(lastUpdate)}
    </span>
  ) : (
    'Collector is running, waiting for instrumentation heartbeats.'
  )

  const coverageFacts: Array<{ label: string; value: string }> = []
  if (connectedInstance?.nextVersion) {
    coverageFacts.push({ label: 'Next.js', value: connectedInstance.nextVersion })
  }
  if (connectedInstance?.sdkVersion) {
    coverageFacts.push({ label: 'SDK', value: connectedInstance.sdkVersion })
  }
  if (connectedInstance?.diagnostics) {
    coverageFacts.push({
      label: 'Spans exported',
      value: formatNumber(connectedInstance.diagnostics.exportedSpans),
    })
    coverageFacts.push({
      label: 'Last export',
      value: formatRelative(connectedInstance.diagnostics.timestamp),
    })
  }
  if (health) {
    coverageFacts.push({
      label: 'Collector uptime',
      value: formatDuration(health.uptimeMs),
    })
  }
  if (coverageFacts.length === 0 && coverage) {
    coverageFacts.push({
      label: 'Collector',
      value: `v${coverage.collectorVersion}`,
    })
  }

  const p95Parts = formatDurationParts(summary?.p95DurationMs)
  const errorRatePartsValue = errorRateParts(
    summary?.failedRequests ?? 0,
    summary?.totalRequests ?? 0,
  )
  const latencyFooterCaption =
    recentRequests.length === 0
      ? 'No requests in the current sample.'
      : latency.allUnderThreshold
        ? `All under ${formatDuration(thresholdMs)}.`
        : 'Axis rounded up from the slowest.'
  const p95AboveThreshold =
    thresholdMs !== null &&
    summary?.p95DurationMs !== null &&
    summary?.p95DurationMs !== undefined &&
    summary.p95DurationMs > thresholdMs
  const hasFailedRequests = (summary?.failedRequests ?? 0) > 0
  const hasSlowRequests = (summary?.slowRequests ?? 0) > 0

  return (
    <div className="overview-page">
      <PageHeader
        title="Overview"
        description={liveLine}
        actions={
          <div className="overview-actions">
            {paused && pendingLive > 0 && (
              <button
                type="button"
                className="live-pending"
                onClick={onTogglePause}
                aria-label={`Resume live updates. ${pendingLive} new events.`}
              >
                {pendingLive} new
              </button>
            )}
            {onTogglePause && (
              <IconButton
                icon={paused ? 'play' : 'pause'}
                label={paused ? 'Resume live updates' : 'Pause live updates'}
                pressed={paused}
                onClick={onTogglePause}
              />
            )}
            <IconButton
              icon="refresh"
              label="Refresh (R)"
              busy={state.loading}
              onClick={state.reload}
            />
          </div>
        }
      />

      <div className="overview">
        {summary ? (
          <div className="overview__kpis">
            <KpiTile
              label="Requests"
              value={formatNumber(summary.totalRequests)}
              context={`${formatNumber(summary.spanCount)} spans captured`}
              sparkline={requestSpark}
              sparklineTone="accent"
              sparklineLabels={sparkLabels}
              onClick={() => onNavigate('/traces?view=requests')}
              ariaLabel={`Requests: ${formatNumber(summary.totalRequests)}. ${formatNumber(summary.spanCount)} spans captured. Open requests.`}
            />
            <KpiTile
              label="Error rate"
              value={errorRatePartsValue.value}
              unit={errorRatePartsValue.unit}
              context={`${formatNumber(summary.failedRequests)} of ${formatNumber(summary.totalRequests)} requests failed`}
              sparkline={errorSpark}
              sparklineTone="danger"
              sparklineLabels={errorSparkLabels}
              status={
                hasFailedRequests
                  ? {
                      kind: 'error',
                      label: 'Threshold: any failed request',
                    }
                  : undefined
              }
              onClick={() => onNavigate('/errors')}
              ariaLabel={`Error rate: ${errorRate(summary.failedRequests, summary.totalRequests)}. ${formatNumber(summary.failedRequests)} of ${formatNumber(summary.totalRequests)} requests failed. Open errors.`}
            />
            <KpiTile
              label="p95 latency"
              value={p95Parts.value}
              unit={p95Parts.unit}
              context={`avg ${formatDuration(summary.avgDurationMs)}`}
              sparkline={requestSpark}
              sparklineTone="accent"
              sparklineLabels={sparkLabels}
              status={
                p95AboveThreshold
                  ? {
                      kind: 'warning',
                      label: `p95 is above the ${formatDuration(thresholdMs)} slow-request threshold`,
                    }
                  : undefined
              }
              onClick={() => onNavigate('/traces?view=requests&sort=slowest')}
              ariaLabel={`p95 latency: ${formatDuration(summary.p95DurationMs)}. Average ${formatDuration(summary.avgDurationMs)}. Open slowest requests.`}
            />
            <KpiTile
              label="Slow requests"
              value={formatNumber(summary.slowRequests)}
              context={`of ${formatNumber(summary.totalRequests)} requests above ${formatDuration(thresholdMs)}`}
              sparkline={slowSpark}
              sparklineTone="warning"
              sparklineLabels={slowSparkLabels}
              status={
                hasSlowRequests
                  ? {
                      kind: 'warning',
                      label: `Requests slower than ${formatDuration(thresholdMs)}`,
                    }
                  : undefined
              }
              onClick={() => onNavigate('/traces?view=requests&slow=1')}
              ariaLabel={`Slow requests: ${formatNumber(summary.slowRequests)} of ${formatNumber(summary.totalRequests)} above ${formatDuration(thresholdMs)}. Open slow requests.`}
            />
          </div>
        ) : (
          <div className="overview__kpis overview__kpis--error">
            <ErrorState
              message={data?.errors.overview ?? 'The overview summary could not be loaded.'}
              onRetry={state.reload}
            />
          </div>
        )}

        <div className="overview__row">
          <div className="overview__half">
            <Card
              title="Recent request latency"
              subtitle="Latest 24 requests"
              actions={<LatencyLegend thresholdMs={thresholdMs} />}
              footer={
                <>
                  <span>{latencyFooterCaption}</span>
                  <span className="nowrap tabular">
                    {formatNumber(latency.errorCount)}{' '}
                    {latency.errorCount === 1 ? 'error' : 'errors'} ·{' '}
                    {formatNumber(latency.slowCount)} slow
                  </span>
                </>
              }
              className="overview__chart-card"
            >
              {data?.errors.requests ? (
                <ErrorState
                  compact
                  message={data.errors.requests}
                  onRetry={state.reload}
                />
              ) : recentRequests.length === 0 ? (
                <EmptyState
                  compact
                  icon="requests"
                  title="No recent requests"
                  description="New requests appear here live once the app receives traffic."
                />
              ) : (
                <LatencyChart
                  requests={recentRequests}
                  thresholdMs={thresholdMs}
                  onOpenRequest={(traceId) => onNavigate(`/traces/${traceId}`)}
                />
              )}
            </Card>
          </div>

          <div className="overview__half">
            <Card
              title="Slowest requests"
              subtitle="Top 5 routes · latest 24 requests"
              actions={<ViewAll onClick={() => onNavigate('/traces?view=requests&slow=1')} />}
              footer={
                recentRequests.length > 0 ? (
                  <>
                    <span>Grouped by route</span>
                    <span className="tabular">
                      {thresholdMs === null ? 'Threshold unavailable' : `${formatNumber(slowestAboveThreshold)} of ${formatNumber(slowestGroups.length)} above ${formatDuration(thresholdMs)}`}
                    </span>
                  </>
                ) : undefined
              }
              className="overview__list-card"
            >
              {data?.errors.requests ? (
                <ErrorState
                  compact
                  message={data.errors.requests}
                  onRetry={state.reload}
                />
              ) : slowestGroups.length === 0 ? (
                <EmptyState
                  compact
                  icon="clock"
                  title="No requests in this sample"
                  description="Request durations appear here once the app receives traffic."
                />
              ) : (
                <ul className="overview-list slow-list">
                  {slowestGroups.map((group) => (
                    <li key={group.key}>
                      <ListRow
                        leading={<MethodBadge method={group.method} />}
                        primary={<span className="route-text">{group.route}</span>}
                        secondary={
                          <>
                            {group.count > 1
                              ? `×${formatNumber(group.count)} · `
                              : ''}
                            {group.errorCount > 0
                              ? `${formatNumber(group.errorCount)} failed · `
                              : ''}
                            {formatRelative(group.slowest.timestamp)}
                          </>
                        }
                        meta={
                          <span className="request-metrics">
                            <StatusCodeBadge
                              code={group.slowest.statusCode}
                              failed={group.slowest.failed}
                            />
                            <span className="request-metrics__duration">
                              {formatDuration(group.maxDuration)}
                            </span>
                            <span className="magnitude" aria-hidden="true">
                              <span
                                className="magnitude__fill"
                                style={{
                                  width: `${Math.max(
                                    4,
                                    (group.maxDuration / maxSlowest) * 100,
                                  )}%`,
                                }}
                              />
                            </span>
                          </span>
                        }
                        onClick={() => onNavigate(`/traces/${group.slowest.traceId}`)}
                        title={`${group.method ?? '—'} ${group.route} — slowest at ${formatDateTime(group.slowest.timestamp)}`}
                        ariaLabel={`${group.method ?? 'Request'} ${group.route}, ${group.count > 1 ? `${formatNumber(group.count)} slow occurrences, ` : ''}${group.errorCount > 0 ? `${formatNumber(group.errorCount)} failed, ` : ''}${formatDuration(group.maxDuration)}, status ${group.slowest.statusCode ?? 'unknown'}. Open request.`}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>

        <div className="overview__row">
          <div className="overview__half">
            <Card
              title="Diagnostic findings"
              subtitle={
                diagnosticOverview
                  ? `${formatNumber(diagnosticOverview.counts.total)} findings · ${findingGroups.length} group${findingGroups.length === 1 ? '' : 's'} shown · rule set v${diagnosticOverview.ruleSetVersion}`
                  : 'No diagnostic report in this sample'
              }
              actions={<ViewAll onClick={() => onNavigate('/diagnostics')} />}
              footer={
                diagnosticOverview ? (
                  <>
                    <span>Deterministic evidence — not confirmed root causes.</span>
                    <span className="nowrap">
                      {diagnosticOverview.counts.total === 0
                        ? 'No findings in sample'
                        : `Showing top ${Math.min(5, diagnosticOverview.topFindings.length)} of ${formatNumber(diagnosticOverview.counts.total)}`}
                    </span>
                  </>
                ) : undefined
              }
              className="overview__list-card"
            >
              {data?.errors.overview ? (
                <ErrorState
                  compact
                  message={data.errors.overview}
                  onRetry={state.reload}
                />
              ) : !diagnosticOverview ? (
                <EmptyState
                  compact
                  icon="shield"
                  title="No diagnostic overview"
                  description="The collector did not include a diagnostic report for this sample."
                />
              ) : diagnosticOverview.counts.total === 0 ? (
                <EmptyState
                  compact
                  icon="shield"
                  title="No diagnostic findings"
                  description="No configured rule crossed its threshold in this sample. This is not proof that the app has no problems."
                />
              ) : (
                <>
                  <SegmentBar
                    segments={severitySegments}
                    activeKey={activeSeverityFilter}
                    onSelect={(key) =>
                      setSeverityFilter(key as DiagnosticSeverity | null)
                    }
                    label="Filter diagnostic findings by severity"
                  />
                  {visibleFindingGroups.length === 0 ? (
                    <EmptyState
                      compact
                      icon="search"
                      title="No findings match this severity"
                      description="The overview previews the top findings; open Diagnostics for the full sample."
                      action={
                        activeSeverityFilter ? (
                          <button
                            type="button"
                            className="button button--secondary button--small"
                            onClick={() => setSeverityFilter(null)}
                          >
                            Clear severity filter
                          </button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <ul className="overview-list finding-list">
                      {visibleFindingGroups.map((group) => {
                        const expanded = expandedFinding === group.key
                        const canExpand = group.count > 1
                        return (
                          <li key={group.key}>
                            <ListRow
                              leading={
                                <StatusIcon
                                  status={SEVERITY_STATUS[group.severity]}
                                  label={`${group.severity} severity`}
                                />
                              }
                              primary={group.title}
                              secondary={
                                <>
                                  <span className="mono muted">
                                    {group.route ?? 'no route'}
                                  </span>{' '}
                                  · {formatRelative(group.lastSeen)}
                                </>
                              }
                              meta={
                                <span className="finding-meta">
                                  <span className="finding-meta__count">
                                    ×{formatNumber(group.count)}
                                  </span>
                                </span>
                              }
                              reserveChevron
                              chevron={
                                canExpand ? (
                                  <Icon
                                    name={expanded ? 'chevron-down' : 'chevron-right'}
                                    size={14}
                                    className="finding-meta__chevron"
                                  />
                                ) : undefined
                              }
                              onClick={() => {
                                if (!canExpand) {
                                  onNavigate(`/diagnostics/${group.findings[0]?.id}`)
                                  return
                                }
                                setExpandedFinding(expanded ? null : group.key)
                              }}
                              expanded={canExpand ? expanded : undefined}
                              title={`${group.title} — ${group.route ?? 'no route'} · first seen ${formatDateTime(group.firstSeen)} · last seen ${formatDateTime(group.lastSeen)}`}
                              ariaLabel={`${group.title}, ${group.route ?? 'no route'}, ${formatNumber(group.count)} finding${group.count === 1 ? '' : 's'}, ${group.severity} severity. ${canExpand ? (expanded ? 'Collapse occurrences.' : 'Expand occurrences.') : 'Open finding.'}`}
                            />
                            {expanded && (
                              <ul className="finding-occurrences">
                                {group.findings.map((finding) => (
                                  <li key={finding.id}>
                                    <button
                                      type="button"
                                      className="finding-occurrence"
                                      onClick={() =>
                                        onNavigate(`/diagnostics/${finding.id}`)
                                      }
                                      title={formatDateTime(finding.lastSeen)}
                                    >
                                      <span className="mono">{finding.id}</span>
                                      <span>{formatRelative(finding.lastSeen)}</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </>
              )}
            </Card>
          </div>

          <div className="overview__half">
            <Card
              title="Recent errors"
              subtitle={`${formatNumber(errorTotal)} occurrence${errorTotal === 1 ? '' : 's'} · grouped by fingerprint`}
              actions={<ViewAll onClick={() => onNavigate('/errors')} />}
              footer={
                data?.errorGroups ? (
                  <>
                    <span>From the Next.js onRequestError hook.</span>
                    <span className="nowrap">
                      {errorGroups.length > visibleErrorGroups.length
                        ? `Showing ${formatNumber(visibleErrorGroups.length)} of ${formatNumber(errorGroups.length)} groups`
                        : `${formatNumber(errorGroups.length)} group${errorGroups.length === 1 ? '' : 's'}`}{' '}
                      · {formatNumber(errorTotal)} occurrence
                      {errorTotal === 1 ? '' : 's'}
                    </span>
                  </>
                ) : undefined
              }
              className="overview__list-card"
            >
              {data?.errorError ? (
                <ErrorState
                  compact
                  message={data.errorError}
                  onRetry={state.reload}
                />
              ) : !data ? (
                <Loading rows={3} label="Loading recent errors" />
              ) : errorGroups.length === 0 ? (
                <EmptyState
                  compact
                  icon="shield"
                  title="No errors captured"
                  description="Server errors reported through Next.js onRequestError appear here."
                />
              ) : (
                <ul className="overview-list error-list-overview">
                  {visibleErrorGroups.map((group) => (
                    <li key={group.fingerprint}>
                      <ListRow
                        leading={<StatusIcon status="error" label="Error" />}
                        primary={
                          <span className="error-primary">
                            <span className="error-primary__name">{group.name}</span>
                            <span className="error-primary__message mono">
                              {redactedMessage(group.message)}
                            </span>
                          </span>
                        }
                        secondary={
                          <>
                            <span className="mono muted">
                              {group.route ?? 'unknown route'}
                            </span>
                            {' · '}
                            {formatRelative(group.lastSeen)}
                          </>
                        }
                        meta={
                          <span className="error-meta">
                            <span className="error-meta__count">
                              ×{formatNumber(group.count)}
                            </span>
                          </span>
                        }
                        reserveChevron
                        onClick={() => onNavigate(`/errors/${group.latestErrorId}`)}
                        title={`${group.name}: ${group.message} — first seen ${formatDateTime(group.firstSeen)}, last seen ${formatDateTime(group.lastSeen)}`}
                        ariaLabel={`${group.name}: ${group.message}, ${group.route ?? 'unknown route'}, ${formatNumber(group.count)} occurrence${group.count === 1 ? '' : 's'}, last seen ${formatRelative(group.lastSeen)}. Open error.`}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>

        <div className="overview__full">
          <Card
            title="Instrumentation coverage"
            subtitle={
              coverage ? 'Current retention window' : 'Waiting for coverage evidence'
            }
            className="overview__coverage-card"
            footer={
              coverage ? (
                <>
                  <span>
                    Evidence from the current retention window, not a score. Empty samples
                    don't prove a feature is broken.{' '}
                    <InfoHint label="Run stacknext coverage for limitations">
                      Run stacknext coverage for limitations.
                    </InfoHint>
                  </span>
                  <span className="nowrap">
                    {formatNumber(coverage.sample.requests)} requests ·{' '}
                    {formatNumber(coverage.sample.spans)} spans
                    {coverage.sample.firstEventTime !== null && (
                      <> · sample start {formatDateTime(coverage.sample.firstEventTime)}</>
                    )}
                  </span>
                </>
              ) : undefined
            }
          >
            {data?.coverageError ? (
              <ErrorState
                compact
                message={data.coverageError}
                onRetry={state.reload}
              />
            ) : coverageItems.length === 0 ? (
              <EmptyState
                compact
                icon="server"
                title="No coverage evidence yet"
                description="Coverage appears when the collector has spans or connection state to read."
              />
            ) : (
              <>
                {coverageFacts.length > 0 && (
                  <dl className="coverage-facts" aria-label="Coverage environment">
                    {coverageFacts.map((fact) => (
                      <div className="coverage-fact" key={fact.label}>
                        <dt>{fact.label}</dt>
                        <dd>{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <SegmentBar
                  segments={coverageSegments}
                  activeKey={activeCoverageFilter}
                  onSelect={(key) => {
                    setCoverageFilter(key as CoverageStatus | null)
                    if (key === 'unsupported') setShowUnsupported(true)
                  }}
                  label="Filter instrumentation coverage by status"
                />
                {visibleCoverage.length === 0 ? (
                  <EmptyState
                    compact
                    icon="search"
                    title={
                      activeCoverageFilter
                        ? 'No coverage rows match this status'
                        : 'No supported coverage rows'
                    }
                    description={
                      activeCoverageFilter
                        ? `No item currently has the ${activeCoverageFilter} status in this sample.`
                        : 'Every item in this sample is unsupported by the current runtime.'
                    }
                    action={
                      activeCoverageFilter ? (
                        <button
                          type="button"
                          className="button button--secondary button--small"
                          onClick={() => setCoverageFilter(null)}
                        >
                          Clear status filter
                        </button>
                      ) : unsupportedCount > 0 ? (
                        <button
                          type="button"
                          className="button button--secondary button--small"
                          onClick={() => setShowUnsupported(true)}
                        >
                          Show unsupported by runtime
                        </button>
                      ) : undefined
                    }
                  />
                ) : (
                  <div className="coverage-split">
                    <CoverageGrid
                      items={coverageColumns[0] ?? []}
                      maxVolume={maxCoverageVolume}
                    />
                    {(coverageColumns[1]?.length ?? 0) > 0 && (
                      <CoverageGrid
                        items={coverageColumns[1] ?? []}
                        maxVolume={maxCoverageVolume}
                        continuation
                      />
                    )}
                  </div>
                )}
                {!activeCoverageFilter && unsupportedCount > 0 && (
                  <button
                    type="button"
                    className="unsupported-toggle coverage-unsupported"
                    onClick={() => setShowUnsupported((value) => !value)}
                    aria-expanded={showUnsupported}
                  >
                    <Icon
                      name={showUnsupported ? 'chevron-down' : 'chevron-right'}
                      size={14}
                    />
                    {showUnsupported ? 'Hide' : 'Show'} {unsupportedCount} unsupported by
                    runtime
                  </button>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
