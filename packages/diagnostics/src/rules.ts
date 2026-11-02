import {
  DIAGNOSTIC_RULES,
  fingerprint,
  redactText,
  stripUrlQueryInText,
  type DatabaseQueryListItem,
  type DiagnosticErrorEvidence,
  type DiagnosticFinding,
  type DiagnosticQueryEvidence,
  type DiagnosticSnapshot,
  type StackNextConfig,
  type StackNextDatabaseQuery,
  type StackNextError,
  type StackNextSpan,
  type RequestSummary,
} from '@stacknext/core'
import {
  diagnosticSpanCategory,
  safeRoute,
  safeSpanName,
  spanEvidence,
  spanHttpEndpoint,
  spanHttpMethod,
  spanThresholdMs,
} from './classify.js'
import {
  diagnosticErrorFingerprint,
  diagnosticFindingId,
  errorOperationCategory,
  sqlFingerprint,
  sqlPreview,
} from './fingerprints.js'

export interface DiagnosticRuleContext {
  snapshot: DiagnosticSnapshot
  config: StackNextConfig['diagnostics']
  requestByTrace: Map<string, RequestSummary>
}

const RULE_VERSION = 1

const SAMPLE_LIMITATION =
  'Only the current in-memory retention window is analyzed; findings disappear when evidence ages out.'

const NULL_DURATION_LIMITATION =
  'Database durations can be null when an adapter does not measure them. Null is never treated as zero.'

function ruleSummary(ruleId: DiagnosticFinding['ruleId']) {
  const rule = DIAGNOSTIC_RULES.find((entry) => entry.id === ruleId)
  if (!rule) throw new Error(`Unknown diagnostic rule: ${ruleId}`)
  return rule
}

function roundMs(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 10) / 10
}

function formatTimestamp(value: number): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'unknown time' : date.toISOString()
}

