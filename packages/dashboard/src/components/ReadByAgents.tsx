import type { AgentReadsResponse } from '@stacknext/core'
import { api } from '../api'
import { useAsync } from '../hooks'
import { Badge } from './ui'
import { Icon } from './Icon'

/**
 * Non-blocking reverse lookup chip. Missing or unavailable audit data never
 * changes the detail page: the chip simply stays hidden.
 */
export function ReadByAgents({
  recordId,
  onNavigate,
}: {
  recordId: string
  onNavigate?: (path: string) => void
}): React.ReactElement | null {
  const state = useAsync<AgentReadsResponse>(
    (signal) => api.agentReads(recordId, signal),
    `agent-reads:${recordId}`,
    0,
    10_000,
  )
  const sessions = state.data?.sessions ?? []
  if (sessions.length === 0) return null
  const label = `Read by ${sessions.length} agent${sessions.length === 1 ? '' : 's'}`
  const target =
    sessions.length === 1 ? `/agents/${sessions[0]?.sessionId}` : '/agents'
  return (
    <button
      type="button"
      className="agent-read-chip"
      title={`${label} in the local audit within the last 30 minutes`}
      onClick={() => onNavigate?.(target)}
    >
      <Badge tone="muted">
        <Icon name="terminal" size={12} /> {label}
      </Badge>
    </button>
  )
}
