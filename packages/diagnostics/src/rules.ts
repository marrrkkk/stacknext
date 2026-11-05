import {
  DIAGNOSTIC_RULES,
  STACKNEXT_DIAGNOSTICS_RULE_SET_VERSION,
  fingerprint,
  redactText,
  stripUrlQueryInText,
  type DiagnosticContributor,
  type DiagnosticErrorEvidence,
  type DiagnosticFinding,
  type DiagnosticMeasurement,
  type DiagnosticQueryEvidence,
  type DiagnosticSnapshot,
  type DiagnosticSpanCategory,
  type DiagnosticTraceOccurrence,
  type DatabaseQueryListItem,
  type ErrorListItem,
  type StackNextConfig,
  type StackNextDatabaseQuery,
  type StackNextError,
} from '@stacknext/core'
import {
  diagnosticSpanCategory,
  safeRoute,
  safeSpanName,
  spanHttpEndpoint,
  spanHttpMethod,
  spanThresholdMs,
} from './classify.js'
import {
  diagnosticErrorFingerprint,
  diagnosticFindingId,
  errorOperationCategory,
  isControlFlowError,
  sqlFingerprint,
  sqlPreview,
  sqlTableHint,
} from './fingerprints.js'
import {
  buildTraceIndex,
  contributorForNode,
  contributorsForTrace,
  isRequestRootNode,
  maxValue,
  median,
  minValue,
  normalizeRoute,
  roundMs,
  spanEvidenceForNode,
  type DiagnosticTraceIndex,
  type DiagnosticTraceModel,
  type TraceSpanNode,
} from './trace.js'

export interface DiagnosticRuleContext {
  snapshot: DiagnosticSnapshot
  config: StackNextConfig['diagnostics']
  /** Top-level request threshold used by the request summary and slow-request rule. */
  slowRequestMs: number
  /** Optional pre-built index; the engine builds one and passes it in. */
  traceIndex?: DiagnosticTraceIndex
}

interface RuleContext {
  snapshot: DiagnosticSnapshot
  config: StackNextConfig['diagnostics']
  slowRequestMs: number
  index: DiagnosticTraceIndex
}

interface RouteGroup {
  key: string
  route: string | null
  method: string | null
  traces: DiagnosticTraceModel[]
}

const RULE_VERSION = STACKNEXT_DIAGNOSTICS_RULE_SET_VERSION

const SAMPLE_LIMITATION =
  'Only the current in-memory retention window is analyzed; findings disappear when evidence ages out.'

const NULL_DURATION_LIMITATION =
  'Database durations can be null when an adapter does not measure them. Null is never treated as zero.'

const REQUEST_ROOT_LIMITATION =
  'Request-level rules only analyze traces with a captured request root. Spans without an attributable root are reported as a sample note instead of a finding.'

const TRACE_ID_LIMIT = 50
const TRACE_EVIDENCE_LIMIT = 20
const SPAN_EVIDENCE_LIMIT = 10
const QUERY_EVIDENCE_LIMIT = 10
const ERROR_EVIDENCE_LIMIT = 10
const CONTRIBUTOR_LIMIT = 10

function ruleSummary(ruleId: DiagnosticFinding['ruleId']) {
  const rule = DIAGNOSTIC_RULES.find((entry) => entry.id === ruleId)
  if (!rule) throw new Error(`Unknown diagnostic rule: ${ruleId}`)
  return rule
}

function formatTimestamp(value: number): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'unknown time' : date.toISOString()
}

function shortText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}…`
}

function sanitizedText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null
  const safe = stripUrlQueryInText(redactText(value, maxLength))
  return safe === '' ? null : safe
}

function canonicalRoute(value: string | null | undefined): string | null {
  const safe = safeRoute(value)
  if (!safe) return null
  return safe.startsWith('/') ? normalizeRoute(safe) : safe
}

function stringAttribute(
  attributes: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = attributes[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function commonString(values: Array<string | null | undefined>): string | null {
  const unique = uniqueStrings(values)
  return unique.length === 1 ? unique[0] ?? null : null
}

function methodFromRequest(trace: DiagnosticTraceModel): string | null {
  const nameMethod = /^([A-Z]+)\s+/.exec(trace.request?.name ?? '')?.[1]
  return trace.method ?? nameMethod?.toUpperCase() ?? null
}

function routeGroups(traces: DiagnosticTraceModel[]): RouteGroup[] {
  const groups = new Map<string, RouteGroup>()
  for (const trace of traces) {
    const key = trace.routeKey ?? methodFromRequest(trace) ?? 'unknown-route'
    const existing = groups.get(key)
    if (existing) existing.traces.push(trace)
    else {
      groups.set(key, {
        key,
        route: trace.route,
        method: methodFromRequest(trace),
        traces: [trace],
      })
    }
  }
  for (const group of groups.values()) {
    group.traces.sort((a, b) => a.startTime - b.startTime || a.traceId.localeCompare(b.traceId))
    group.method = commonString(group.traces.map((trace) => methodFromRequest(trace)))
  }
  return [...groups.values()].sort(
    (a, b) => a.key.localeCompare(b.key) || a.traces[0]!.traceId.localeCompare(b.traces[0]!.traceId),
  )
}

const traceMembership = new WeakMap<string[], Set<string>>()

export function findingMatchesTrace(finding: DiagnosticFinding, traceId: string): boolean {
  return traceMembership.get(finding.traceIds)?.has(traceId) ?? finding.traceIds.includes(traceId)
}

function limitTraceIds(traceIds: Array<string | null | undefined>): string[] {
  const all = uniqueStrings(traceIds)
  const limited = all.slice(0, TRACE_ID_LIMIT)
  traceMembership.set(limited, new Set(all))
  return limited
}

function traceOccurrence(
  trace: DiagnosticTraceModel,
  occurrenceCount: number,
  options: { timestamp?: number; durationMs?: number | null; contributor?: string | null } = {},
): DiagnosticTraceOccurrence {
  const duration = options.durationMs
  const contributor = options.contributor ? safeSpanName(options.contributor) : null
  return {
    traceId: trace.traceId,
    timestamp: options.timestamp ?? trace.request?.timestamp ?? trace.startTime,
    occurrences: occurrenceCount,
    ...(duration !== null && duration !== undefined ? { durationMs: roundMs(duration) } : {}),
    ...(contributor ? { contributor } : {}),
  }
}

function boundedContributors(contributors: DiagnosticContributor[]): DiagnosticContributor[] {
  const seen = new Set<string>()
  const result: DiagnosticContributor[] = []
  for (const contributor of contributors) {
    const key = `${contributor.traceId ?? ''}\u0000${contributor.spanId ?? ''}\u0000${contributor.label}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(contributor)
    if (result.length >= CONTRIBUTOR_LIMIT) break
  }
  return result
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
  trace: DiagnosticTraceModel | null,
  deepest: TraceSpanNode | null,
): DiagnosticErrorEvidence {
  const route = canonicalRoute(error.route ?? error.requestPath) ?? trace?.route ?? null
  const routeType = sanitizedText(error.routeType, 100)
  const renderSource = sanitizedText(error.renderSource, 100)
  const renderType = sanitizedText(error.renderType, 100)
  const revalidateReason = sanitizedText(
    stringAttribute(error.attributes, 'next.revalidate_reason', 'revalidateReason'),
    100,
  )
  const routerKind = sanitizedText(error.routerKind, 100)
  const digest = sanitizedText(error.digest, 1_000)
  const spanId = deepest?.span.spanId ?? error.spanId
  return {
    id: error.id,
    name: shortText(stripUrlQueryInText(redactText(error.name, 200)), 200),
    message: shortText(stripUrlQueryInText(redactText(error.message, 600)), 600),
    timestamp: error.timestamp,
    ...(route ? { route } : {}),
    ...(error.method ? { method: error.method } : {}),
    traceId: error.resolvedTraceId ?? error.traceId ?? null,
    fingerprint: groupFingerprint,
    ...(routeType ? { routeType } : {}),
    ...(renderSource ? { renderSource } : {}),
    ...(renderType ? { renderType } : {}),
    ...(revalidateReason ? { revalidateReason } : {}),
    ...(routerKind ? { routerKind } : {}),
    ...(digest ? { digest } : {}),
    ...(trace?.statusCode !== null && trace?.statusCode !== undefined
      ? { statusCode: trace.statusCode }
      : {}),
    ...(spanId ? { spanId } : {}),
  }
}

