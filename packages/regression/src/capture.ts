import { randomBytes } from 'node:crypto'
import {
  fingerprint,
  redactText,
  stripUrlQueryInText,
  type DiagnosticFinding,
  type StackNextError,
  type TraceDetail,
} from '@stacknext/core'
import {
  diagnosticErrorFingerprint,
  sqlFingerprint,
  sqlPreview,
} from '@stacknext/diagnostics'
import type {
  CapturedError,
  CapturedFinding,
  CapturedQuery,
  CapturedSample,
  CapturedSpan,
  CapturedTrace,
  SampleSubmission,
  ScenarioIdentity,
} from './schema.js'
import { spanIdentity, traceIdentity } from './identity.js'

export interface CorrelationVerification {
  verified: boolean
  reason?: string
}

/**
 * Proves that a trace belongs to the injected Playwright request. Matching the
 * random trace id alone is not enough: a server span must name the injected
 * span id as its parent.
 */
export function verifyTraceCorrelation(
  detail: TraceDetail,
  traceId: string,
  injectedSpanId: string,
): CorrelationVerification {
  if (detail.traceId.toLowerCase() !== traceId.toLowerCase()) {
    return { verified: false, reason: 'trace-id-mismatch' }
  }
  if (detail.spans.length === 0) {
    return { verified: false, reason: 'trace-has-no-spans' }
  }
  const parent = injectedSpanId.toLowerCase()
  const linked = detail.spans.some(
    (span) => span.parentSpanId?.toLowerCase() === parent,
  )
  if (!linked) {
    return { verified: false, reason: 'injected-parent-not-found' }
  }
  return { verified: true }
}

function shortText(value: string, maxLength: number): string {
  return stripUrlQueryInText(redactText(value, maxLength))
}

function capturedSpan(span: TraceDetail['spans'][number]): CapturedSpan {
  const identity = spanIdentity(span)
  return {
    key: identity.key,
    name: identity.name,
    kind: span.kind,
    category: identity.category,
    durationMs: Math.round(span.durationMs * 1_000) / 1_000,
    status: span.status,
    ...(span.nextSpanType ? { nextSpanType: shortText(span.nextSpanType, 200) } : {}),
  }
}

function capturedQuery(query: TraceDetail['databaseQueries'][number]): CapturedQuery {
  const shape = sqlPreview(query.sql)
  return {
    key: sqlFingerprint(query.sql),
    shape,
    durationMs: query.durationMs,
    source: query.source,
    success: query.success,
  }
}

