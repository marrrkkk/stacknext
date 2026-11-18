import { describe, expect, it } from 'vitest'
import {
  AgentActivityStore,
  evidenceIdsFromPath,
  isRecordId,
  isSessionId,
  sanitizeAttribution,
} from '../src/collector/agent-activity.js'

const SESSION = '11111111-2222-3333-4444-555555555555'
const OTHER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

function input(overrides: Partial<Parameters<AgentActivityStore['record']>[0]> = {}) {
  return {
    sessionId: SESSION,
    clientName: 'opencode',
    clientVersion: '1.2.3',
    tool: 'get_trace',
    pathname: '/api/traces/' + 'a'.repeat(32),
    filterKeys: ['q', 'limit', 'route'],
    evidenceIds: ['a'.repeat(32)],
    status: 200,
    durationMs: 12,
    at: 1_000,
    ...overrides,
  }
}

describe('agent activity store', () => {
  it('validates session and record ids as bounded opaque strings', () => {
    expect(isSessionId(SESSION)).toBe(true)
    expect(isSessionId('../etc/passwd')).toBe(false)
    expect(isSessionId('x'.repeat(200))).toBe(false)
    expect(isRecordId('a'.repeat(32))).toBe(true)
    expect(isRecordId('../secret')).toBe(false)
    expect(isRecordId('x'.repeat(200))).toBe(false)
  })

  it('extracts evidence ids only from known detail routes', () => {
    const trace = 'a'.repeat(32)
    expect(evidenceIdsFromPath(`/api/traces/${trace}`)).toEqual([trace])
    expect(evidenceIdsFromPath(`/api/requests/${trace}`)).toEqual([trace])
    expect(evidenceIdsFromPath('/api/errors/error-1')).toEqual(['error-1'])
    expect(evidenceIdsFromPath('/api/diagnostics/diag-1234abcd-5678ef90')).toEqual([
      'diag-1234abcd-5678ef90',
    ])
    expect(evidenceIdsFromPath(`/api/snapshots/snap-0123456789abcdef/traces/${trace}`)).toEqual([
      'snap-0123456789abcdef',
      trace,
    ])
    expect(evidenceIdsFromPath('/api/traces')).toEqual([])
    expect(evidenceIdsFromPath('/api/traces/not-an-id')).toEqual([])
    expect(() => evidenceIdsFromPath('/api/errors/%ZZ')).not.toThrow()
    expect(evidenceIdsFromPath('/api/errors/%ZZ')).toEqual([])
  })

  it('strips control characters and caps hostile header values', () => {
    expect(sanitizeAttribution('open\u202Ecode\u200B'.repeat(10), 12)).toBe(
      'opencodeopen… [truncated]',
    )
    expect(sanitizeAttribution(null, 12)).toBeNull()
    expect(sanitizeAttribution('   ', 12)).toBeNull()
    const store = new AgentActivityStore(() => 1_000)
    store.record(input({ clientName: 'evil\u0000\u202Eclient', tool: 'get\u200Btrace' }))
    const session = store.session(SESSION)
    expect(session?.client?.name).toBe('evilclient')
    const events = store.eventsFor(SESSION).events
    expect(events[0]?.tool).toBe('gettrace')
    expect(JSON.stringify(events)).not.toMatch(/[\u0000\u202E\u200B]/)
  })

  it('records sorted filter keys only, never values', () => {
    const store = new AgentActivityStore(() => 1_000)
    store.record(
      input({
        pathname: '/api/requests',
        filterKeys: ['q', 'limit', 'route', 'q'],
        evidenceIds: [],
      }),
    )
    const event = store.eventsFor(SESSION).events[0]
    expect(event?.filterKeys).toEqual(['limit', 'q', 'route'])
    expect(JSON.stringify(event)).not.toContain('?q=')
    expect(JSON.stringify(event)).not.toContain('demo-url-secret')
  })

  it('caps sessions and events with an explicit drop counter', () => {
    const store = new AgentActivityStore(() => 1_000)
    for (let index = 0; index < 60; index += 1) {
      store.record(
        input({
          sessionId: `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
          at: 1_000 + index,
        }),
      )
    }
    expect(store.sessions().length).toBe(50)
    expect(store.droppedCount).toBeGreaterThan(0)

    const single = new AgentActivityStore(() => 2_000)
    for (let index = 0; index < 600; index += 1) {
      single.record(input({ at: 2_000 + index }))
    }
    expect(single.eventsFor(SESSION).total).toBe(500)
    expect(single.droppedCount).toBeGreaterThanOrEqual(100)
  })

  it('expires events after the TTL and drops invalid session headers', () => {
    const now = { value: 1_000 }
    const store = new AgentActivityStore(() => now.value)
    store.record(input({ at: 1_000 }))
    store.record(input({ sessionId: 'not-a-uuid', at: 1_000 }))
    expect(store.eventsFor(SESSION).total).toBe(1)
    expect(store.droppedCount).toBe(1)
    now.value = 1_000 + 30 * 60 * 1_000 + 1
    expect(store.sessions()).toEqual([])
    expect(store.droppedCount).toBe(2)
  })

  it('looks up reads by evidence id for the read-by chip', () => {
    const store = new AgentActivityStore(() => 1_000)
    const trace = 'a'.repeat(32)
    store.record(input({ sessionId: SESSION }))
    store.record(input({ sessionId: OTHER, evidenceIds: [], status: 404 }))
    const reads = store.byRecord(trace, 50)
    expect(reads).toHaveLength(1)
    expect(reads[0]?.sessionId).toBe(SESSION)
    expect(store.byRecord('../secret')).toEqual([])
  })
})
