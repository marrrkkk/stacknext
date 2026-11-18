import { randomUUID } from 'node:crypto'
import {
  sanitizeUntrustedText,
  type AgentClientIdentity,
  type AgentReadEvent,
  type AgentSessionSummary,
} from '@stacknext/core'

/** Bounded in-memory audit of local MCP reads. No query values are kept. */
const MAX_EVENTS = 500
const MAX_SESSIONS = 50
const TTL_MS = 30 * 60 * 1_000
const SESSION_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
const DETAIL_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

export interface AgentReadInput {
  sessionId: string
  clientName: string | null
  clientVersion: string | null
  tool: string | null
  pathname: string
  filterKeys: string[]
  evidenceIds: string[]
  status: number
  durationMs: number
  at: number
}

/** Treats every header value as untrusted attribution, never as authority. */
export function sanitizeAttribution(value: string | null, max: number): string | null {
  if (value === null) return null
  const clean = sanitizeUntrustedText(value, max).trim()
  return clean.length > 0 ? clean : null
}

export function isSessionId(value: string): boolean {
  return SESSION_PATTERN.test(value)
}

export function isRecordId(value: string): boolean {
  return OPAQUE_ID_PATTERN.test(value) && !value.includes('/')
}

/** Ids are read only from known detail routes; the query string is ignored. */
export function evidenceIdsFromPath(pathname: string): string[] {
  const segments = pathname.split('/').filter(Boolean)
  const ids: string[] = []
  const push = (value: string | undefined, pattern = DETAIL_ID_PATTERN): void => {
    if (!value) return
    // Path segments come from an untrusted request line. Malformed percent
    // escapes must not throw after the response has already been sent.
    try {
      if (pattern.test(decodeURIComponent(value))) ids.push(value)
    } catch {
      // Skip ids we cannot decode; the pathname itself is still recorded.
    }
  }
  if (segments[0] === 'api' && segments[2]) {
    const group = segments[1]
    if (group === 'traces' || group === 'requests') {
      if (/^[0-9a-f]{32}$/i.test(segments[2])) push(segments[2], /^[0-9a-f]{32}$/i)
    } else if (
      group === 'errors' ||
      group === 'diagnostics' ||
      group === 'test-runs' ||
      group === 'baselines' ||
      group === 'comparisons' ||
      group === 'snapshots'
    ) {
      push(segments[2])
    }
    if (group === 'snapshots' && segments[3] === 'traces' && segments[4]) {
      push(segments[4], /^[0-9a-f]{32}$/i)
    }
  }
  return [...new Set(ids)]
}

function outcomeOf(status: number): 'ok' | 'notFound' | 'error' {
  if (status >= 200 && status < 400) return 'ok'
  if (status === 404) return 'notFound'
  return 'error'
}

function summarize(events: AgentReadEvent[]): AgentSessionSummary[] {
  const bySession = new Map<string, AgentReadEvent[]>()
  for (const event of events) {
    const list = bySession.get(event.sessionId) ?? []
    list.push(event)
    bySession.set(event.sessionId, list)
  }
  const summaries: AgentSessionSummary[] = []
  for (const [sessionId, list] of bySession) {
    const outcomes = { ok: 0, notFound: 0, error: 0 }
    for (const event of list) outcomes[outcomeOf(event.status)] += 1
    summaries.push({
      sessionId,
      client: list[0]?.client ?? null,
      firstSeen: Math.min(...list.map((event) => event.at)),
      lastSeen: Math.max(...list.map((event) => event.at)),
      reads: list.length,
      toolCalls: list.filter((event) => event.tool !== null).length,
      evidenceCount: new Set(list.flatMap((event) => event.evidenceIds)).size,
      outcomes,
    })
  }
  return summaries.sort((a, b) => b.lastSeen - a.lastSeen)
}

export class AgentActivityStore {
  private events: AgentReadEvent[] = []
  private dropped = 0

  constructor(private readonly now: () => number = Date.now) {}

  get droppedCount(): number {
    return this.dropped
  }

  record(input: AgentReadInput): void {
    const at = input.at || this.now()
    this.prune(at)
    if (!isSessionId(input.sessionId)) {
      this.dropped += 1
      return
    }
    const sessionIds = new Set(this.events.map((event) => event.sessionId))
    if (!sessionIds.has(input.sessionId) && sessionIds.size >= MAX_SESSIONS) {
      this.dropped += 1
      return
    }
    const clientName = sanitizeAttribution(input.clientName, 128)
    const clientVersion = sanitizeAttribution(input.clientVersion, 128)
    const client: AgentClientIdentity | null =
      clientName || clientVersion
        ? { name: clientName ?? 'unknown', version: clientVersion ?? 'unknown' }
        : null
    const event: AgentReadEvent = {
      id: `evt_${randomUUID()}`,
      sessionId: input.sessionId,
      client,
      tool: sanitizeAttribution(input.tool, 128),
      // Pathname only: build it from a validated path, never from the raw URL.
      path: sanitizeAttribution(input.pathname, 512) ?? '/',
      filterKeys: [...new Set(input.filterKeys)]
        .map((key) => sanitizeAttribution(key, 128) ?? '')
        .filter(Boolean)
        .sort(),
      evidenceIds: input.evidenceIds.slice(0, 20),
      status: input.status,
      durationMs: Math.max(0, Math.min(input.durationMs, 600_000)),
      at,
    }
    this.events.push(event)
    if (this.events.length > MAX_EVENTS) {
      this.dropped += this.events.length - MAX_EVENTS
      this.events = this.events.slice(-MAX_EVENTS)
    }
  }

  private prune(at: number): void {
    const cutoff = at - TTL_MS
    const before = this.events.length
    this.events = this.events.filter((event) => event.at >= cutoff)
    this.dropped += before - this.events.length
  }

  sessions(): AgentSessionSummary[] {
    this.prune(this.now())
    return summarize(this.events)
  }

  session(sessionId: string): AgentSessionSummary | null {
    if (!isSessionId(sessionId)) return null
    return this.sessions().find((entry) => entry.sessionId === sessionId) ?? null
  }

  eventsFor(
    sessionId: string,
    limit = 50,
    offset = 0,
  ): { events: AgentReadEvent[]; total: number } {
    const matching = this.events
      .filter((event) => event.sessionId === sessionId)
      .sort((a, b) => b.at - a.at)
    return { events: matching.slice(offset, offset + limit), total: matching.length }
  }

  byRecord(recordId: string, limit = 50): AgentReadEvent[] {
    if (!isRecordId(recordId)) return []
    return this.events
      .filter((event) => event.evidenceIds.includes(recordId))
      .sort((a, b) => b.at - a.at)
      .slice(0, limit)
  }
}