function measuredDuration(queries: DatabaseQueryListItem[]): number | null {
  const measured = queries
    .map((query) => query.durationMs)
    .filter((duration): duration is number => duration !== null && Number.isFinite(duration))
  if (measured.length === 0) return null
  return measured.reduce((sum, duration) => sum + duration, 0)
}

function nPlusOneFindings(context: RuleContext): DiagnosticFinding[] {
  interface ShapeGroup {
    key: string
    route: string | null
    routeKey: string
    databaseSystem: string
    shape: string
    tableHint: string | null
    byTrace: Map<string, DatabaseQueryListItem[]>
    methods: Array<string | null>
  }

  const groups = new Map<string, ShapeGroup>()
  for (const query of context.snapshot.databaseQueries) {
    const traceId = query.resolvedTraceId
    if (!traceId) continue
    const trace = context.index.traces.get(traceId)
    if (!trace || trace.root === null) continue
    // A trace ID alone does not prove request attribution. Adapters attach the
    // active OTel span ID; absent or detached span evidence stays unverified.
    const node = query.spanId ? trace.bySpanId.get(query.spanId) : undefined
    if (!node?.attributed) continue
    const route = canonicalRoute(query.route) ?? trace.route
    const routeKey = trace.routeKey ?? route
    if (!route || !routeKey) continue
    const shape = sqlFingerprint(query.sql)
    if (shape === '') continue
    const key = `${routeKey}\u0000${query.databaseSystem.toLowerCase()}\u0000${shape}`
    const existing = groups.get(key)
    if (existing) {
      const existingQueries = existing.byTrace.get(traceId)
      if (existingQueries) existingQueries.push(query)
      else existing.byTrace.set(traceId, [query])
      existing.methods.push(methodFromRequest(trace))
    } else {
      groups.set(key, {
        key,
        route,
        routeKey,
        databaseSystem: query.databaseSystem,
        shape,
        tableHint: sqlTableHint(shape),
        byTrace: new Map([[traceId, [query]]]),
        methods: [methodFromRequest(trace)],
      })
    }
  }

  const findings: DiagnosticFinding[] = []
  const rule = ruleSummary('n-plus-one-queries')
  for (const group of groups.values()) {
    const matchingTraces: Array<{
      trace: DiagnosticTraceModel
      queries: DatabaseQueryListItem[]
    }> = []
    for (const [traceId, queries] of group.byTrace.entries()) {
      if (queries.length < context.config.repeatedQueryMin) continue
      const trace = context.index.traces.get(traceId)
      if (!trace) continue
      matchingTraces.push({
        trace,
        queries: [...queries].sort(
          (a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id),
        ),
      })
    }
    if (matchingTraces.length === 0) continue
    matchingTraces.sort(
      (a, b) =>
        b.queries.length - a.queries.length ||
        b.trace.startTime - a.trace.startTime ||
        a.trace.traceId.localeCompare(b.trace.traceId),
    )
    const representative = matchingTraces[0]!
    const allMatchingQueries = matchingTraces.flatMap((entry) => entry.queries)
    const totalOccurrences = allMatchingQueries.length
    const measuredTotal = measuredDuration(allMatchingQueries)
    const methods = uniqueStrings(group.methods)
    const method = methods.length === 1 ? methods[0] ?? null : null
    const findingFingerprint = fingerprint([
      rule.id,
      group.route,
      group.databaseSystem.toLowerCase(),
      group.shape,
    ])
    const preview = shortText(group.shape, 180)
    const tableHint = group.tableHint ? ` Table hint: ${group.tableHint}.` : ''
    const measuredSummary =
      measuredTotal === null
        ? ' No query duration was measured.'
        : ` Measured query duration totals ${roundMs(measuredTotal)} ms (inclusive, not additive with span time).`
    const representativeDuration = measuredDuration(representative.queries)
    findings.push({
      id: diagnosticFindingId(rule.id, findingFingerprint, group.routeKey),
      ruleId: rule.id,
      ruleVersion: RULE_VERSION,
      category: rule.category,
      severity: rule.severity,
      status: 'possible',
      title: `Possible N+1 queries: ${totalOccurrences} similar ${group.databaseSystem} queries on ${group.routeKey}`,
      summary: `${totalOccurrences} queries with the same normalized SQL shape ran across ${matchingTraces.length} trace${matchingTraces.length === 1 ? '' : 's'} on ${group.routeKey}.`,
      detail: `The same normalized SQL shape ran ${representative.queries.length} times in the busiest trace ${representative.trace.traceId}${group.route ? ` (${group.route})` : ''}. This is consistent with a per-item query loop, but StackNext cannot confirm an N+1 bug without reviewing the calling code.${tableHint}${measuredSummary}`,
      route: group.route,
      method,
      traceIds: limitTraceIds(matchingTraces.map((entry) => entry.trace.traceId)),
      affectedTraceCount: matchingTraces.length,
      firstSeen: Math.min(...allMatchingQueries.map((query) => query.timestamp)),
      lastSeen: Math.max(...allMatchingQueries.map((query) => query.timestamp)),
      fingerprint: findingFingerprint,
      evidence: {
        traceIds: limitTraceIds(matchingTraces.map((entry) => entry.trace.traceId)),
        spans: [],
        queries: representative.queries.slice(0, QUERY_EVIDENCE_LIMIT).map(queryEvidence),
        errors: [],
        contributors: [],
        traces: matchingTraces
          .slice(0, TRACE_EVIDENCE_LIMIT)
          .map((entry) =>
            traceOccurrence(entry.trace, entry.queries.length, {
              timestamp: entry.queries[0]?.timestamp ?? entry.trace.startTime,
              durationMs: measuredDuration(entry.queries),
            }),
          ),
        measurements: [
          { label: 'matching queries', value: totalOccurrences },
          { label: 'matching traces', value: matchingTraces.length },
          { label: 'threshold', value: context.config.repeatedQueryMin },
          { label: 'database system', value: group.databaseSystem },
          { label: 'normalized SQL shape', value: preview },
          ...(group.tableHint ? [{ label: 'table hint', value: group.tableHint }] : []),
          {
            label: 'measured query duration',
            value: measuredTotal === null ? null : roundMs(measuredTotal),
            ...(measuredTotal === null ? {} : { unit: 'ms' }),
          },
          {
            label: 'busiest trace measured query duration',
            value:
              representativeDuration === null ? null : roundMs(representativeDuration),
            ...(representativeDuration === null ? {} : { unit: 'ms' }),
          },
        ] satisfies DiagnosticMeasurement[],
      },
      verification: [
        'Confirm that the query count matches a list size, page size or other per-item loop.',
        'Inspect the calling code and ORM loading strategy; StackNext does not read source or run EXPLAIN.',
        'Compare the behavior with a batched or joined query and verify the count drops.',
      ],
      limitations: [
        SAMPLE_LIMITATION,
        NULL_DURATION_LIMITATION,
        REQUEST_ROOT_LIMITATION,
        'SQL bind values are never captured; the fingerprint replaces literals and parameters.',
        'Repeated query shapes can be intentional, for example when fetching independent resources.',
      ],
    })
  }
  return findings
}

