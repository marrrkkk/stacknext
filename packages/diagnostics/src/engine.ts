import {
  STACKNEXT_DIAGNOSTICS_FORMAT,
  STACKNEXT_DIAGNOSTICS_FORMAT_VERSION,
  STACKNEXT_DIAGNOSTICS_RULE_SET_VERSION,
  type DiagnosticCounts,
  type DiagnosticDetailResponse,
  type DiagnosticFilters,
  type DiagnosticFinding,
  type DiagnosticListResponse,
  type DiagnosticOverview,
  type DiagnosticReport,
  type DiagnosticSample,
  type DiagnosticSnapshot,
  type DiagnosticTraceContext,
  type StackNextConfig,
} from '@stacknext/core'
import { isControlFlowError } from './fingerprints.js'
import { evaluateDiagnosticRules, findingMatchesTrace } from './rules.js'
import { buildTraceIndex, type DiagnosticTraceIndex } from './trace.js'

export const DIAGNOSTICS_ENGINE_VERSION = '0.11.0'

export interface DiagnosticEngineOptions {
  projectName: string
  collectorVersion: string
  config: StackNextConfig['diagnostics']
  /** Top-level request threshold; defaults to 500 ms when omitted. */
  slowRequestMs?: number
  generatedAt?: number
  connected?: boolean
  connectedInstances?: number
  engineVersion?: string
}

const REPORT_LIMITATIONS = [
  'Findings are deterministic heuristics over the current in-memory sample, not confirmed root causes.',
  'StackNext does not read application source, run EXPLAIN, inspect query plans or modify code.',
  'Null durations are unknown, not zero. Self time subtracts the union of direct child intervals and is approximate.',
  'Request-level rules only analyze traces with a captured request root; detached spans are excluded and noted.',
  'Only OpenTelemetry and adapter evidence received by the collector is analyzed.',
  'Redaction and truncation may reduce the specificity of SQL and error signatures.',
]

function emptyCounts(): DiagnosticCounts {
  return {
    total: 0,
    bySeverity: { info: 0, warning: 0, error: 0 },
    byCategory: {
      database: 0,
      http: 0,
      performance: 0,
      errors: 0,
      runtime: 0,
    },
    byStatus: {
      observed: 0,
      'insufficient-evidence': 0,
      possible: 0,
    },
  }
}

export function countFindings(findings: DiagnosticFinding[]): DiagnosticCounts {
  const counts = emptyCounts()
  counts.total = findings.length
  for (const finding of findings) {
    counts.bySeverity[finding.severity] += 1
    counts.byCategory[finding.category] += 1
    counts.byStatus[finding.status] += 1
  }
  return counts
}

function sampleFor(
  snapshot: DiagnosticSnapshot,
  index: DiagnosticTraceIndex,
  options: DiagnosticEngineOptions,
): DiagnosticSample {
  const ignoredControlFlowErrors = snapshot.errors.filter(isControlFlowError).length
  const errorTraceIds = new Set(
    snapshot.errors
      .filter((error) => !isControlFlowError(error))
      .map((error) => error.resolvedTraceId ?? error.traceId ?? null)
      .filter((traceId): traceId is string => Boolean(traceId)),
  )
  const serverErrorsWithoutError = index.requestTraces.filter(
    (trace) =>
      trace.statusCode !== null &&
      trace.statusCode >= 500 &&
      trace.statusCode <= 599 &&
      !errorTraceIds.has(trace.traceId),
  ).length
  return {
    firstEventTime: snapshot.firstEventTime,
    lastEventTime: snapshot.lastEventTime,
    retentionMs: snapshot.retentionMs,
    requests: snapshot.requests.length,
    spans: snapshot.spans.length,
    errors: snapshot.errors.length,
    databaseQueries: snapshot.databaseQueries.length,
    connectedInstances: options.connectedInstances ?? 0,
    connected: options.connected ?? false,
    requestTraces: index.requestTraces.length,
    tracesWithoutRequestRoot: index.tracesWithoutRequestRoot.filter(
      (trace) => trace.nodes.length > 0,
    ).length,
    tracesWithMissingParents: index.requestTraces.filter(
      (trace) => index.missingParentTraceIds.has(trace.traceId),
    ).length,
    unattributedSpans: index.unattributedSpans,
    ignoredControlFlowErrors,
    serverErrorsWithoutError,
  }
}