function capturedError(error: StackNextError): CapturedError {
  const route = error.route ?? error.requestPath ?? null
  return {
    key: diagnosticErrorFingerprint(error),
    name: shortText(error.name, 200),
    message: shortText(error.message, 600),
    route: route ? shortText(route, 500) : null,
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/** Converts one correlated collector trace into bounded, id-free scenario evidence. */
export function capturedTraceFromDetail(
  detail: TraceDetail,
  injectedSpanId: string,
): CapturedTrace {
  const identity = traceIdentity(detail)
  const root =
    detail.spans.find((span) => !span.parentSpanId) ??
    [...detail.spans].sort((a, b) => a.startTime - b.startTime)[0]
  const spans = detail.spans
    .map(capturedSpan)
    .sort(
      (a, b) =>
        compareStrings(a.key, b.key) ||
        b.durationMs - a.durationMs ||
        compareStrings(a.status, b.status),
    )
    .slice(0, 500)
  const queries = detail.databaseQueries
    .map(capturedQuery)
    .sort(
      (a, b) =>
        compareStrings(a.key, b.key) ||
        (a.durationMs ?? -1) - (b.durationMs ?? -1) ||
        Number(a.success) - Number(b.success),
    )
    .slice(0, 200)
  const errors = detail.errors
    .map(capturedError)
    .sort(
      (a, b) =>
        compareStrings(a.key, b.key) ||
        compareStrings(a.name, b.name) ||
        compareStrings(a.message, b.message),
    )
    .slice(0, 100)
  return {
    traceId: detail.traceId.toLowerCase(),
    injectedSpanId: injectedSpanId.toLowerCase(),
    key: identity.key,
    method: identity.method,
    route: identity.route,
    rootName: identity.rootName,
    statusCode: detail.request?.statusCode ?? root?.statusCode ?? null,
    durationMs: Math.round(detail.durationMs * 1_000) / 1_000,
    spanCount: detail.spans.length,
    errorCount: detail.errors.length,
    databaseQueryCount: detail.databaseQueries.length,
    fetchCount: spans.filter((span) => span.category === 'http').length,
    spans,
    queries,
    errors,
  }
}

export function capturedFinding(finding: DiagnosticFinding): CapturedFinding {
  return {
    key: fingerprint([finding.ruleId, finding.fingerprint]),
    ruleId: finding.ruleId,
    category: finding.category,
    severity: finding.severity,
    status: finding.status,
  }
}

export function dedupeCapturedFindings(
  findings: CapturedFinding[],
): CapturedFinding[] {
  const unique = new Map<string, CapturedFinding>()
  for (const finding of findings) {
    if (!unique.has(finding.key)) unique.set(finding.key, finding)
  }
  return [...unique.values()].sort((a, b) => compareStrings(a.key, b.key))
}

export function capturedFindings(findings: DiagnosticFinding[]): CapturedFinding[] {
  return dedupeCapturedFindings(findings.map(capturedFinding))
}

export interface SampleEvidenceInput {
  submission: SampleSubmission
  lookupTrace: (traceId: string) => TraceDetail | null
  findingsForTrace: (traceId: string) => DiagnosticFinding[]
}

/**
 * Builds the stored sample from collector state. A sample is verified only when
 * every submitted trace exists and proves the injected parent relationship.
 * Missing telemetry is recorded as incomplete instead of being ignored.
 */
export function capturedSampleFromSubmission(
  input: SampleEvidenceInput,
): CapturedSample {
  const reasons = new Set<string>()
  const traces: CapturedTrace[] = []
  const findings: CapturedFinding[] = []
  const seen = new Set<string>()
  let references = 0
  for (const reference of input.submission.traces) {
    const key = `${reference.traceId.toLowerCase()}:${reference.injectedSpanId.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    references += 1
    const detail = input.lookupTrace(reference.traceId)
    if (!detail) {
      reasons.add('trace-not-found')
      continue
    }
    const verification = verifyTraceCorrelation(
      detail,
      reference.traceId,
      reference.injectedSpanId,
    )
    if (!verification.verified) {
      reasons.add(verification.reason ?? 'correlation-unverified')
      continue
    }
    traces.push(capturedTraceFromDetail(detail, reference.injectedSpanId))
    findings.push(
      ...input.findingsForTrace(reference.traceId).map(capturedFinding),
    )
  }
  traces.sort(
    (a, b) =>
      compareStrings(a.key, b.key) ||
      compareStrings(a.rootName, b.rootName) ||
      compareStrings(a.traceId, b.traceId),
  )
  if (references === 0) reasons.add('no-request-trace-recorded')
  const verified = references > 0 && traces.length === references
  if (!verified && references > 0 && traces.length === 0) {
    reasons.add('no-verified-traces')
  }
  return {
    id: input.submission.id,
    status: input.submission.status,
    expectedStatus: input.submission.expectedStatus,
    retry: input.submission.retry,
    repeatEachIndex: input.submission.repeatEachIndex,
    durationMs: Math.round(input.submission.durationMs * 1_000) / 1_000,
    capturedAt: input.submission.capturedAt,
    correlation: {
      status: verified ? 'verified' : 'incomplete',
      reasons: [...reasons].sort().slice(0, 20),
      traces: traces.slice(0, 20),
    },
    findings: dedupeCapturedFindings(findings),
  }
}

/** Adds a sample once and returns the merged scenario evidence. */
export function mergeScenarioSample(input: {
  identity: ScenarioIdentity
  samples: CapturedSample[]
  previousFindings?: CapturedFinding[]
  notes?: string[]
  limitations?: string[]
}): {
  identity: ScenarioIdentity
  samples: CapturedSample[]
  findings: CapturedFinding[]
  notes: string[]
  limitations: string[]
} {
  const samples = [...input.samples].sort(
    (a, b) =>
      a.capturedAt - b.capturedAt ||
      a.retry - b.retry ||
      a.repeatEachIndex - b.repeatEachIndex ||
      compareStrings(a.id, b.id),
  )
  const findings = dedupeCapturedFindings([
    ...(input.previousFindings ?? []),
    ...samples.flatMap((sample) => sample.findings),
  ])
  return {
    identity: input.identity,
    samples: samples.slice(0, 100),
    findings,
    notes: [...new Set(input.notes ?? [])].slice(0, 30),
    limitations: [...new Set(input.limitations ?? [])].slice(0, 30),
  }
}

export function createSampleId(): string {
  return `smp-${randomBytes(8).toString('hex')}`
}

export function createRunId(): string {
  return `run-${randomBytes(8).toString('hex')}`
}

export function createBaselineId(): string {
  return `base-${randomBytes(8).toString('hex')}`
}

export function createComparisonId(): string {
  return `cmp-${randomBytes(8).toString('hex')}`
}