function slowRequestFindings(context: RuleContext): DiagnosticFinding[] {
  const rule = ruleSummary('slow-request')
  const findings: DiagnosticFinding[] = []
  for (const group of routeGroups(context.index.requestTraces)) {
    const measured = group.traces.filter(
      (trace) =>
        trace.requestDurationMs !== null && trace.requestDurationMs >= context.slowRequestMs,
    )
    if (measured.length === 0) continue
    measured.sort(
      (a, b) =>
        (b.requestDurationMs ?? 0) - (a.requestDurationMs ?? 0) ||
        b.startTime - a.startTime ||
        a.traceId.localeCompare(b.traceId),
    )
    const representative = measured[0]!
    const contributors = contributorsForTrace(representative, 5)
    const dominant = contributors[0] ?? null
    const durations = measured.map((trace) => trace.requestDurationMs ?? 0)
    const slowMedian = median(durations)
    const slowMaximum = maxValue(durations)
    const slowMinimum = minValue(durations)
    const findingFingerprint = fingerprint([rule.id, group.method ?? '', group.route ?? ''])
    const routeLabel = group.key
    const dominantText = dominant
      ? `${dominant.span.nextSpanName ?? dominant.span.name} (${roundMs(dominant.selfMs)} ms self time, ${dominant.phase})`
      : 'no measured child span with self time'
    findings.push({
      id: diagnosticFindingId(rule.id, findingFingerprint, group.key),
      ruleId: rule.id,
      ruleVersion: RULE_VERSION,
      category: rule.category,
      severity: rule.severity,
      status: 'observed',
      title: `Slow requests: ${routeLabel}`,
      summary: `${measured.length} of ${group.traces.length} ${routeLabel} requests exceeded the ${context.slowRequestMs} ms request threshold${slowMedian === null ? '' : ` (median ${roundMs(slowMedian)} ms)`}.`,
      detail: `Request duration is measured from the request root${representative.root ? ` (${safeSpanName(representative.root.span.nextSpanName ?? representative.root.span.name)})` : ''}. In the slowest trace ${representative.traceId}, the largest self-time contributor is ${dominantText}. Self time subtracts the union of direct child span intervals, so it is an attribution aid rather than proof of the cause.`,
      route: group.route,
      method: group.method,
      traceIds: limitTraceIds(measured.map((trace) => trace.traceId)),
      affectedTraceCount: measured.length,
      firstSeen: Math.min(...measured.map((trace) => trace.request?.timestamp ?? trace.startTime)),
      lastSeen: Math.max(...measured.map((trace) => trace.request?.timestamp ?? trace.startTime)),
      fingerprint: findingFingerprint,
      evidence: {
        traceIds: limitTraceIds(measured.map((trace) => trace.traceId)),
        spans: representative
          ? [
              ...(representative.root ? [spanEvidenceForNode(representative.root)] : []),
              ...contributors.map(spanEvidenceForNode),
            ]
              .filter(
                (span, index, list) =>
                  list.findIndex((entry) => entry.spanId === span.spanId) === index,
              )
              .slice(0, SPAN_EVIDENCE_LIMIT)
          : [],
        queries: [],
        errors: [],
        contributors: boundedContributors(contributors.map(contributorForNode)),
        traces: measured.slice(0, TRACE_EVIDENCE_LIMIT).map((trace) =>
          traceOccurrence(trace, 1, {
            durationMs: trace.requestDurationMs,
            contributor: contributorsForTrace(trace, 1)[0]?.span.nextSpanName ??
              contributorsForTrace(trace, 1)[0]?.span.name ??
              null,
          }),
        ),
        measurements: [
          { label: 'slow requests', value: measured.length },
          { label: 'requests on route', value: group.traces.length },
          {
            label: 'slow request rate',
            value: Math.round((measured.length / Math.max(1, group.traces.length)) * 1000) / 10,
            unit: '%',
          },
          { label: 'threshold', value: context.slowRequestMs, unit: 'ms' },
          ...(slowMedian === null
            ? []
            : [{ label: 'median slow duration', value: roundMs(slowMedian), unit: 'ms' }]),
          ...(slowMinimum === null
            ? []
            : [{ label: 'minimum slow duration', value: roundMs(slowMinimum), unit: 'ms' }]),
          ...(slowMaximum === null
            ? []
            : [{ label: 'maximum duration', value: roundMs(slowMaximum), unit: 'ms' }]),
          {
            label: 'dominant contributor',
            value: dominant ? safeSpanName(dominant.span.nextSpanName ?? dominant.span.name) : null,
          },
        ] satisfies DiagnosticMeasurement[],
      },
      verification: [
        'Reproduce the request under the same conditions and confirm the duration is measured, not estimated.',
        'Inspect the dominant self-time contributor and its Next.js phase before changing code.',
        'Check cold starts, route-module loading, queueing and database latency separately.',
      ],
      limitations: [
        SAMPLE_LIMITATION,
        'A threshold crossing is evidence of slow work, not proof of the cause.',
        'Self time is approximate when clocks disagree or child spans overlap the parent interval.',
        'Cold-start and route-module loading can dominate the first request for a route.',
      ],
    })
  }
  return findings
}

