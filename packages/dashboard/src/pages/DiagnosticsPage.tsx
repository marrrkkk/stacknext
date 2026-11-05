import { useId, useMemo, useState } from 'react'
import {
  DIAGNOSTIC_CATEGORIES,
  DIAGNOSTIC_SEVERITIES,
  DIAGNOSTIC_STATUSES,
  type DiagnosticCategory,
  type DiagnosticFinding,
  type DiagnosticListResponse,
  type DiagnosticSeverity,
  type DiagnosticStatus,
} from '@stacknext/core'
import { api } from '../api'
import { useAsync, useDebounced } from '../hooks'
import {
  Badge,
  Card,
  CopyButton,
  EmptyState,
  ErrorState,
  IdLink,
  PageHeader,
  PageLayout,
  SearchInput,
  Select,
  StatCard,
  StatGridSkeleton,
  StatStrip,
  TableFooter,
  Toolbar,
  cx,
  type Tone,
} from '../components/ui'
import { Icon } from '../components/Icon'
import { formatDateTime, formatDuration, formatNumber, formatRelative } from '../format'

const LIMIT = 25

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  ...DIAGNOSTIC_CATEGORIES.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  })),
]

const SEVERITY_OPTIONS = [
  { value: '', label: 'All severities' },
  ...DIAGNOSTIC_SEVERITIES.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  })),
]

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...DIAGNOSTIC_STATUSES.map((value) => ({
    value,
    label: value.replace(/-/g, ' ').replace(/^./, (letter) => letter.toUpperCase()),
  })),
]

const SEVERITY_TONE: Record<DiagnosticSeverity, Tone> = {
  error: 'bad',
  warning: 'warn',
  info: 'accent',
}

const STATUS_TONE: Record<DiagnosticStatus, Tone> = {
  observed: 'good',
  possible: 'warn',
  'insufficient-evidence': 'muted',
}

const SECTION_LABEL: Record<DiagnosticSeverity, string> = {
  error: 'Errors',
  warning: 'Warnings',
  info: 'Info',
}

const SECTION_ORDER: DiagnosticSeverity[] = ['error', 'warning', 'info']

