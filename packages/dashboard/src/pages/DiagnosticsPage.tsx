import { useMemo, useState } from 'react'
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
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  Pagination,
  SearchInput,
  StatCard,
  type Tone,
} from '../components/ui'
import { Icon } from '../components/Icon'
import { formatDateTime, formatRelative, truncate } from '../format'

const LIMIT = 25

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

function evidenceSummary(finding: DiagnosticFinding): string {
  const parts: string[] = []
  if (finding.evidence.spans.length > 0) {
    parts.push(`${finding.evidence.spans.length} span${finding.evidence.spans.length === 1 ? '' : 's'}`)
  }
  if (finding.evidence.queries.length > 0) {
    parts.push(
      `${finding.evidence.queries.length} quer${finding.evidence.queries.length === 1 ? 'y' : 'ies'}`,
    )
  }
  if (finding.evidence.errors.length > 0) {
    parts.push(
      `${finding.evidence.errors.length} error${finding.evidence.errors.length === 1 ? '' : 's'}`,
    )
  }
  return parts.join(' · ')
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
}): React.ReactElement {
  return (
    <label className="select" aria-label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size={13} />
    </label>
  )
}

export function DiagnosticsPage({
  refreshKey,
  onNavigate,
}: {
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [route, setRoute] = useState('')
  const [category, setCategory] = useState('')
  const [severity, setSeverity] = useState('')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)

  const update = (setter: (value: string) => void) => (value: string): void => {
    setter(value)
    setOffset(0)
  }

  const key = useMemo(
    () => JSON.stringify({ debouncedSearch, route, category, severity, status, offset }),
    [debouncedSearch, route, category, severity, status, offset],
  )
  const state = useAsync<DiagnosticListResponse>(
    (signal) =>
      api.diagnostics(
        {
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

  return (
    <>
      <PageHeader
        eyebrow="Diagnostics"
        title="Findings"
        description="Deterministic, evidence-backed findings from the current retention window. They are possible explanations, not confirmed root causes."
        actions={
          <button type="button" className="button button--ghost" onClick={state.reload}>
            <Icon name="refresh" size={15} /> Refresh
          </button>
        }
      />

      {state.data && (
        <div className="stat-grid">
          <StatCard
            label="Findings"
            value={state.data.total}
            hint={`${state.data.sample.requests} requests in sample`}
            icon="pulse"
          />
          <StatCard
            label="Errors"
            value={state.data.counts.bySeverity.error}
            hint="observed error groups"
            tone={state.data.counts.bySeverity.error > 0 ? 'bad' : 'good'}
            icon="errors"
          />
          <StatCard
            label="Warnings"
            value={state.data.counts.bySeverity.warning}
            hint="possible or observed slowness"
            tone={state.data.counts.bySeverity.warning > 0 ? 'warn' : 'default'}
            icon="clock"
          />
          <StatCard
            label="Rules"
            value={state.data.ruleSetVersion}
            hint={`engine ${state.data.engineVersion}`}
            icon="layers"
          />
        </div>
      )}

      <Card className="toolbar-card">
        <div className="toolbar">
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
            label="All categories"
            value={category}
            options={DIAGNOSTIC_CATEGORIES}
            onChange={update(setCategory)}
          />
          <Select
            label="All severities"
            value={severity}
            options={DIAGNOSTIC_SEVERITIES}
            onChange={update(setSeverity)}
          />
          <Select
            label="All statuses"
            value={status}
            options={DIAGNOSTIC_STATUSES}
            onChange={update(setStatus)}
          />
        </div>
      </Card>

      <Card padded={false}>
        {state.loading && !state.data ? (
          <div className="card__inner">
            <Loading rows={7} />
          </div>
        ) : state.error && !state.data ? (
          <div className="card__inner">
            <ErrorState message={state.error} onRetry={state.reload} />
          </div>
        ) : state.data && state.data.items.length === 0 ? (
          <EmptyState
            icon={filtersActive ? 'search' : 'shield'}
            title={filtersActive ? 'No findings match these filters' : 'No diagnostic findings'}
            description={
              filtersActive
                ? 'Try clearing a filter or widening the search.'
                : 'The current sample did not cross any configured diagnostic rule. This does not prove the app has no performance or correctness problems.'
            }
            action={
              filtersActive ? (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => {
                    setSearch('')
                    setRoute('')
                    setCategory('')
                    setSeverity('')
                    setStatus('')
                    setOffset(0)
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <Badge tone="good">no rule matched</Badge>
              )
            }
          />
        ) : (
          <>
            <div className="diagnostic-list">
              {state.data?.items.map((finding) => (
                <button
                  type="button"
                  key={finding.id}
                  className="diagnostic-row"
                  onClick={() => onNavigate(`/diagnostics/${finding.id}`)}
                >
                  <div className="diagnostic-row__top">
                    <Badge tone={SEVERITY_TONE[finding.severity]}>{finding.severity}</Badge>
                    <Badge tone={STATUS_TONE[finding.status]}>{finding.status}</Badge>
                    <span className="diagnostic-row__rule mono">{finding.ruleId}</span>
                    <span className="diagnostic-row__time muted" title={formatDateTime(finding.lastSeen)}>
                      {formatRelative(finding.lastSeen)}
                    </span>
                  </div>
                  <div className="diagnostic-row__title">{finding.title}</div>
                  <div className="diagnostic-row__summary">{truncate(finding.summary, 240)}</div>
                  <div className="diagnostic-row__meta">
                    <span className="mono">{finding.route ?? 'no route'}</span>
                    <span>{evidenceSummary(finding) || 'evidence attached'}</span>
                    <span>{finding.traceIds.length} trace{finding.traceIds.length === 1 ? '' : 's'}</span>
                  </div>
                </button>
              ))}
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

      {state.data && state.data.notes.length > 0 && (
        <Card title="Sample notes" subtitle="Keep the evidence window in mind">
          <ul className="notes-list">
            {state.data.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <p className="muted">
            Findings are bounded and versioned. Use <code>stacknext diagnose --json</code> for
            the same report from the CLI.
          </p>
        </Card>
      )}
    </>
  )
}