function slowSpanFindings(context: RuleContext): DiagnosticFinding[] {
  const rule = ruleSummary('slow-span')
  interface SpanGroup {
    key: string
    routeKey: string
    route: string | null
    category: DiagnosticSpanCategory
    label: string
    nextSpanType: string | null
    threshold: number
    byTrace: Map<string, TraceSpanNode[]>
  }

  const groups = new Map<string, SpanGroup>()
  for (const trace of context.index.requestTraces) {
    if (
      trace.requestDurationMs !== null &&
      trace.requestDurationMs >= context.slowRequestMs
    ) {
      continue
    }
    for (const node of trace.nodes) {
      if (!node.attributed || isRequestRootNode(node)) continue
      if (!Number.isFinite(node.selfMs) || node.selfMs <= 0) continue
      const category = diagnosticSpanCategory(node.span)
      const threshold = spanThresholdMs(category, context.config)
      if (node.selfMs < threshold) continue
      const routeKey = trace.routeKey ?? methodFromRequest(trace) ?? 'unknown-route'
      const label = safeSpanName(node.span.nextSpanName ?? node.span.name)
      const nextSpanType = node.span.nextSpanType ?? null
      const key = `${routeKey}\u0000${category}\u0000${label}\u0000${nextSpanType ?? ''}`
      const existing = groups.get(key)
      if (existing) {
        const nodes = existing.byTrace.get(trace.traceId)
        if (nodes) nodes.push(node)
        else existing.byTrace.set(trace.traceId, [node])
      } else {
        groups.set(key, {
          key,
          routeKey,
          route: trace.route,
          category,
          label,
          nextSpanType,
          threshold,
          byTrace: new Map([[trace.traceId, [node]]]),
        })
      }
    }
  }

  const findings: DiagnosticFinding[] = []
  for (const group of groups.values()) {
    const matching: Array<{ trace: DiagnosticTraceModel; nodes: TraceSpanNode[] }> = []
    for (const [traceId, nodes] of group.byTrace.entries()) {
      const trace = context.index.traces.get(traceId)
      if (!trace) continue
      matching.push({
        trace,
        nodes: [...nodes].sort(
          (a, b) =>
            b.selfMs - a.selfMs ||
            a.span.startTime - b.span.startTime ||
            a.span.spanId.localeCompare(b.span.spanId),
        ),
      })
    }
    if (matching.length === 0) continue
    matching.sort(
      (a, b) =>
        (b.nodes[0]?.selfMs ?? 0) - (a.nodes[0]?.selfMs ?? 0) ||
        b.trace.startTime - a.trace.startTime ||
        a.trace.traceId.localeCompare(b.trace.traceId),
    )
    const representative = matching[0]!
    const representativeNode = representative.nodes[0]!
    const totalOccurrences = matching.reduce((sum, entry) => sum + entry.nodes.length, 0)
    const bestSelfMs = representativeNode.selfMs
    const methods = uniqueStrings(
      matching.map((entry) => methodFromRequest(entry.trace)),
    )
    const method = methods.length === 1 ? methods[0] ?? null : null
    const measuredQueries = measuredDuration(
      representative.nodes.flatMap((node) =>
        context.snapshot.databaseQueries.filter(
          (query) => query.spanId === node.span.spanId && query.traceId === node.span.traceId,
        ),
      ),
    )
    const findingFingerprint = fingerprint([
      rule.id,
      group.category,
      group.label,
      group.nextSpanType ?? '',
    ])
    const phase = representativeNode.phase
    const matchingNodes = matching.flatMap((entry) => entry.nodes)
    findings.push({
      id: diagnosticFindingId(rule.id, findingFingerprint, group.routeKey),
      ruleId: rule.id,
      ruleVersion: RULE_VERSION,
      category: rule.category,
      severity: rule.severity,
      status: 'observed',
      title: `Slow ${group.category} operation: ${shortText(group.label, 120)}`,
      summary: `${shortText(group.label, 120)} used ${roundMs(bestSelfMs)} ms of self time across ${matching.length} trace${matching.length === 1 ? '' : 's'} on ${group.routeKey}, above the ${group.threshold} ms ${group.category} threshold.`,
      detail: `Span ${shortText(group.label, 160)} (${representativeNode.span.spanId}) has ${roundMs(representativeNode.selfMs)} ms self time in trace ${representative.trace.traceId}. Inclusive duration is ${roundMs(representativeNode.span.durationMs)} ms and the Next.js phase is ${phase}. The enclosing request was below the ${context.slowRequestMs} ms request threshold, so this operation is reported separately.${measuredQueries === null ? '' : ` Associated database queries measured ${roundMs(measuredQueries)} ms in total.`}`,
      route: group.route,
      method,
      traceIds: limitTraceIds(matching.map((entry) => entry.trace.traceId)),
      affectedTraceCount: matching.length,
      firstSeen: Math.min(...matchingNodes.map((node) => node.span.startTime)),
      lastSeen: Math.max(...matchingNodes.map((node) => node.span.startTime)),
      fingerprint: findingFingerprint,
      evidence: {
        traceIds: limitTraceIds(matching.map((entry) => entry.trace.traceId)),
        spans: matching.map((entry) => entry.nodes[0]!)
          .slice(0, SPAN_EVIDENCE_LIMIT)
          .map(spanEvidenceForNode),
        queries: representative.nodes
          .flatMap((node) =>
            context.snapshot.databaseQueries.filter(
              (query) => query.spanId === node.span.spanId && query.traceId === node.span.traceId,
            ),
          )
          .slice(0, QUERY_EVIDENCE_LIMIT)
          .map(queryEvidence),
        errors: [],
        contributors: boundedContributors(
          representative.nodes.slice(0, 5).map(contributorForNode),
        ),
        traces: matching.slice(0, TRACE_EVIDENCE_LIMIT).map((entry) =>
          traceOccurrence(entry.trace, entry.nodes.length, {
            timestamp: entry.nodes[0]!.span.startTime,
            durationMs: entry.nodes.reduce((sum, node) => sum + node.selfMs, 0),
            contributor: entry.nodes[0]!.span.nextSpanName ?? entry.nodes[0]!.span.name,
          }),
        ),
        measurements: [
          { label: 'matching spans', value: totalOccurrences },
          { label: 'matching traces', value: matching.length },
          { label: 'self time', value: roundMs(bestSelfMs), unit: 'ms' },
          {
            label: 'inclusive duration',
            value: roundMs(representativeNode.span.durationMs),
            unit: 'ms',
          },
          { label: 'threshold', value: group.threshold, unit: 'ms' },
          { label: 'span category', value: group.category },
          { label: 'next phase', value: phase },
          ...(group.nextSpanType
            ? [{ label: 'Next.js span type', value: group.nextSpanType }]
            : []),
          ...(measuredQueries === null
            ? []
            : [
                {
                  label: 'associated query duration',
                  value: roundMs(measuredQueries),
                  unit: 'ms',
                },
              ]),
        ] satisfies DiagnosticMeasurement[],
      },
      verification: [
        'Confirm the self time was measured rather than inferred from the inclusive duration.',
        'Check the span phase and whether child spans, queueing or cold starts explain the time.',
        'Reproduce under the same conditions before changing code or infrastructure.',
      ],
      limitations: [
        SAMPLE_LIMITATION,
        'Self time is approximate when clocks disagree or child spans overlap the parent interval.',
        'Slow-span findings are suppressed for requests already reported as slow requests.',
        'A threshold crossing is evidence of slow work, not proof of the cause.',
      ],
    })
  }
  return findings
}