function shortText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}…`
}

function queryEvidence(query: StackNextDatabaseQuery): DiagnosticQueryEvidence {
  return {
    id: query.id,
    traceId: query.traceId ?? null,
    ...(query.spanId ? { spanId: query.spanId } : {}),
    sqlFingerprint: sqlFingerprint(query.sql),
    sqlPreview: sqlPreview(query.sql),
    durationMs: query.durationMs,
    databaseSystem: query.databaseSystem,
    ...(query.operation ? { operation: query.operation } : {}),
    success: query.success,
    timestamp: query.timestamp,
  }
}

function errorEvidence(
  error: StackNextError & { resolvedTraceId?: string | null },
  groupFingerprint: string,
): DiagnosticErrorEvidence {
  const route = safeRoute(error.route)
  return {
    id: error.id,
    name: shortText(stripUrlQueryInText(redactText(error.name, 200)), 200),
    message: shortText(stripUrlQueryInText(redactText(error.message, 600)), 600),
    timestamp: error.timestamp,
    ...(route ? { route } : {}),
    ...(error.method ? { method: error.method } : {}),
    traceId: error.resolvedTraceId ?? error.traceId ?? null,
    fingerprint: groupFingerprint,
  }
}

function routeForTrace(context: DiagnosticRuleContext, traceId: string): string | null {
  return safeRoute(context.requestByTrace.get(traceId)?.route)
}

function methodForTrace(context: DiagnosticRuleContext, traceId: string): string | null {
  return context.requestByTrace.get(traceId)?.method ?? null
}

function nPlusOneFindings(context: DiagnosticRuleContext): DiagnosticFinding[] {
  const groups = new Map<
    string,
    {
      traceId: string
      databaseSystem: string
      shape: string
      queries: DatabaseQueryListItem[]
    }
  >()
  for (const query of context.snapshot.databaseQueries) {
    const traceId = query.resolvedTraceId
    if (!traceId) continue
    const shape = sqlFingerprint(query.sql)
    if (shape === '') continue
    const key = `${traceId}\u0000${query.databaseSystem.toLowerCase()}\u0000${shape}`
    const existing = groups.get(key)
    if (existing) existing.queries.push(query)
    else {
      groups.set(key, {
        traceId,
        databaseSystem: query.databaseSystem,
        shape,
        queries: [query],
      })
    }
  }

  const findings: DiagnosticFinding[] = []
  for (const group of groups.values()) {
    if (group.queries.length < context.config.repeatedQueryMin) continue
    const queries = [...group.queries].sort((a, b) => a.timestamp - b.timestamp)
    const first = queries[0]
    const last = queries[queries.length - 1]
    if (!first || !last) continue
    const rule = ruleSummary('n-plus-one-queries')
    const route = safeRoute(first.route) ?? routeForTrace(context, group.traceId)
    const method = methodForTrace(context, group.traceId)
    const findingFingerprint = fingerprint([
      'n-plus-one-queries',
      group.databaseSystem.toLowerCase(),
      group.shape,
    ])
    const preview = shortText(group.shape, 180)
    findings.push({
      id: diagnosticFindingId(rule.id, findingFingerprint, group.traceId),
      ruleId: rule.id,
      ruleVersion: RULE_VERSION,
      category: rule.category,
      severity: rule.severity,
      status: 'possible',
      title: `Possible N+1 queries: ${queries.length} similar ${group.databaseSystem} queries`,
      summary: `${queries.length} queries with the same normalized SQL shape ran in one trace: ${preview}`,
      detail: `The same normalized SQL shape ran ${queries.length} times in trace ${group.traceId}${route ? ` (${route})` : ''}. This is consistent with a per-item query loop, but StackNext cannot confirm an N+1 bug without reviewing the calling code.`,
      route,
      method,
      traceIds: [group.traceId],
      firstSeen: first.timestamp,
      lastSeen: last.timestamp,
      fingerprint: findingFingerprint,
      evidence: {
        traceIds: [group.traceId],
        spans: [],
        queries: queries.slice(0, 10).map(queryEvidence),
        errors: [],
        measurements: [
          { label: 'matching queries', value: queries.length },
          { label: 'threshold', value: context.config.repeatedQueryMin },
          { label: 'database system', value: group.databaseSystem },
          { label: 'normalized SQL shape', value: preview },
        ],
      },
      verification: [
        'Confirm that the query count matches a list size, page size or other per-item loop.',
        'Inspect the calling code and ORM loading strategy; StackNext does not read source or run EXPLAIN.',
        'Compare the behavior with a batched or joined query and verify the count drops.',
      ],
      limitations: [
        SAMPLE_LIMITATION,
        NULL_DURATION_LIMITATION,
        'SQL bind values are never captured; the fingerprint replaces literals and parameters.',
        'Repeated query shapes can be intentional, for example when fetching independent resources.',
      ],
    })
  }
  return findings
}

function slowSpanFindings(context: DiagnosticRuleContext): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = []
  for (const span of context.snapshot.spans) {
    if (!Number.isFinite(span.durationMs) || span.durationMs <= 0) continue
    const category = diagnosticSpanCategory(span)
    const threshold = spanThresholdMs(category, context.config)
    if (span.durationMs < threshold) continue
    const rule = ruleSummary('slow-span')
    const request = context.requestByTrace.get(span.traceId)
    const route = safeRoute(span.route) ?? routeForTrace(context, span.traceId)
    const method = span.method ?? request?.method ?? null
    const findingFingerprint = fingerprint([
      'slow-span',
      category,
      span.name,
      span.nextSpanType ?? '',
    ])
    const duration = roundMs(span.durationMs)
    const displayName = safeSpanName(span.name)
    const evidenceSpan = spanEvidence(span, category)
    const relatedQueries = context.snapshot.databaseQueries
      .filter((query) => query.spanId === span.spanId && query.traceId === span.traceId)
      .slice(0, 5)
      .map(queryEvidence)
    findings.push({
      id: diagnosticFindingId(rule.id, findingFingerprint, `${span.traceId}:${span.spanId}`),
      ruleId: rule.id,
      ruleVersion: RULE_VERSION,
      category: rule.category,
      severity: rule.severity,
      status: 'observed',
      title: `Slow ${category} span: ${shortText(displayName, 120)}`,
      summary: `${duration} ms exceeded the ${threshold} ms ${category} threshold in trace ${span.traceId}.`,
      detail: `Span ${displayName} (${span.spanId}) took ${duration} ms, above the configured ${threshold} ms threshold for ${category} spans. Span duration includes child work, so it must not be summed with overlapping spans.`,
      route,
      method,
      traceIds: [span.traceId],
      firstSeen: span.startTime,
      lastSeen: span.startTime,
      fingerprint: findingFingerprint,
      evidence: {
        traceIds: [span.traceId],
        spans: [evidenceSpan],
        queries: relatedQueries,
        errors: [],
        measurements: [
          { label: 'duration', value: duration, unit: 'ms' },
          { label: 'threshold', value: threshold, unit: 'ms' },
          { label: 'span category', value: category },
        ],
      },
      verification: [
        'Confirm the duration was measured rather than estimated.',
        'Check whether child spans, queueing or cold starts explain the duration.',
        'Reproduce under the same conditions before changing code or infrastructure.',
      ],
      limitations: [
        SAMPLE_LIMITATION,
        'Span duration includes child work and is not additive across overlapping spans.',
        'A threshold crossing is evidence of slow work, not proof of the cause.',
        'Clock skew between processes can distort span timing.',
      ],
    })
  }
  return findings
}

function repeatedHttpFindings(context: DiagnosticRuleContext): DiagnosticFinding[] {
  const groups = new Map<
    string,
    { traceId: string; method: string; endpoint: string; spans: StackNextSpan[] }
  >()
  for (const span of context.snapshot.spans) {
    if (diagnosticSpanCategory(span) !== 'http') continue
    const endpoint = spanHttpEndpoint(span)
    if (!endpoint) continue
    const method = spanHttpMethod(span) ?? 'UNKNOWN'
    const key = `${span.traceId}\u0000${method}\u0000${endpoint}`
    const existing = groups.get(key)
    if (existing) existing.spans.push(span)
    else groups.set(key, { traceId: span.traceId, method, endpoint, spans: [span] })
  }

  const findings: DiagnosticFinding[] = []
  for (const group of groups.values()) {
    if (group.spans.length < context.config.repeatedHttpMin) continue
    const spans = [...group.spans].sort((a, b) => a.startTime - b.startTime)
    const first = spans[0]
    const last = spans[spans.length - 1]
    if (!first || !last) continue
    const rule = ruleSummary('repeated-external-http')
    const request = context.requestByTrace.get(group.traceId)
    const route = routeForTrace(context, group.traceId)
    const method = request?.method ?? null
    const findingFingerprint = fingerprint([
      'repeated-external-http',
      group.method,
      group.endpoint,
    ])
    findings.push({
      id: diagnosticFindingId(rule.id, findingFingerprint, group.traceId),
      ruleId: rule.id,
      ruleVersion: RULE_VERSION,
      category: rule.category,
      severity: rule.severity,
      status: 'possible',
      title: `Repeated HTTP calls: ${group.method} ${shortText(group.endpoint, 140)}`,
      summary: `${spans.length} outbound ${group.method} calls to ${group.endpoint} ran in trace ${group.traceId}.`,
      detail: `The same outbound endpoint was called ${spans.length} times in one trace. This may indicate missing caching or request deduplication, but repeated calls can be intentional.`,
      route,
      method,
      traceIds: [group.traceId],
      firstSeen: first.startTime,
      lastSeen: last.startTime,
      fingerprint: findingFingerprint,
      evidence: {
        traceIds: [group.traceId],
        spans: spans.slice(0, 10).map((span) => spanEvidence(span, 'http')),
        queries: [],
        errors: [],
        measurements: [
          { label: 'matching calls', value: spans.length },
          { label: 'threshold', value: context.config.repeatedHttpMin },
          { label: 'method', value: group.method },
          { label: 'endpoint', value: group.endpoint },
        ],
      },
      verification: [
        'Confirm the calls target the same logical resource and are not intentionally independent.',
        'Check whether caching, request deduplication or batching is appropriate.',
        'Verify the endpoint count changes after the fix.',
      ],
      limitations: [
        SAMPLE_LIMITATION,
        'Only fetch spans that StackNext receives can be counted; missing instrumentation hides calls.',
        'Query strings and credentials are removed, so different query values share one endpoint.',
        'Repeated calls may be intentional, for example retries or independent resources.',
      ],
    })
  }
  return findings
}

function errorGroupFindings(context: DiagnosticRuleContext): DiagnosticFinding[] {
  if (!context.config.errorGrouping) return []
  const groups = new Map<string, Array<StackNextError & { resolvedTraceId?: string | null }>>()
  for (const error of context.snapshot.errors) {
    const key = diagnosticErrorFingerprint(error)
    const existing = groups.get(key)
    if (existing) existing.push(error)
    else groups.set(key, [error])
  }

  const findings: DiagnosticFinding[] = []
  for (const [groupFingerprint, errors] of groups.entries()) {
    if (errors.length < context.config.errorGroupMin) continue
    const sorted = [...errors].sort((a, b) => b.timestamp - a.timestamp)
    const latest = sorted[0]
    if (!latest) continue
    const rule = ruleSummary('error-fingerprint')
    const routes = [
      ...new Set(
        sorted
          .map((error) => error.route ?? error.requestPath ?? null)
          .filter((route): route is string => Boolean(route))
          .map((route) => safeRoute(route))
          .filter((route): route is string => Boolean(route)),
      ),
    ]
    const methods = [
      ...new Set(
        sorted
          .map((error) => error.method ?? null)
          .filter((method): method is string => Boolean(method)),
      ),
    ]
    const route = routes.length === 1 ? routes[0] ?? null : null
    const method = methods.length === 1 ? methods[0] ?? null : null
    const traceIds = [
      ...new Set(
        sorted
          .map((error) => error.resolvedTraceId ?? error.traceId ?? null)
          .filter((traceId): traceId is string => Boolean(traceId)),
      ),
    ]
    const traceLastSeen = new Map<string, number>()
    for (const error of sorted) {
      const traceId = error.resolvedTraceId ?? error.traceId ?? null
      if (!traceId) continue
      const previous = traceLastSeen.get(traceId)
      if (previous === undefined || error.timestamp > previous) {
        traceLastSeen.set(traceId, error.timestamp)
      }
    }
    traceIds.sort(
      (a, b) => (traceLastSeen.get(b) ?? 0) - (traceLastSeen.get(a) ?? 0) || a.localeCompare(b),
    )
    const operation = errorOperationCategory(latest)
    const safeName = shortText(
      stripUrlQueryInText(redactText(latest.name, 200)),
      120,
    )
    findings.push({
      id: diagnosticFindingId(rule.id, groupFingerprint),
      ruleId: rule.id,
      ruleVersion: RULE_VERSION,
      category: rule.category,
      severity: rule.severity,
      status: 'observed',
      title: `Repeated error: ${safeName}`,
      summary: `${errors.length} occurrences across ${traceIds.length} trace${traceIds.length === 1 ? '' : 's'} share a route-independent error signature.`,
      detail: `The latest occurrence is ${latest.id} at ${formatTimestamp(latest.timestamp)}. Grouping uses the normalized error name, message, stack shape and operation category (${operation}), not the route. Grouping is heuristic and does not establish a root cause.`,
      route,
      method,
      traceIds,
      firstSeen: Math.min(...errors.map((error) => error.timestamp)),
      lastSeen: latest.timestamp,
      fingerprint: groupFingerprint,
      evidence: {
        traceIds,
        spans: [],
        queries: [],
        errors: sorted.slice(0, 10).map((error) => errorEvidence(error, groupFingerprint)),
        measurements: [
          { label: 'occurrences', value: errors.length },
          { label: 'threshold', value: context.config.errorGroupMin },
          { label: 'traces', value: traceIds.length },
          { label: 'operation category', value: operation },
          { label: 'latest error id', value: latest.id },
        ],
      },
      verification: [
        'Confirm the grouped occurrences share the same code path and failure mode.',
        'Inspect the latest trace and error record before changing code.',
        'After a fix, verify the group stops growing in a fresh sample window.',
      ],
      limitations: [
        SAMPLE_LIMITATION,
        'Grouping is heuristic; different root causes can share a normalized message or stack shape.',
        'Redaction and truncation can reduce the specificity of error signatures.',
        'Routes and methods are intentionally excluded from the group fingerprint.',
      ],
    })
  }
  return findings
}

export function evaluateDiagnosticRules(context: DiagnosticRuleContext): DiagnosticFinding[] {
  const findings = [
    ...nPlusOneFindings(context),
    ...slowSpanFindings(context),
    ...repeatedHttpFindings(context),
    ...errorGroupFindings(context),
  ]
  const severityRank: Record<DiagnosticFinding['severity'], number> = {
    error: 0,
    warning: 1,
    info: 2,
  }
  return findings.sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] ||
      b.lastSeen - a.lastSeen ||
      a.id.localeCompare(b.id),
  )
}
