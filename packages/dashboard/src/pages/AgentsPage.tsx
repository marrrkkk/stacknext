import { useMemo } from 'react'
import type {
  AgentReadEvent,
  AgentSessionSummary,
  AgentSessionResponse,
  AgentsResponse,
} from '@stacknext/core'
import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Id,
  IdLink,
  ListTableSkeleton,
  PageHeader,
  PageLayout,
  StatCard,
  StatGridSkeleton,
  StatStrip,
  type Tone,
} from '../components/ui'
import { Icon } from '../components/Icon'
import { RelativeTime } from '../components/details'
import { formatDuration, formatNumber, formatRelative } from '../format'

const LIMIT = 50

function clientLabel(session: AgentSessionSummary): string {
  const client = session.client
  if (!client) return 'Unattributed client'
  return client.version ? `${client.name} ${client.version}` : client.name
}

function outcomeTone(summary: AgentSessionSummary): Tone {
  if (summary.outcomes.error > 0) return 'bad'
  if (summary.outcomes.notFound > 0) return 'warn'
  return 'good'
}

function evidenceHref(event: AgentReadEvent, id: string): string | null {
  const segments = event.path.split('/').filter(Boolean)
  const group = segments[1]
  const routeByGroup: Record<string, string> = {
    traces: 'traces',
    requests: 'traces',
    errors: 'errors',
    diagnostics: 'diagnostics',
    snapshots: 'snapshots',
    comparisons: 'comparisons',
    baselines: 'baselines',
    'test-runs': 'runs',
  }
  const route = group ? routeByGroup[group] : undefined
  return route ? `/${route}/${encodeURIComponent(id)}` : null
}