function repeatedHttpFindings(context: RuleContext): DiagnosticFinding[] {
  const rule = ruleSummary('repeated-external-http')
  interface HttpGroup {
    key: string
    routeKey: string
    route: string | null
    method: string
    endpoint: string
    byTrace: Map<string, TraceSpanNode[]>
  }

  const groups = new Map<string, HttpGroup>()
  for (const trace of context.index.requestTraces) {
    for (const node of trace.nodes) {
      if (!node.attributed) continue
      if (diagnosticSpanCategory(node.span) !== 'http') continue
      const endpoint = spanHttpEndpoint(node.span)
      if (!endpoint) continue
      const httpMethod = spanHttpMethod(node.span) ?? 'UNKNOWN'
      const routeKey = trace.routeKey ?? methodFromRequest(trace) ?? 'unknown-route'
      const key = `${routeKey}\u0000${httpMethod}\u0000${endpoint}`
      const existing = groups.get(key)
      if (existing) {
        const nodes = existing.byTrace.get(trace.traceId)
        if (nodes) nodes.push(node)
        else existing.byTrace.set(trace.traceId, [node])
      } else {
        groups.set(key, {
          key,
          routeKey,
          route: trace.route,
          method: httpMethod,
          endpoint,
          byTrace: new Map([[trace.traceId, [node]]]),
        })
      }
    }
  }

  const findings: DiagnosticFinding[] = []
  for (const group of groups.values()) {
    const matching: Array<{ trace: DiagnosticTraceModel; nodes: TraceSpanNode[] }> = []
    for (const [traceId, nodes] of group.byTrace.entries()) {
      if (nodes.length < context.config.repeatedHttpMin) continue
      const trace = context.index.traces.get(traceId)
      if (!trace) continue
      matching.push({
        trace,
        nodes: [...nodes].sort(
          (a, b) => a.span.startTime - b.span.startTime || a.span.spanId.localeCompare(b.span.spanId),
        ),
      })
    }
    if (matching.length === 0) continue
    matching.sort(
      (a, b) =>
        b.nodes.length - a.nodes.length ||
        b.trace.startTime - a.trace.startTime ||
        a.trace.traceId.localeCompare(b.trace.traceId),
    )
    const representative = matching[0]!
    const totalCalls = matching.reduce((sum, entry) => sum + entry.nodes.length, 0)
    const requestMethods = uniqueStrings(
      matching.map((entry) => methodFromRequest(entry.trace)),
    )
    const requestMethod = requestMethods.length === 1 ? requestMethods[0] ?? null : null
    const cacheStatuses = new Map<string, number>()
    let loopbackCalls = 0
    for (const entry of matching) {
      for (const node of entry.nodes) {
        const cacheStatus =
          stringAttribute(
            node.span.attributes,
            'next.fetch.cache_status',
            'http.response.cache_status',
          ) ?? 'unknown'
        cacheStatuses.set(cacheStatus, (cacheStatuses.get(cacheStatus) ?? 0) + 1)
        if (
          group.endpoint.startsWith('127.0.0.1') ||
          group.endpoint.startsWith('localhost') ||
          group.endpoint.startsWith('[::1]')
        ) {
          loopbackCalls += 1
        }
      }
    }
    const cacheSummary = [...cacheStatuses.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([status, count]) => `${status}: ${count}`)
      .join(', ')
    const findingFingerprint = fingerprint([
      rule.id,
      requestMethod ?? '',
      group.method,
      group.endpoint,
      group.route ?? '',
    ])
    const matchingNodes = matching.flatMap((entry) => entry.nodes)
    findings.push({
      id: diagnosticFindingId(rule.id, findingFingerprint, group.routeKey),
      ruleId: rule.id,
      ruleVersion: RULE_VERSION,
      category: rule.category,
      severity: rule.severity,
      status: 'possible',
      title: `Repeated HTTP calls: ${group.method} ${shortText(group.endpoint, 140)}`,
      summary: `${totalCalls} outbound ${group.method} calls to ${shortText(group.endpoint, 180)} across ${matching.length} trace${matching.length === 1 ? '' : 's'} on ${group.routeKey}.`,
      detail: `The same outbound endpoint was called ${totalCalls} times from ${group.routeKey}. Observed cache statuses: ${cacheSummary}. ${loopbackCalls > 0 ? `${loopbackCalls} call${loopbackCalls === 1 ? '' : 's'} targeted a loopback host, which may be the same application. ` : ''}This may indicate missing caching or request deduplication, but repeated calls can be intentional.`,
      route: group.route,
      method: requestMethod,
      traceIds: limitTraceIds(matching.map((entry) => entry.trace.traceId)),
      affectedTraceCount: matching.length,
      firstSeen: Math.min(...matchingNodes.map((node) => node.span.startTime)),
      lastSeen: Math.max(...matchingNodes.map((node) => node.span.startTime)),
      fingerprint: findingFingerprint,
      evidence: {
        traceIds: limitTraceIds(matching.map((entry) => entry.trace.traceId)),
        spans: representative.nodes
          .slice(0, SPAN_EVIDENCE_LIMIT)
          .map(spanEvidenceForNode),
        queries: [],
        errors: [],
        contributors: boundedContributors(
          representative.nodes.slice(0, 5).map(contributorForNode),
        ),
        traces: matching.slice(0, TRACE_EVIDENCE_LIMIT).map((entry) =>
          traceOccurrence(entry.trace, entry.nodes.length, {
            timestamp: entry.nodes[0]!.span.startTime,
            durationMs: entry.nodes.reduce((sum, node) => sum + node.span.durationMs, 0),
            contributor: entry.nodes[0]!.span.nextSpanName ?? entry.nodes[0]!.span.name,
          }),
        ),
        measurements: [
          { label: 'matching calls', value: totalCalls },
          { label: 'matching traces', value: matching.length },
          { label: 'threshold', value: context.config.repeatedHttpMin },
          { label: 'fetch method', value: group.method },
          { label: 'endpoint', value: group.endpoint },
          { label: 'cache statuses', value: cacheSummary || 'unknown' },
          { label: 'loopback calls', value: loopbackCalls },
        ] satisfies DiagnosticMeasurement[],
      },
      verification: [
        'Confirm the calls target the same logical resource and are not intentionally independent.',
        'Check whether caching, request deduplication or batching is appropriate.',
        'Verify the endpoint count changes after the fix.',
      ],
      limitations: [
        SAMPLE_LIMITATION,
        REQUEST_ROOT_LIMITATION,
        'Only fetch spans that StackNext receives can be counted; missing instrumentation hides calls.',
        'Query strings and credentials are removed, so different query values share one endpoint.',
        'Repeated calls may be intentional, for example retries or independent resources.',
      ],
    })
  }
  return findings
}

