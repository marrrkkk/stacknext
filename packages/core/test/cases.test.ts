import { describe, expect, it } from 'vitest'
import {
  CASE_FORMAT_VERSION,
  caseEventSchema,
  caseViewSchema,
  foldCaseEvents,
  type CaseEvent,
} from '../src/cases.js'

const ID = 'case_12345678-1234-4234-8234-123456789abc'

const created: CaseEvent = {
  kind: 'created',
  at: 10,
  actor: 'human',
  title: 'N+1 on /api/projects',
  hypothesis: 'One query per project',
  evidence: [{ kind: 'trace', id: 'a'.repeat(32) }],
  agentSessionId: null,
}

describe('investigation cases', () => {
  it('validates event kinds and rejects unknown ones', () => {
    expect(caseEventSchema.safeParse(created).success).toBe(true)
    expect(
      caseEventSchema.safeParse({ kind: 'unknown', at: 1, actor: 'human' }).success,
    ).toBe(false)
  })

  it('folds events deterministically and exposes a versioned view', () => {
    const events: CaseEvent[] = [
      { kind: 'closed', at: 40, actor: 'human', status: 'verified' },
      { kind: 'note_added', at: 30, actor: 'agent', text: 'checked the trace' },
      { kind: 'evidence_added', at: 20, actor: 'agent', evidence: { kind: 'error', id: 'error-1' } },
      created,
    ]
    const view = foldCaseEvents(events, ID)
    expect(view).not.toBeNull()
    expect(view?.version).toBe(CASE_FORMAT_VERSION)
    expect(view?.id).toBe(ID)
    expect(view?.title).toBe('N+1 on /api/projects')
    expect(view?.status).toBe('verified')
    expect(view?.evidence).toEqual([
      { kind: 'trace', id: 'a'.repeat(32) },
      { kind: 'error', id: 'error-1' },
    ])
    expect(view?.createdAt).toBe(10)
    expect(view?.updatedAt).toBe(40)
    expect(view?.events.map((event: CaseEvent) => event.at)).toEqual([10, 20, 30, 40])
    expect(caseViewSchema.safeParse(view).success).toBe(true)
  })

  it('ignores unknown event kinds and keeps the rest', () => {
    const events = [
      created,
      { kind: 'future_kind', at: 20, actor: 'agent', payload: 'ignored' },
      { kind: 'note_added', at: 30, actor: 'agent', text: 'note' },
    ] as unknown as CaseEvent[]
    const view = foldCaseEvents(events, ID)
    expect(view?.events).toHaveLength(2)
    expect(view?.updatedAt).toBe(30)
  })

  it('returns null without a created event and keeps verification nullable', () => {
    expect(foldCaseEvents([], ID)).toBeNull()
    const view = foldCaseEvents([created], ID)
    expect(view?.verification).toBeNull()
    expect(view?.status).toBe('open')
    expect(view?.agentSessionId).toBeNull()
  })
})