function buildNotes(
  snapshot: DiagnosticSnapshot,
  sample: DiagnosticSample,
  totalFindings: number,
  visibleFindings: number,
  config: StackNextConfig['diagnostics'],
): string[] {
  const notes: string[] = []
  if (!config.enabled) {
    notes.push('Diagnostics are disabled by configuration.')
    return notes
  }
  if (
    snapshot.spans.length === 0 &&
    snapshot.errors.length === 0 &&
    snapshot.databaseQueries.length === 0
  ) {
    notes.push('No telemetry is available in the current retention window.')
    return notes
  }
  if (totalFindings === 0) {
    notes.push('No diagnostic findings matched the configured rules in the current sample.')
  }
  if (totalFindings > visibleFindings) {
    notes.push(
      `Showing the top ${visibleFindings} of ${totalFindings} findings. Narrow the filters or raise diagnostics.maxFindings to inspect the rest.`,
    )
  }
  if (sample.tracesWithoutRequestRoot !== undefined && sample.tracesWithoutRequestRoot > 0) {
    notes.push(
      `${sample.tracesWithoutRequestRoot} trace${sample.tracesWithoutRequestRoot === 1 ? '' : 's'} had spans but no captured request root; request-level rules ignored them.`,
    )
  }
  if (
    sample.tracesWithMissingParents !== undefined &&
    sample.tracesWithMissingParents > 0
  ) {
    notes.push(
      `${sample.tracesWithMissingParents} request trace${sample.tracesWithMissingParents === 1 ? '' : 's'} contain spans whose parent is not in the sample; attribution may be incomplete.`,
    )
  }
  if (sample.unattributedSpans !== undefined && sample.unattributedSpans > 0) {
    notes.push(
      `${sample.unattributedSpans} span${sample.unattributedSpans === 1 ? '' : 's'} could not be attributed to a request root and were excluded from request-level rules.`,
    )
  }
  if (
    sample.ignoredControlFlowErrors !== undefined &&
    sample.ignoredControlFlowErrors > 0
  ) {
    notes.push(
      `${sample.ignoredControlFlowErrors} Next.js control-flow error${sample.ignoredControlFlowErrors === 1 ? '' : 's'} (not-found/redirect) were ignored by the error rules.`,
    )
  }
  if (snapshot.databaseQueries.some((query) => query.durationMs === null)) {
    notes.push('One or more database queries have no measured duration; null is not treated as zero.')
  }
  return notes
}

export function generateDiagnosticReport(
  snapshot: DiagnosticSnapshot,
  options: DiagnosticEngineOptions,
): DiagnosticReport {
  const index = buildTraceIndex(snapshot)
  const evaluated = options.config.enabled
    ? evaluateDiagnosticRules({
        snapshot,
        config: options.config,
        slowRequestMs: options.slowRequestMs ?? 500,
        traceIndex: index,
      })
    : []
  const maxFindings = options.config.maxFindings
  const findings = evaluated.slice(0, maxFindings)
  const sample = sampleFor(snapshot, index, options)
  return {
    format: STACKNEXT_DIAGNOSTICS_FORMAT,
    version: STACKNEXT_DIAGNOSTICS_FORMAT_VERSION,
    engineVersion: options.engineVersion ?? DIAGNOSTICS_ENGINE_VERSION,
    ruleSetVersion: STACKNEXT_DIAGNOSTICS_RULE_SET_VERSION,
    generatedAt: options.generatedAt ?? Date.now(),
    projectName: options.projectName,
    collectorVersion: options.collectorVersion,
    sample,
    counts: countFindings(findings),
    findings,
    notes: buildNotes(snapshot, sample, evaluated.length, findings.length, options.config),
    limitations: [...REPORT_LIMITATIONS],
  }
}

function clampLimit(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value) || value === undefined) return fallback
  return Math.min(maximum, Math.max(1, Math.trunc(value)))
}