function SessionTimeline({
  sessionId,
  onNavigate,
}: {
  sessionId: string
  onNavigate: (path: string) => void
}): React.ReactElement {
  const state = useAsync<AgentSessionResponse>(
    (signal) => api.agent(sessionId, { limit: LIMIT }, signal),
    `agent:${sessionId}`,
    0,
    5_000,
  )
  const events = useMemo(() => state.data?.events ?? [], [state.data])
  const session = state.data?.session

  return (
    <Card>
      <div className="card__inner">
        <div className="section-heading">
          <div>
            <h2 className="section-heading__title">Read timeline</h2>
            <p className="muted">
              {session ? (
                <>
                  {clientLabel(session)} · <RelativeTime timestamp={session.firstSeen} /> —{' '}
                  <RelativeTime timestamp={session.lastSeen} /> · {formatNumber(session.reads)} reads
                </>
              ) : (
                'One local MCP session'
              )}
            </p>
          </div>
          <button
            type="button"
            className="button button--secondary button--compact"
            onClick={() => onNavigate('/agents')}
          >
            <Icon name="chevron-right" size={14} /> All sessions
          </button>
        </div>
      </div>
      {state.loading && !state.data ? (
        <ListTableSkeleton
          label="Loading read timeline"
          columns={[
            { key: 'when', label: 'When', width: '18%' },
            { key: 'tool', label: 'Tool', width: '18%' },
            { key: 'read', label: 'Read', width: '40%' },
            { key: 'status', label: 'Status', width: '12%' },
            { key: 'duration', label: 'Duration', width: '12%' },
          ]}
        />
      ) : state.error && !state.data ? (
        <div className="card__inner">
          <ErrorState message={state.error} onRetry={state.reload} />
        </div>
      ) : events.length === 0 ? (
        <div className="card__inner">
          <EmptyState
            compact
            icon="inbox"
            title="No recorded reads"
            description="Agent reads appear here when an MCP client connects with attribution."
          />
        </div>
      ) : (
        <DataTable
          label="Agent read timeline"
          columns={[
            { key: 'when', label: 'When', width: '18%' },
            { key: 'tool', label: 'Tool', width: '18%' },
            { key: 'read', label: 'Read', width: '40%' },
            { key: 'status', label: 'Status', width: '12%', className: 'numeric' },
            { key: 'duration', label: 'Duration', width: '12%', className: 'numeric' },
          ]}
        >
          {events.map((event) => (
            <tr key={event.id}>
              <td data-label="When" title={new Date(event.at).toISOString()}>
                <RelativeTime timestamp={event.at} />
              </td>
              <td data-label="Tool">
                {event.tool ? <Badge tone="accent">{event.tool}</Badge> : <span className="muted">—</span>}
              </td>
              <td data-label="Read" className="mono">
                <span>{event.path}</span>
                {event.filterKeys.length > 0 && (
                  <span className="muted"> ?{event.filterKeys.join(', ')}</span>
                )}
                {event.evidenceIds.length > 0 && (
                  <div className="agent-evidence">
                    {event.evidenceIds.map((id) => {
                      const href = evidenceHref(event, id)
                      return href ? (
                        <IdLink key={id} value={id} onClick={() => onNavigate(href)} />
                      ) : (
                        <Id key={id} value={id} />
                      )
                    })}
                  </div>
                )}
              </td>
              <td data-label="Status" className="numeric">
                <Badge tone={event.status < 400 ? 'good' : event.status === 404 ? 'warn' : 'bad'}>
                  {event.status}
                </Badge>
              </td>
              <td data-label="Duration" className="numeric">
                {formatDuration(event.durationMs)}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </Card>
  )
}

export function AgentsPage({
  refreshKey,
  sessionId,
  onNavigate,
}: {
  refreshKey: number
  sessionId?: string
  onNavigate: (path: string) => void
}): React.ReactElement {
  const state = useAsync<AgentsResponse>(
    (signal) => api.agents(signal),
    'agents',
    refreshKey,
    5_000,
  )
  const sessions = useMemo(() => state.data?.sessions ?? [], [state.data])
  const reads = sessions.reduce((sum, session) => sum + session.reads, 0)
  const evidence = sessions.reduce((sum, session) => sum + session.evidenceCount, 0)

  return (
    <PageLayout>
      <PageHeader
        eyebrow="Agent activity · local"
        title="Agents"
        description="Which local MCP agent session read which evidence. Attribution only; nothing leaves this machine."
        info="Session ids are random and local to one `stacknext mcp` process. No query values, bodies, tokens, host names, model names or machine/user identifiers are recorded. Reads are capped, redacted and expire after 30 minutes."
        actions={
          <button
            type="button"
            className="button button--secondary"
            onClick={state.reload}
          >
            <Icon name="refresh" size={15} /> Refresh
          </button>
        }
      />

      {state.data ? (
        <StatStrip>
          <StatCard
            label="Sessions"
            value={formatNumber(sessions.length)}
            hint="In the current 30-minute window"
          />
          <StatCard label="Reads" value={formatNumber(reads)} hint="Bounded, redacted audit" />
          <StatCard label="Evidence touched" value={formatNumber(evidence)} hint="Unique ids" />
          <StatCard
            label="Dropped"
            value={formatNumber(state.data.dropped)}
            hint={state.data.enabled ? 'Cap or TTL evictions' : 'Audit is disabled'}
            tone={state.data.dropped > 0 ? 'warn' : 'default'}
          />
        </StatStrip>
      ) : (
        <StatGridSkeleton />
      )}

      {!state.data?.enabled ? (
        <Card>
          <div className="card__inner">
            <EmptyState
              icon="shield"
              title="Agent audit is disabled"
              description="Set agents.audit to true in stacknext.config.json to record local MCP reads."
            />
          </div>
        </Card>
      ) : sessionId ? (
        <SessionTimeline sessionId={sessionId} onNavigate={onNavigate} />
      ) : state.loading && !state.data ? (
        <Card>
          <ListTableSkeleton
            label="Loading agent sessions"
            columns={[
              { key: 'client', label: 'Client', width: '24%' },
              { key: 'seen', label: 'Last seen', width: '18%' },
              { key: 'reads', label: 'Reads', width: '12%' },
              { key: 'tools', label: 'Tools', width: '12%' },
              { key: 'evidence', label: 'Evidence', width: '12%' },
              { key: 'outcomes', label: 'Outcomes', width: '22%' },
            ]}
          />
        </Card>
      ) : state.error && !state.data ? (
        <Card>
          <div className="card__inner">
            <ErrorState message={state.error} onRetry={state.reload} />
          </div>
        </Card>
      ) : sessions.length === 0 ? (
        <Card>
          <div className="card__inner">
            <EmptyState
              icon="terminal"
              title="No MCP sessions yet"
              description="Start `stacknext mcp` from a coding client, then read some evidence. Each session appears here with a timeline of what it read."
            />
          </div>
        </Card>
      ) : (
        <Card padded={false}>
          <DataTable
            label="Agent sessions"
            columns={[
              { key: 'client', label: 'Client', width: '24%' },
              { key: 'seen', label: 'Last seen', width: '18%' },
              { key: 'reads', label: 'Reads', width: '12%', className: 'numeric' },
              { key: 'tools', label: 'Tools', width: '12%', className: 'numeric' },
              { key: 'evidence', label: 'Evidence', width: '12%', className: 'numeric' },
              { key: 'outcomes', label: 'Outcomes', width: '22%' },
            ]}
          >
            {sessions.map((session) => (
              <tr
                key={session.sessionId}
                className="row-clickable"
                tabIndex={0}
                onClick={() => onNavigate(`/agents/${session.sessionId}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onNavigate(`/agents/${session.sessionId}`)
                  }
                }}
              >
                <td data-label="Client">
                  <strong>{clientLabel(session)}</strong>
                  <div className="row-secondary mono">
                    <Id value={session.sessionId} />
                  </div>
                </td>
                <td data-label="Last seen" title={new Date(session.lastSeen).toISOString()}>
                  {formatRelative(session.lastSeen)}
                </td>
                <td data-label="Reads" className="numeric">
                  {formatNumber(session.reads)}
                </td>
                <td data-label="Tools" className="numeric">
                  {formatNumber(session.toolCalls)}
                </td>
                <td data-label="Evidence" className="numeric">
                  {formatNumber(session.evidenceCount)}
                </td>
                <td data-label="Outcomes">
                  <Badge tone={outcomeTone(session)}>
                    {session.outcomes.ok} ok · {session.outcomes.notFound} not found ·{' '}
                    {session.outcomes.error} error
                  </Badge>
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>
      )}

      <p className="muted page-footnote">
        Attribution is a label, not authorization. Session ids are local and random;
        header text is capped and stripped of control characters before it is shown.
      </p>
    </PageLayout>
  )
}