function errorFindings(context: RuleContext): DiagnosticFinding[] {
  const rule = ruleSummary('error-fingerprint')
  interface ErrorEntry {
    error: ErrorListItem
    trace: DiagnosticTraceModel | null
    deepest: TraceSpanNode | null
    route: string | null
    method: string | null
    errorFingerprint: string
  }

  const entries: ErrorEntry[] = []
  for (const error of context.snapshot.errors) {
    if (isControlFlowError(error)) continue
    const traceId = error.resolvedTraceId ?? error.traceId ?? null
    const trace = traceId ? context.index.traces.get(traceId) ?? null : null
    const route =
      canonicalRoute(error.route ?? error.requestPath) ?? trace?.route ?? null
    const method =
      error.method ?? (trace ? methodFromRequest(trace) : null) ?? null
    entries.push({
      error,
      trace,
      deepest: trace?.deepestErrorSpan ?? null,
      route,
      method,
      errorFingerprint: diagnosticErrorFingerprint(error),
    })
  }
  if (entries.length === 0) return []

  const groups = new Map<string, ErrorEntry[]>()
  for (const entry of entries) {
    const key = context.config.errorGrouping
      ? `${entry.route ?? ''}\u0000${entry.errorFingerprint}`
      : entry.error.id
    const existing = groups.get(key)
    if (existing) existing.push(entry)
    else groups.set(key, [entry])
  }

  const findings: DiagnosticFinding[] = []
  for (const groupEntries of groups.values()) {
    const sorted = [...groupEntries].sort(
      (a, b) =>
        a.error.timestamp - b.error.timestamp || a.error.id.localeCompare(b.error.id),
    )
    const latest = sorted[sorted.length - 1]!
    const route = commonString(sorted.map((entry) => entry.route))
    const method = commonString(sorted.map((entry) => entry.method))
    const traceIds = limitTraceIds(
      sorted.map((entry) => entry.error.resolvedTraceId ?? entry.error.traceId ?? null),
    )
    const affectedTraceCount = uniqueStrings(
      sorted.map((entry) => entry.error.resolvedTraceId ?? entry.error.traceId ?? null),
    ).length
    const deepestSpans = sorted
      .map((entry) => entry.deepest)
      .filter((node): node is TraceSpanNode => node !== null)
      .slice(0, 5)
    const traceForContributors = latest.trace
    const operation = errorOperationCategory(latest.error)
    const safeName = shortText(
      stripUrlQueryInText(redactText(latest.error.name, 200)),
      120,
    )
    const groupFingerprint = diagnosticErrorFingerprint(latest.error)
    const findingFingerprint = context.config.errorGrouping
      ? fingerprint([rule.id, route ?? '', groupFingerprint])
      : fingerprint([rule.id, latest.error.id])
    const repeated = sorted.length >= context.config.errorGroupMin
    const routeLabel = route ?? 'an unknown route'
    const firstSeen = Math.min(...sorted.map((entry) => entry.error.timestamp))
    const lastSeen = latest.error.timestamp
    const statusCode = traceForContributors?.statusCode ?? null
    const revalidateReason = sanitizedText(
      stringAttribute(latest.error.attributes, 'next.revalidate_reason', 'revalidateReason'),
      100,
    )
    const digest = sanitizedText(latest.error.digest, 1_000)
    const nextContext = [
      latest.error.routeType ? `routeType=${latest.error.routeType}` : null,
      latest.error.renderType ? `renderType=${latest.error.renderType}` : null,
      latest.error.renderSource ? `renderSource=${latest.error.renderSource}` : null,
      latest.error.routerKind ? `routerKind=${latest.error.routerKind}` : null,
      revalidateReason ? `revalidateReason=${revalidateReason}` : null,
      digest ? `digest=${digest}` : null,
    ]
      .filter((entry): entry is string => Boolean(entry))
      .join(', ')
    const deepestText = latest.deepest
      ? ` The deepest error span is ${safeSpanName(latest.deepest.span.nextSpanName ?? latest.deepest.span.name)} (${roundMs(latest.deepest.selfMs)} ms self time, ${latest.deepest.phase}).`
      : ' No error span was found in the correlated trace.'
    const traceEvidenceById = new Map<
      string,
      { trace: DiagnosticTraceModel | null; timestamp: number; count: number }
    >()
    for (const entry of sorted) {
      const traceId = entry.error.resolvedTraceId ?? entry.error.traceId ?? null
      if (!traceId) continue
      const existing = traceEvidenceById.get(traceId)
      if (existing) existing.count += 1
      if (!existing || entry.error.timestamp > existing.timestamp) {
        traceEvidenceById.set(traceId, {
          trace: entry.trace,
          timestamp: entry.error.timestamp,
          count: existing?.count ?? 1,
        })
      }
    }
    const errorTraces: DiagnosticTraceOccurrence[] = [...traceEvidenceById.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp || a[0].localeCompare(b[0]))
      .slice(-TRACE_EVIDENCE_LIMIT)
      .map(([traceId, entry]) =>
        entry.trace
          ? traceOccurrence(entry.trace, entry.count, { timestamp: entry.timestamp })
          : { traceId, timestamp: entry.timestamp, occurrences: entry.count },
      )
    findings.push({
      id: diagnosticFindingId(rule.id, findingFingerprint),
      ruleId: rule.id,
      ruleVersion: RULE_VERSION,
      category: rule.category,
      severity: rule.severity,
      status: 'observed',
      title: repeated
        ? `Repeated request error: ${safeName}`
        : `Request error: ${safeName}`,
      summary: repeated
        ? `${sorted.length} occurrences across ${affectedTraceCount} trace${affectedTraceCount === 1 ? '' : 's'} on ${routeLabel} share a route-aware error signature.`
        : `${sorted.length} occurrence${sorted.length === 1 ? '' : 's'} on ${routeLabel} at ${formatTimestamp(latest.error.timestamp)}.`,
      detail: `The latest occurrence is ${latest.error.id} at ${formatTimestamp(latest.error.timestamp)}. Grouping uses the normalized error name, message, stack shape and operation category (${operation}); grouping is heuristic and does not establish a root cause.${nextContext ? ` Next.js context: ${nextContext}.` : ''}${deepestText}${statusCode === null ? '' : ` The correlated request returned ${statusCode}.`}`,
      route,
      method,
      traceIds,
      affectedTraceCount,
      firstSeen,
      lastSeen,
      fingerprint: findingFingerprint,
      evidence: {
        traceIds,
        spans: deepestSpans.map(spanEvidenceForNode),
        queries: [],
        errors: sorted
          .slice(-ERROR_EVIDENCE_LIMIT)
          .reverse()
          .map((entry) =>
            errorEvidence(
              entry.error,
              groupFingerprint,
              entry.trace,
              entry.deepest,
            ),
          ),
        contributors: traceForContributors
          ? boundedContributors(
              contributorsForTrace(traceForContributors, 5).map(contributorForNode),
            )
          : [],
        traces: errorTraces,
        measurements: [
          { label: 'occurrences', value: sorted.length },
          { label: 'traces', value: affectedTraceCount },
          { label: 'repeated threshold', value: context.config.errorGroupMin },
          { label: 'grouped', value: context.config.errorGrouping },
          { label: 'operation category', value: operation },
          { label: 'latest error id', value: latest.error.id },
          { label: 'route type', value: latest.error.routeType ?? null },
          { label: 'render type', value: latest.error.renderType ?? null },
          { label: 'status code', value: statusCode },
        ] satisfies DiagnosticMeasurement[],
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
        'Next.js not-found and redirect control-flow errors are excluded from this rule.',
      ],
    })
  }
  return findings
}

