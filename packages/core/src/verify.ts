import type { DiagnosticFinding } from './diagnostics.js'
import type { RequestSummary, TraceDetail } from './types.js'

/** Deterministic, bounded checks over already-fetched evidence. No I/O here. */
export const VERIFY_SAMPLE_LIMIT = 20
export const VERIFY_MAX_SINCE_MS = 86_400_000

export type VerificationOutcome = 'supported' | 'contradicted' | 'unverifiable'

export interface VerificationCheck {
  predicate: string
  expected: unknown
  observed: unknown
  passed: boolean
  evidence: string[]
  reason?: string
}

export interface VerificationResult {
  claim: string
  result: VerificationOutcome
  checks: VerificationCheck[]
  revision: number
  sampleSize: number
}

function unverifiable(
  claim: string,
  predicate: string,
  expected: unknown,
  reason: string,
  evidence: string[],
  revision: number,
): VerificationResult {
  return {
    claim,
    result: 'unverifiable',
    checks: [
      {
        predicate,
        expected,
        observed: null,
        passed: false,
        evidence,
        reason,
      },
    ],
    revision,
    sampleSize: evidence.length,
  }
}

function outcome(checks: VerificationCheck[]): VerificationOutcome {
  if (checks.some((check) => !check.passed && check.reason)) return 'unverifiable'
  if (checks.every((check) => check.passed)) return 'supported'
  return 'contradicted'
}

/** Checks one request's root status against an exact expected code. */
export function verifyRequestStatus(input: {
  traceId: string
  expectedStatus: number
  trace: TraceDetail | null
  revision?: number
}): VerificationResult {
  const revision = input.revision ?? 0
  const claim = `trace ${input.traceId} request status equals ${input.expectedStatus}`
  if (!input.trace || input.trace.traceId !== input.traceId) {
    return unverifiable(
      claim,
      'requestStatus',
      input.expectedStatus,
      'No matching trace evidence was fetched.',
      [],
      revision,
    )
  }
  const root =
    input.trace.spans.find((span) => span.kind === 'server' && !span.parentSpanId) ??
    input.trace.spans.find((span) => span.kind === 'server') ??
    null
  const observed = root?.statusCode ?? input.trace.request?.statusCode ?? null
  if (observed === null) {
    return unverifiable(
      claim,
      'requestStatus',
      input.expectedStatus,
      'The trace has no root request status.',
      [input.traceId],
      revision,
    )
  }
  const passed = observed === input.expectedStatus
  return {
    claim,
    result: passed ? 'supported' : 'contradicted',
    checks: [
      { predicate: 'requestStatus', expected: input.expectedStatus, observed, passed, evidence: [input.traceId] },
    ],
    revision,
    sampleSize: 1,
  }
}

/**
 * Checks that each sampled request on a route stays within a query-count cap.
 * Ambiguous correlation, missing traces and null durations make the check
 * unverifiable rather than a pass.
 */
export function verifyMaxDatabaseQueries(input: {
  route: string
  maxQueries: number
  since: number
  requests: RequestSummary[]
  traces: TraceDetail[]
  revision?: number
}): VerificationResult {
  const revision = input.revision ?? 0
  const claim = `route ${input.route} issues at most ${input.maxQueries} database queries per sampled request`
  const sampled = input.requests
    .filter((request) => request.route === input.route && request.timestamp >= input.since)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, VERIFY_SAMPLE_LIMIT)
  if (sampled.length === 0) {
    return unverifiable(
      claim,
      'maxDatabaseQueries',
      input.maxQueries,
      'No matching requests were fetched in the bounded sample.',
      [],
      revision,
    )
  }
  const traces = new Map(input.traces.map((trace) => [trace.traceId, trace]))
  const checks: VerificationCheck[] = []
  for (const request of sampled) {
    const trace = traces.get(request.traceId)
    if (!trace || trace.traceId !== request.traceId) {
      checks.push({
        predicate: 'maxDatabaseQueries',
        expected: input.maxQueries,
        observed: null,
        passed: false,
        evidence: [request.traceId],
        reason: 'No correlated trace was fetched for this request.',
      })
      continue
    }
    const queries = trace.databaseQueries.filter((query) => query.traceId === trace.traceId)
    if (queries.some((query) => query.durationMs === null)) {
      checks.push({
        predicate: 'maxDatabaseQueries',
        expected: input.maxQueries,
        observed: null,
        passed: false,
        evidence: [trace.traceId],
        reason: 'At least one query duration is null, so the sample is unmeasured.',
      })
      continue
    }
    const observed = queries.length
    checks.push({
      predicate: 'maxDatabaseQueries',
      expected: input.maxQueries,
      observed,
      passed: observed <= input.maxQueries,
      evidence: [trace.traceId],
    })
  }
  return {
    claim,
    result: outcome(checks),
    checks,
    revision,
    sampleSize: sampled.length,
  }
}

/** Optional bounded check for the CLI's --max-duration form. */
export function verifyMaxRequestDuration(input: {
  route: string
  maxDurationMs: number
  since: number
  requests: RequestSummary[]
  revision?: number
}): VerificationResult {
  const revision = input.revision ?? 0
  const claim = `route ${input.route} completes within ${input.maxDurationMs} ms per sampled request`
  const sampled = input.requests
    .filter((request) => request.route === input.route && request.timestamp >= input.since)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, VERIFY_SAMPLE_LIMIT)
  if (sampled.length === 0) {
    return unverifiable(
      claim,
      'maxRequestDuration',
      input.maxDurationMs,
      'No matching requests were fetched in the bounded sample.',
      [],
      revision,
    )
  }
  const checks = sampled.map<VerificationCheck>((request) => ({
    predicate: 'maxRequestDuration',
    expected: input.maxDurationMs,
    observed: request.durationMs,
    passed: request.durationMs !== null && request.durationMs <= input.maxDurationMs,
    evidence: [request.traceId],
    ...(request.durationMs === null
      ? { reason: 'Request duration is null, so it is unmeasured.' }
      : {}),
  }))
  return {
    claim,
    result: outcome(checks),
    checks,
    revision,
    sampleSize: sampled.length,
  }
}

/** Checks a deterministic finding's status against an exact expected status. */
export function verifyDiagnosticStatus(input: {
  diagnosticId: string
  expectedStatus: DiagnosticFinding['status']
  diagnostic: DiagnosticFinding | null
  revision?: number
}): VerificationResult {
  const revision = input.revision ?? 0
  const claim = `diagnostic ${input.diagnosticId} status equals ${input.expectedStatus}`
  if (!input.diagnostic || input.diagnostic.id !== input.diagnosticId) {
    return unverifiable(
      claim,
      'diagnosticStatus',
      input.expectedStatus,
      'No matching finding was fetched.',
      [],
      revision,
    )
  }
  const observed = input.diagnostic.status
  const passed = observed === input.expectedStatus
  return {
    claim,
    result: passed ? 'supported' : 'contradicted',
    checks: [
      {
        predicate: 'diagnosticStatus',
        expected: input.expectedStatus,
        observed,
        passed,
        evidence: [input.diagnosticId],
      },
    ],
    revision,
    sampleSize: 1,
  }
}