function FindingRow({
  finding,
  open,
  onToggle,
  onNavigate,
}: {
  finding: DiagnosticFinding
  open: boolean
  onToggle: () => void
  onNavigate: (path: string) => void
}): React.ReactElement {
  const [summaryOpen, setSummaryOpen] = useState(false)
  const panelId = useId()
  const summary = finding.summary
  const hasLongSummary = summary.length > 150
  const hasTraceOccurrences = (finding.evidence.traces?.length ?? 0) > 0
  const traces = useMemo(() => {
    const occurrences = finding.evidence.traces ?? []
    return occurrences.length > 0
      ? [...occurrences].sort((a, b) => b.timestamp - a.timestamp)
      : finding.traceIds.map((traceId) => ({
          traceId,
          timestamp: finding.lastSeen,
          occurrences: 1,
          durationMs: undefined,
          contributor: undefined,
        }))
  }, [finding.evidence.traces, finding.traceIds, finding.lastSeen])
  const visibleTraces = traces.slice(0, 12)
  const affected = finding.affectedTraceCount ?? traces.length

  return (
    <div className="finding-row">
      <div className="finding-row__badges">
        <Badge tone={SEVERITY_TONE[finding.severity]}>{finding.severity}</Badge>
        <Badge tone={STATUS_TONE[finding.status]}>{finding.status}</Badge>
      </div>

      <div className="finding-row__main">
        <div className="finding-row__title-line">
          <button
            type="button"
            className="finding-row__title finding-row__title-button"
            title={finding.title}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={onToggle}
          >
            {finding.title}
          </button>
          {affected > 0 && (
            <span className="finding-row__count">
              {formatNumber(affected)} trace{affected === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div
          className={cx(
            'finding-row__summary',
            !summaryOpen && 'finding-row__summary--clamp',
          )}
        >
          {summary}
        </div>
        {hasLongSummary && (
          <button
            type="button"
            className="link finding-row__more"
            aria-expanded={summaryOpen}
            onClick={() => setSummaryOpen((current) => !current)}
          >
            {summaryOpen ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      <div className="finding-row__meta">
        <span className="mono" title={finding.route ?? 'No route'}>
          {finding.route ?? 'No route'}
        </span>
        <span className="mono">{finding.ruleId}</span>
        <span>{finding.category}</span>
      </div>

      <div className="finding-row__time" title={formatDateTime(finding.lastSeen)}>
        {formatRelative(finding.lastSeen)}
      </div>

      <button
        type="button"
        className="button button--ghost button--icon finding-row__toggle"
        aria-label={open ? 'Collapse finding' : 'Expand finding'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <Icon name="chevron-down" size={14} className="finding-row__toggle-icon" />
      </button>

      {open && (
        <div className="finding-row__details" id={panelId}>
          <div className="finding-evidence">
            <span className="finding-evidence__label">
              {hasTraceOccurrences
                ? 'Trace occurrences in this finding'
                : 'Traces on this page'}
            </span>
            {visibleTraces.length === 0 ? (
              <span className="muted">No trace is linked to this finding.</span>
            ) : (
              visibleTraces.map((trace) => (
                <div className="finding-evidence__row" key={trace.traceId}>
                  <IdLink
                    value={trace.traceId}
                    label="Open request trace"
                    onClick={() => onNavigate(`/traces/${trace.traceId}`)}
                  />
                  <span className="mono muted" title={finding.route ?? 'No route'}>
                    {trace.contributor ?? finding.route ?? 'No route'}
                  </span>
                  <span className="muted">
                    {trace.occurrences} occurrence{trace.occurrences === 1 ? '' : 's'}
                  </span>
                  {trace.durationMs !== undefined && (
                    <span className="muted tabular">
                      {formatDuration(trace.durationMs)}
                    </span>
                  )}
                  <span className="muted" title={formatDateTime(trace.timestamp)}>
                    {formatRelative(trace.timestamp)}
                  </span>
                  <button
                    type="button"
                    className="link"
                    onClick={() => onNavigate(`/diagnostics/${finding.id}`)}
                  >
                    Open finding
                  </button>
                </div>
              ))
            )}
            {traces.length > visibleTraces.length && (
              <span className="muted">
                +{formatNumber(traces.length - visibleTraces.length)} more traces
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FindingsSkeleton(): React.ReactElement {
  return (
    <div className="findings-skeleton" role="status" aria-label="Loading findings">
      {[0, 1, 2, 3].map((index) => (
        <div className="findings-skeleton__row" key={index} aria-hidden="true">
          <span className="skeleton findings-skeleton__badge" />
          <span className="findings-skeleton__main">
            <span className="skeleton findings-skeleton__title" />
            <span className="skeleton findings-skeleton__line" />
          </span>
          <span className="skeleton findings-skeleton__meta" />
        </div>
      ))}
      <span className="sr-only">Loading findings</span>
    </div>
  )
}

export function DiagnosticsPage({
  refreshKey,
  onNavigate,
}: {
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const traceId = new URLSearchParams(window.location.search).get('traceId') ?? undefined
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [route, setRoute] = useState('')
  const [category, setCategory] = useState('')
  const [severity, setSeverity] = useState('')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const update = (setter: (value: string) => void) => (value: string): void => {
    setter(value)
    setExpanded({})
    setOffset(0)
  }

  const key = useMemo(
    () => JSON.stringify({ debouncedSearch, route, category, severity, status, offset, traceId }),
    [debouncedSearch, route, category, severity, status, offset, traceId],
  )
  const state = useAsync<DiagnosticListResponse>(
    (signal) =>
      api.diagnostics(
        {
          traceId,
          limit: LIMIT,
          offset,
          q: debouncedSearch || undefined,
          route: route || undefined,
          category: (category || undefined) as DiagnosticCategory | undefined,
          severity: (severity || undefined) as DiagnosticSeverity | undefined,
          status: (status || undefined) as DiagnosticStatus | undefined,
        },
        signal,
      ),
    key,
    refreshKey,
  )
  const filtersActive = Boolean(debouncedSearch || route || category || severity || status)
  const items = useMemo(() => state.data?.items ?? [], [state.data])
  const total = state.data?.total ?? 0
  const sections = useMemo(
    () =>
      SECTION_ORDER.map((sectionSeverity) => ({
        severity: sectionSeverity,
        findings: items.filter((finding) => finding.severity === sectionSeverity),
      })).filter((section) => section.findings.length > 0),
    [items],
  )
  const hasExpandedState = Object.keys(expanded).length > 0

  const clearFilters = (): void => {
    setSearch('')
    setRoute('')
    setCategory('')
    setSeverity('')
    setStatus('')
    setExpanded({})
    setOffset(0)
  }

  return (
    <PageLayout>
      <PageHeader
        eyebrow="Diagnostics"
        title="Findings"
        description="Deterministic, evidence-backed findings from the current retention window."
        info="Findings are possible explanations, not confirmed root causes. They are bounded heuristics over the in-memory sample."
        actions={
          <button type="button" className="button button--secondary" onClick={state.reload}>
            <Icon name="refresh" size={15} /> Refresh
          </button>
        }
      />

      {state.data ? (
        <StatStrip>
          <StatCard
            label="Findings"
            value={formatNumber(state.data.total)}
            hint={filtersActive ? 'Matching the current filters' : 'In the current retention window'}
          />
          <StatCard
            label="Errors"
            value={formatNumber(state.data.counts.bySeverity.error)}
            hint="Error-severity findings"
            tone={state.data.counts.bySeverity.error > 0 ? 'bad' : 'good'}
          />
          <StatCard
            label="Warnings"
            value={formatNumber(state.data.counts.bySeverity.warning)}
            hint="Slow or repeated evidence"
            tone={state.data.counts.bySeverity.warning > 0 ? 'warn' : 'default'}
          />
          <StatCard
            label="Engine"
            value={state.data.engineVersion}
            hint={`Rule set v${state.data.ruleSetVersion}`}
          />
        </StatStrip>
      ) : (
        <StatGridSkeleton />
      )}

      {state.data && state.data.notes.length > 0 && (
        <details className="card sample-notes">
          <summary>
            <Icon name="info" size={14} />
            <span className="sample-notes__title">Sample notes</span>
            <span className="sample-notes__count">
              {state.data.notes.length} note{state.data.notes.length === 1 ? '' : 's'}
            </span>
            <Icon name="chevron-down" size={14} className="sample-notes__chevron" />
          </summary>
          <div className="sample-notes__body">
            <ul>
              {state.data.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <p>
              Findings are bounded and versioned. The same report is available from the CLI with{' '}
              <code>stacknext diagnose --json</code>.
            </p>
          </div>
        </details>
      )}

      <Toolbar
        label="Filter findings"
        className="toolbar--findings"
        aside={
          <span className="toolbar__count">
            Showing {formatNumber(items.length)} of {formatNumber(total)}
          </span>
        }
      >
        <SearchInput
          value={search}
          onChange={update(setSearch)}
          placeholder="Search findings, routes or fingerprints…"
          label="Search diagnostics"
        />
        <SearchInput
          value={route}
          onChange={update(setRoute)}
          placeholder="Filter by route…"
          label="Filter diagnostics by route"
        />
        <Select
          label="Filter by category"
          value={category}
          options={CATEGORY_OPTIONS}
          onChange={update(setCategory)}
        />
        <Select
          label="Filter by severity"
          value={severity}
          options={SEVERITY_OPTIONS}
          onChange={update(setSeverity)}
        />
        <Select
          label="Filter by status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={update(setStatus)}
        />
        {filtersActive && (
          <button
            type="button"
            className="button button--ghost list-toolbar__clear"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        )}
      </Toolbar>

      {state.loading && !state.data ? (
        <Card padded={false}>
          <FindingsSkeleton />
        </Card>
      ) : state.error && !state.data ? (
        <Card>
          <ErrorState message={state.error} onRetry={state.reload} />
        </Card>
      ) : state.data && items.length === 0 ? (
        <Card>
          <EmptyState
            icon={filtersActive ? 'search' : 'shield'}
            title={filtersActive ? 'No findings match these filters' : 'No diagnostic findings'}
            description={
              filtersActive
                ? 'Clear a filter or widen the search.'
                : 'No rule crossed its threshold in the current sample.'
            }
            action={
              filtersActive ? (
                <button
                  type="button"
                  className="button button--secondary button--small"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="findings-list">
            {sections.map((section) => (
              <section className="finding-section" key={section.severity}>
                <h3 className="finding-section__title">
                  {SECTION_LABEL[section.severity]}
                  <span className="finding-section__count">{section.findings.length}</span>
                </h3>
                {section.findings.map((finding, index) => {
                  const open =
                    expanded[finding.id] ?? (!hasExpandedState && section.severity === 'error' && index === 0)
                  return (
                    <FindingRow
                      key={finding.id}
                      finding={finding}
                      open={open}
                      onToggle={() =>
                        setExpanded((current) => ({
                          ...current,
                          [finding.id]: !open,
                        }))
                      }
                      onNavigate={onNavigate}
                    />
                  )
                })}
              </section>
            ))}
          </div>
          <div className="card__footer">
            <TableFooter
              total={total}
              limit={LIMIT}
              offset={offset}
              onChange={setOffset}
              note={
                <span className="table-footer__note">
                  Same report: <code>stacknext diagnose --json</code>
                  <CopyButton
                    small
                    value="stacknext diagnose --json"
                    label="Copy command"
                    className="button--ghost"
                  />
                </span>
              }
            />
          </div>
        </Card>
      )}
    </PageLayout>
  )
}