function serverErrorFindings(context: RuleContext): DiagnosticFinding[] {
  const rule = ruleSummary('server-error-response')
  const errorsByTrace = new Map<string, StackNextError[]>()
  for (const error of context.snapshot.errors) {
    if (isControlFlowError(error)) continue
    const traceId = error.resolvedTraceId ?? error.traceId ?? null
    if (!traceId) continue
    const existing = errorsByTrace.get(traceId)
    if (existing) existing.push(error)
    else errorsByTrace.set(traceId, [error])
  }

  interface ServerErrorGroup {
    key: string
    routeKey: string
    route: string | null
    method: string | null
    statusCode: number
    traces: DiagnosticTraceModel[]
  }

  const groups = new Map<string, ServerErrorGroup>()
  for (const group of routeGroups(context.index.requestTraces)) {
    for (const trace of group.traces) {
      const statusCode = trace.statusCode
      if (statusCode === null || statusCode < 500 || statusCode > 599) continue
      if ((errorsByTrace.get(trace.traceId)?.length ?? 0) > 0) continue
      const key = `${group.key}\u0000${statusCode}`
      const existing = groups.get(key)
      if (existing) existing.traces.push(trace)
      else {
        groups.set(key, {
          key,
          routeKey: group.key,
          route: group.route,
          method: group.method,
          statusCode,
          traces: [trace],
        })
      }
    }
  }

  const findings: DiagnosticFinding[] = []
  for (const group of groups.values()) {
    const routeTraces =
      context.index.requestTraces.filter(
        (trace) =>
          (trace.routeKey ?? methodFromRequest(trace) ?? 'unknown-route') === group.routeKey,
      )
    group.traces.sort(
      (a, b) => a.startTime - b.startTime || a.traceId.localeCompare(b.traceId),
    )
    const representative = group.traces[group.traces.length - 1]!
    const contributors = contributorsForTrace(representative, 5)
    const representativeSpans = [
      ...(representative.root ? [representative.root] : []),
      ...contributors,
    ]
      .filter(
        (node, index, list) =>
          list.findIndex((entry) => entry.span.spanId === node.span.spanId) === index,
      )
      .slice(0, SPAN_EVIDENCE_LIMIT)
    const findingFingerprint = fingerprint([
      rule.id,
      group.method ?? '',
      group.route ?? '',
      String(group.statusCode),
    ])
    const routeLabel = group.routeKey
    findings.push({
      id: diagnosticFindingId(rule.id, findingFingerprint, group.routeKey),
      ruleId: rule.id,
      ruleVersion: RULE_VERSION,
      category: rule.category,
      severity: rule.severity,
      status: 'observed',
      title: `Server error responses: ${routeLabel} returned ${group.statusCode}`,
      summary: `${group.traces.length} of ${routeTraces.length} ${routeLabel} requests returned ${group.statusCode} without a correlated error record.`,
      detail: `The request root reported HTTP ${group.statusCode}, but no non-control-flow error record was correlated with ${group.traces.length === 1 ? 'the trace' : 'these traces'}. The status is observed; the cause is unknown. The application may have returned the status without throwing, or the error hook may not have run.`,
      route: group.route,
      method: group.method,
      traceIds: limitTraceIds(group.traces.map((trace) => trace.traceId)),
      affectedTraceCount: group.traces.length,
      firstSeen: Math.min(...group.traces.map((trace) => trace.request?.timestamp ?? trace.startTime)),
      lastSeen: Math.max(...group.traces.map((trace) => trace.request?.timestamp ?? trace.startTime)),
      fingerprint: findingFingerprint,
      evidence: {
        traceIds: limitTraceIds(group.traces.map((trace) => trace.traceId)),
        spans: representativeSpans.map(spanEvidenceForNode),
        queries: [],
        errors: [],
        contributors: boundedContributors(contributors.map(contributorForNode)),
        traces: group.traces.slice(-TRACE_EVIDENCE_LIMIT).map((trace) =>
          traceOccurrence(trace, 1, {
            durationMs: trace.requestDurationMs,
            contributor: contributorsForTrace(trace, 1)[0]?.span.nextSpanName ??
              contributorsForTrace(trace, 1)[0]?.span.name ??
              null,
          }),
        ),
        measurements: [
          { label: 'server error responses', value: group.traces.length },
          { label: 'requests on route', value: routeTraces.length },
          {
            label: 'response rate',
            value: Math.round((group.traces.length / Math.max(1, routeTraces.length)) * 1000) / 10,
            unit: '%',
          },
          { label: 'status code', value: group.statusCode },
          { label: 'correlated error records', value: 0 },
        ] satisfies DiagnosticMeasurement[],
      },
      verification: [
        'Inspect the request trace and response status before changing code.',
        'Check whether the route intentionally returns this status without throwing.',
        'Verify the error hook runs for the same route in a fresh reproduction.',
      ],
      limitations: [
        SAMPLE_LIMITATION,
        'Only the response status is observed; StackNext does not capture response bodies or headers.',
        'A missing error record can mean the app did not throw, the error hook did not run, or the record aged out.',
        'Request-level rules only analyze traces with a captured request root.',
      ],
    })
  }
  return findings
}

export function evaluateDiagnosticRules(context: DiagnosticRuleContext): DiagnosticFinding[] {
  const index = context.traceIndex ?? buildTraceIndex(context.snapshot)
  const ruleContext: RuleContext = {
    snapshot: context.snapshot,
    config: context.config,
    slowRequestMs: context.slowRequestMs,
    index,
  }
  const findings = [
    ...nPlusOneFindings(ruleContext),
    ...slowRequestFindings(ruleContext),
    ...slowSpanFindings(ruleContext),
    ...repeatedHttpFindings(ruleContext),
    ...errorFindings(ruleContext),
    ...serverErrorFindings(ruleContext),
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
