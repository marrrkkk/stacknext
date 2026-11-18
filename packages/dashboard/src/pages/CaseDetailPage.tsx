import type { CaseEvent, CaseView, VerificationResult } from '@stacknext/core'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  Card,
  CopyButton,
  EmptyState,
  ErrorState,
  Id,
  KeyValue,
  Loading,
  PageHeader,
  PageLayout,
  type Tone,
} from '../components/ui'
import { RelativeTime } from '../components/details'
import { Icon } from '../components/Icon'
import { formatDateTime, formatNumber } from '../format'

const STATUS_TONE: Record<CaseView['status'], Tone> = {
  open: 'warn',
  verified: 'good',
  refuted: 'bad',
  abandoned: 'muted',
}

function evidenceHref(kind: string, id: string): string | null {
  const routes: Record<string, string> = {
    trace: 'traces',
    error: 'errors',
    diagnostic: 'diagnostics',
    comparison: 'comparisons',
    snapshot: 'snapshots',
  }
  const route = routes[kind]
  return route ? `/${route}/${encodeURIComponent(id)}` : null
}

const VERIFICATION_TONE: Record<VerificationResult['result'], Tone> = {
  supported: 'good',
  contradicted: 'bad',
  unverifiable: 'warn',
}

function VerificationBlock({
  result,
  caseId,
  onNavigate,
}: {
  result: VerificationResult
  caseId: string
  onNavigate: (path: string) => void
}): React.ReactElement {
  return (
    <div className="case-verification">
      <div className="button-row">
        <Badge tone={VERIFICATION_TONE[result.result]}>{result.result}</Badge>
        <CopyButton
          value={`stacknext verify --case ${caseId} --json`}
          label="Copy verify command"
          small
        />
      </div>
      <p>{result.claim}</p>
      <p className="muted">
        Sample {formatNumber(result.sampleSize)} · revision {result.revision}
      </p>
      {result.result === 'unverifiable' && (
        <p className="muted">Unverifiable is not a pass. Check the reason on each failing check.</p>
      )}
      <ul className="case-checks">
        {result.checks.map((check, index) => (
          <li key={`${check.predicate}:${index}`}>
            <Badge tone={check.passed ? 'good' : check.reason ? 'warn' : 'bad'}>
              {check.passed ? 'passed' : check.reason ? 'unverifiable' : 'failed'}
            </Badge>{' '}
            {check.predicate}: expected {JSON.stringify(check.expected)}, observed{' '}
            {JSON.stringify(check.observed)}
            {check.reason ? ` — ${check.reason}` : ''}
            <div className="row-secondary">
              {check.evidence.map((id) => (
                <button
                  type="button"
                  className="link-button mono"
                  key={id}
                  onClick={() => {
                    const href = evidenceHref(
                      check.predicate === 'diagnosticStatus' ? 'diagnostic' : 'trace',
                      id,
                    )
                    if (href) onNavigate(href)
                  }}
                >
                  <Id value={id} />
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function eventLabel(event: CaseEvent): string {
  switch (event.kind) {
    case 'created':
      return `Created by ${event.actor}`
    case 'evidence_added':
      return `Added ${event.evidence.kind} evidence`
    case 'note_added':
      return 'Added note'
    case 'verification_added':
      return 'Recorded verification'
    case 'closed':
      return `Closed as ${event.status}`
  }
}

export function CaseDetailPage({
  caseId,
  refreshKey,
  onNavigate,
}: {
  caseId: string
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const state = useAsync<CaseView>(
    (signal) => api.case(caseId, signal),
    `case:${caseId}`,
    refreshKey,
    5_000,
  )
  const back = {
    label: 'Cases',
    onClick: () => onNavigate('/cases'),
    trail: caseId,
  }

  if (state.loading && !state.data) return <Loading rows={6} />
  if (state.error && !state.data) {
    return (
      <PageLayout>
        <PageHeader detail title="Case" back={back} />
        <Card>
          <div className="card__inner">
            <ErrorState message={state.error} onRetry={state.reload} />
          </div>
        </Card>
      </PageLayout>
    )
  }
  const view = state.data
  if (!view) return <Loading rows={4} />

  return (
    <PageLayout>
      <PageHeader
        detail
        back={back}
        eyebrow="Investigation case · read-only"
        title={<span className="detail-title__text">{view.title}</span>}
        detailAside={
          <>
            <Badge tone={STATUS_TONE[view.status]}>{view.status}</Badge>
            <Badge tone="muted">v{view.version}</Badge>
            <Badge tone="muted">{formatNumber(view.evidence.length)} evidence</Badge>
          </>
        }
        description={
          <>
            <span className="mono"><Id value={view.id} /></span>
            <span className="detail-meta__dot" aria-hidden="true">·</span>
            <span>updated <RelativeTime timestamp={view.updatedAt} /></span>
          </>
        }
        actions={
          <button
            type="button"
            className="button button--secondary"
            onClick={() => onNavigate('/cases')}
          >
            <Icon name="chevron-right" size={14} /> All cases
          </button>
        }
      />

      <Card title="Hypothesis" subtitle="What the case set out to test">
        <div className="card__inner">
          {view.hypothesis ? (
            <p>{view.hypothesis}</p>
          ) : (
            <p className="muted">No hypothesis was recorded for this case.</p>
          )}
          <KeyValue
            entries={[
              {
                label: 'Agent session',
                value: view.agentSessionId ? (
                  <button
                    type="button"
                    className="link-button mono"
                    onClick={() => onNavigate(`/agents/${view.agentSessionId}`)}
                  >
                    <Id value={view.agentSessionId} />
                  </button>
                ) : (
                  'human'
                ),
              },
              { label: 'Created', value: formatDateTime(view.createdAt) },
            ]}
          />
        </div>
      </Card>

      <Card title="Evidence" subtitle="Ids only; open the real record to verify it">
        <div className="card__inner">
          {view.evidence.length === 0 ? (
            <EmptyState compact icon="inbox" title="No evidence recorded" />
          ) : (
            <ul className="case-evidence">
              {view.evidence.map((item, index) => {
                const href = evidenceHref(item.kind, item.id)
                return (
                  <li key={`${item.kind}:${item.id}:${index}`}>
                    <Badge tone="accent">{item.kind}</Badge>{' '}
                    {href ? (
                      <button
                        type="button"
                        className="link-button mono"
                        onClick={() => onNavigate(href)}
                      >
                        <Id value={item.id} />
                      </button>
                    ) : (
                      <span className="mono"><Id value={item.id} /></span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Card>

      <Card title="Verification" subtitle="Deterministic check, not a confirmed root cause">
        <div className="card__inner">
          {!view.verification ? (
            <p className="muted">
              No verification recorded. A case without a verification result is
              not a proven conclusion.
            </p>
          ) : (
            <VerificationBlock
              result={view.verification as VerificationResult}
              caseId={view.id}
              onNavigate={onNavigate}
            />
          )}
        </div>
      </Card>

      <Card title="Event timeline" subtitle="Append-only history; newest last">
        <div className="card__inner">
          <ol className="case-timeline">
            {view.events.map((event, index) => (
              <li key={`${event.kind}:${event.at}:${index}`}>
                <span className="mono">{formatDateTime(event.at)}</span> ·{' '}
                <strong>{eventLabel(event)}</strong>
              </li>
            ))}
          </ol>
        </div>
      </Card>
    </PageLayout>
  )
}