export function listDiagnosticFindings(
  report: DiagnosticReport,
  filters: DiagnosticFilters = {},
): DiagnosticListResponse {
  const q = filters.q?.trim().toLowerCase()
  const route = filters.route?.trim().toLowerCase()
  const traceId = filters.traceId?.trim()
  const items = report.findings.filter((finding) => {
    if (filters.category && finding.category !== filters.category) return false
    if (filters.severity && finding.severity !== filters.severity) return false
    if (filters.status && finding.status !== filters.status) return false
    if (filters.ruleId && finding.ruleId !== filters.ruleId) return false
    if (route && !finding.route?.toLowerCase().includes(route)) return false
    if (traceId && !findingMatchesTrace(finding, traceId)) return false
    if (filters.since !== undefined && finding.lastSeen < filters.since) return false
    if (filters.until !== undefined && finding.firstSeen > filters.until) return false
    if (
      q &&
      !(
        finding.title.toLowerCase().includes(q) ||
        finding.summary.toLowerCase().includes(q) ||
        finding.detail.toLowerCase().includes(q) ||
        finding.fingerprint.toLowerCase().includes(q) ||
        finding.route?.toLowerCase().includes(q) === true ||
        finding.ruleId.toLowerCase().includes(q)
      )
    ) {
      return false
    }
    return true
  })
  const total = items.length
  const limit = clampLimit(filters.limit, 50, 200)
  const offset = Math.max(0, Math.trunc(filters.offset ?? 0))
  return {
    items: items.slice(offset, offset + limit),
    total,
    limit,
    offset,
    generatedAt: report.generatedAt,
    engineVersion: report.engineVersion,
    ruleSetVersion: report.ruleSetVersion,
    sample: report.sample,
    counts: countFindings(items),
    notes: report.notes,
    limitations: report.limitations,
  }
}

function traceContext(
  traceId: string,
  snapshot: DiagnosticSnapshot,
): DiagnosticTraceContext | null {
  const spans = snapshot.spans
    .filter((span) => span.traceId === traceId)
    .sort((a, b) => a.startTime - b.startTime || a.spanId.localeCompare(b.spanId))
  const errors = snapshot.errors.filter(
    (error) => (error.resolvedTraceId ?? error.traceId ?? null) === traceId,
  )
  const databaseQueries = snapshot.databaseQueries.filter(
    (query) => query.resolvedTraceId === traceId,
  )
  if (spans.length === 0 && errors.length === 0 && databaseQueries.length === 0) return null
  const request = snapshot.requests.find((entry) => entry.traceId === traceId) ?? null
  const eventTimes = [
    ...spans.map((span) => span.startTime),
    ...errors.map((error) => error.timestamp),
    ...databaseQueries.map((query) => query.timestamp),
  ]
  const startTime = eventTimes.length > 0 ? Math.min(...eventTimes) : 0
  const endTime = spans.reduce((maximum, span) => Math.max(maximum, span.endTime), startTime)
  const presentSpanIds = new Set(spans.map((span) => span.spanId))
  const missingParentSpanIds = [
    ...new Set(
      spans
        .map((span) => span.parentSpanId)
        .filter(
          (parent): parent is string =>
            Boolean(parent) && !presentSpanIds.has(parent as string),
        ),
    ),
  ]
  return {
    traceId,
    request,
    startTime,
    endTime,
    durationMs: Math.max(0, endTime - startTime),
    spanCount: spans.length,
    errorCount: errors.length,
    databaseQueryCount: databaseQueries.length,
    spans,
    errors,
    databaseQueries,
    missingParentSpanIds,
  }
}

export function getDiagnosticDetail(
  report: DiagnosticReport,
  id: string,
  snapshot: DiagnosticSnapshot,
): DiagnosticDetailResponse | null {
  const finding = report.findings.find((entry) => entry.id === id)
  if (!finding) return null
  const traceId = finding.traceIds[0] ?? null
  return {
    finding,
    trace: traceId ? traceContext(traceId, snapshot) : null,
  }
}

export function diagnosticOverview(
  report: DiagnosticReport,
  topLimit = 5,
): DiagnosticOverview {
  return {
    generatedAt: report.generatedAt,
    engineVersion: report.engineVersion,
    ruleSetVersion: report.ruleSetVersion,
    sample: report.sample,
    counts: report.counts,
    topFindings: report.findings.slice(0, Math.max(1, Math.trunc(topLimit))),
    limitations: report.limitations,
  }
}
