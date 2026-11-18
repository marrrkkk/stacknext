import { z } from 'zod'

export const CASE_FORMAT_VERSION = 1
export const CASE_EVIDENCE_KINDS = [
  'trace',
  'error',
  'diagnostic',
  'comparison',
  'snapshot',
] as const
export const CASE_STATUSES = ['open', 'verified', 'refuted', 'abandoned'] as const

export const caseEvidenceKindSchema = z.enum(CASE_EVIDENCE_KINDS)
export const caseStatusSchema = z.enum(CASE_STATUSES)

export const caseEvidenceSchema = z.object({
  kind: caseEvidenceKindSchema,
  id: z.string().min(1).max(128),
})

const actorSchema = z.string().min(1).max(128)

export const caseCreatedEventSchema = z.object({
  kind: z.literal('created'),
  at: z.number().int().nonnegative(),
  actor: actorSchema,
  title: z.string().min(1).max(200),
  hypothesis: z.string().max(2_000).nullable().optional(),
  evidence: z.array(caseEvidenceSchema).max(100).optional(),
  agentSessionId: z.string().min(1).max(128).nullable().optional(),
})

export const caseEvidenceAddedEventSchema = z.object({
  kind: z.literal('evidence_added'),
  at: z.number().int().nonnegative(),
  actor: actorSchema,
  evidence: caseEvidenceSchema,
})

export const caseNoteAddedEventSchema = z.object({
  kind: z.literal('note_added'),
  at: z.number().int().nonnegative(),
  actor: actorSchema,
  text: z.string().min(1).max(2_000),
})

export const caseVerificationAddedEventSchema = z.object({
  kind: z.literal('verification_added'),
  at: z.number().int().nonnegative(),
  actor: actorSchema,
  verification: z.unknown(),
})

export const caseClosedEventSchema = z.object({
  kind: z.literal('closed'),
  at: z.number().int().nonnegative(),
  actor: actorSchema,
  status: z.enum(['verified', 'refuted', 'abandoned']),
})

export const caseEventSchema = z.discriminatedUnion('kind', [
  caseCreatedEventSchema,
  caseEvidenceAddedEventSchema,
  caseNoteAddedEventSchema,
  caseVerificationAddedEventSchema,
  caseClosedEventSchema,
])

export type CaseEvidenceKind = z.infer<typeof caseEvidenceKindSchema>
export type CaseStatus = z.infer<typeof caseStatusSchema>
export type CaseEvidence = z.infer<typeof caseEvidenceSchema>
export type CaseEvent = z.infer<typeof caseEventSchema>
export type CaseCreatedEvent = z.infer<typeof caseCreatedEventSchema>

export const caseViewSchema = z.object({
  version: z.literal(CASE_FORMAT_VERSION),
  id: z.string().min(1).max(128),
  title: z.string(),
  status: caseStatusSchema,
  hypothesis: z.string().nullable(),
  evidence: z.array(caseEvidenceSchema),
  agentSessionId: z.string().nullable(),
  verification: z.unknown().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  events: z.array(caseEventSchema),
})

export type CaseView = z.infer<typeof caseViewSchema>

/**
 * Folds append-only events into one current view. Unknown event kinds are
 * ignored so a newer writer cannot break an older reader. Events are ordered by
 * timestamp with the original index as a tie-breaker, which keeps the result
 * deterministic even when a file is read out of order.
 */
export function foldCaseEvents(
  events: readonly CaseEvent[],
  id = 'case_unknown',
): CaseView | null {
  const ordered = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => caseEventSchema.safeParse(event).success)
    .sort((a, b) => a.event.at - b.event.at || a.index - b.index)
    .map(({ event }) => event as CaseEvent)

  const created = ordered.find(
    (event): event is CaseCreatedEvent => event.kind === 'created',
  )
  if (!created) return null

  const evidence: CaseEvidence[] = []
  for (const event of ordered) {
    if (event.kind === 'evidence_added') evidence.push(event.evidence)
    else if (event.kind === 'created' && event.evidence) evidence.push(...event.evidence)
  }

  const closed = [...ordered].reverse().find((event) => event.kind === 'closed')
  const verificationEvent = [...ordered]
    .reverse()
    .find((event) => event.kind === 'verification_added')

  return {
    version: CASE_FORMAT_VERSION,
    id,
    title: created.title,
    status: closed && closed.kind === 'closed' ? closed.status : 'open',
    hypothesis: created.hypothesis ?? null,
    evidence,
    agentSessionId: created.agentSessionId ?? null,
    verification:
      verificationEvent && verificationEvent.kind === 'verification_added'
        ? (verificationEvent.verification ?? null)
        : null,
    createdAt: created.at,
    updatedAt: ordered.length > 0 ? (ordered[ordered.length - 1]?.at ?? created.at) : created.at,
    events: ordered,
  }
}
