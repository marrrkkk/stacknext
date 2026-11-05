import {
  REQUEST_ROOT_SPAN_TYPES,
  RENDER_SPAN_TYPES,
  ROUTE_HANDLER_SPAN_TYPES,
  type DiagnosticContributor,
  type DiagnosticNextPhase,
  type DiagnosticSnapshot,
  type DiagnosticSpanEvidence,
  type RequestSummary,
  type StackNextSpan,
} from '@stacknext/core'
import { diagnosticSpanCategory, safeRoute, safeSpanName } from './classify.js'
import { normalizePath } from './fingerprints.js'

/** Tolerance used when a child span appears outside its parent interval. */
const CLOCK_SKEW_TOLERANCE_MS = 50

const ROUTING_SPAN_TYPES = new Set([
  'NextNodeServer.findPageComponents',
  'LoadComponents.loadRouteModule',
  'RouteModule.prepare',
  'AppRouteRouteModule.loadUserland',
  'NextNodeServer.getLayoutOrPageModule',
])

const CLIENT_COMPONENT_SPAN_TYPES = new Set(['NextNodeServer.clientComponentLoading'])
const RESPONSE_SPAN_TYPES = new Set(['NextNodeServer.startResponse'])
const MIDDLEWARE_SPAN_TYPES = new Set(['Middleware.execute'])

export interface TraceSpanNode {
  span: StackNextSpan
  parent: TraceSpanNode | null
  children: TraceSpanNode[]
  depth: number
  /** Duration after subtracting the union of direct child intervals. */
  selfMs: number
  /** True for the request root and its descendants. */
  attributed: boolean
  phase: DiagnosticNextPhase
}

export interface DiagnosticTraceModel {
  traceId: string
  request: RequestSummary | null
  root: TraceSpanNode | null
  nodes: TraceSpanNode[]
  bySpanId: Map<string, TraceSpanNode>
  route: string | null
  method: string | null
  routeKey: string | null
  requestDurationMs: number | null
  statusCode: number | null
  startTime: number
  endTime: number
  missingParentSpanIds: string[]
  unattributedSpanCount: number
  clockSkewSpanIds: string[]
  deepestErrorSpan: TraceSpanNode | null
}

export interface RouteTraceStat {
  route: string
  method: string | null
  routeKey: string
  traces: DiagnosticTraceModel[]
}

export interface DiagnosticTraceIndex {
  traces: Map<string, DiagnosticTraceModel>
  requestTraces: DiagnosticTraceModel[]
  tracesWithoutRequestRoot: DiagnosticTraceModel[]
  requestByTrace: Map<string, RequestSummary>
  missingParentTraceIds: Set<string>
  clockSkewTraceIds: Set<string>
  unattributedSpans: number
}

export interface Interval {
  start: number
  end: number
}

export function roundMs(value: number, digits = 1): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function sortedIntervals(intervals: Interval[]): Interval[] {
  return intervals
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)
}

/** Union of clipped intervals. Overlapping child spans are counted once. */
export function intervalUnionDuration(
  intervals: Interval[],
  windowStart: number,
  windowEnd: number,
): number {
  const clipped = sortedIntervals(
    intervals
      .map((interval) => ({
        start: Math.max(windowStart, interval.start),
        end: Math.min(windowEnd, interval.end),
      }))
      .filter((interval) => interval.end > interval.start),
  )
  let total = 0
  let currentStart = Number.NaN
  let currentEnd = Number.NaN
  for (const interval of clipped) {
    if (Number.isNaN(currentStart)) {
      currentStart = interval.start
      currentEnd = interval.end
    } else if (interval.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.end)
    } else {
      total += currentEnd - currentStart
      currentStart = interval.start
      currentEnd = interval.end
    }
  }
  if (!Number.isNaN(currentStart)) total += currentEnd - currentStart
  return Math.max(0, total)
}

export function nextPhaseForSpan(span: StackNextSpan): DiagnosticNextPhase {
  const category = diagnosticSpanCategory(span)
  if (category === 'database') return 'database'
  if (category === 'http') return 'fetch'
  if (category === 'custom') return 'custom'
  const type = span.nextSpanType
  if (type && REQUEST_ROOT_SPAN_TYPES.has(type)) return 'request'
  if (type && ROUTE_HANDLER_SPAN_TYPES.has(type)) return 'route-handler'
  if (type && RENDER_SPAN_TYPES.has(type)) return 'render'
  if (type && ROUTING_SPAN_TYPES.has(type)) return 'routing'
  if (type && CLIENT_COMPONENT_SPAN_TYPES.has(type)) return 'client-components'
  if (type && RESPONSE_SPAN_TYPES.has(type)) return 'response'
  if (type && MIDDLEWARE_SPAN_TYPES.has(type)) return 'middleware'
  if (!type && span.kind === 'server' && !span.parentSpanId) return 'request'
  if (type !== undefined) return 'other'
  return 'other'
}

function methodFromName(name: string): string | null {
  const match = /^([A-Z]+)\s+/.exec(name)
  return match?.[1]?.toUpperCase() ?? null
}

function requestPathFromName(name: string): string | null {
  const match = /^[A-Z]+\s+(\S+)/.exec(name)
  return match?.[1] ?? null
}

export function normalizeRoute(route: string): string {
  const normalized = normalizePath(route)
  return normalized === '' ? '/' : normalized
}

export function routeForRequest(
  request: RequestSummary | null,
  root: StackNextSpan | null,
): string | null {
  const direct = safeRoute(request?.route) ?? safeRoute(root?.nextRoute) ?? safeRoute(root?.route)
  if (direct) return normalizeRoute(direct)
  const candidate = request?.name ?? root?.name
  if (!candidate) return null
  const path = requestPathFromName(candidate)
  return path ? normalizeRoute(path) : null
}

export function methodForRequest(
  request: RequestSummary | null,
  root: StackNextSpan | null,
): string | null {
  return request?.method ?? root?.method ?? (root ? methodFromName(root.name) : null)
}

export function routeKeyFor(
  route: string | null,
  method: string | null,
): string | null {
  if (!route) return null
  return method ? `${method} ${route}` : route
}

function isRequestRootCandidate(span: StackNextSpan): boolean {
  return (
    (span.nextSpanType !== undefined && REQUEST_ROOT_SPAN_TYPES.has(span.nextSpanType)) ||
    (span.kind === 'server' && !span.parentSpanId)
  )
}

function pickRequestRoot(nodes: TraceSpanNode[], request: RequestSummary | null): TraceSpanNode | null {
  const candidates = nodes
    .filter((node) => isRequestRootCandidate(node.span))
    .sort(
      (a, b) =>
        Number(a.parent !== null) - Number(b.parent !== null) ||
        a.span.startTime - b.span.startTime ||
        b.span.durationMs - a.span.durationMs ||
        a.span.spanId.localeCompare(b.span.spanId),
    )
  if (candidates.length === 0) return null
  if (request) {
    const exact = candidates.find(
      (node) =>
        node.span.name === request.name ||
        (request.route !== null && node.span.nextRoute === request.route),
    )
    if (exact) return exact
  }
  return candidates[0] ?? null
}

function markAttributed(root: TraceSpanNode | null): void {
  if (!root) return
  const stack: Array<{ node: TraceSpanNode; depth: number }> = [{ node: root, depth: 0 }]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) break
    current.node.attributed = true
    current.node.depth = current.depth
    for (const child of current.node.children) {
      stack.push({ node: child, depth: current.depth + 1 })
    }
  }
}

function traceErrorSpan(nodes: TraceSpanNode[]): TraceSpanNode | null {
  return (
    nodes
      .filter((node) => node.attributed && node.span.status === 'error')
      .sort(
        (a, b) =>
          b.depth - a.depth ||
          b.span.startTime - a.span.startTime ||
          a.span.spanId.localeCompare(b.span.spanId),
      )[0] ?? null
  )
}

function buildTraceModel(
  traceId: string,
  spans: StackNextSpan[],
  request: RequestSummary | null,
): DiagnosticTraceModel {
  const sorted = [...spans].sort(
    (a, b) => a.startTime - b.startTime || a.spanId.localeCompare(b.spanId),
  )
  const nodes: TraceSpanNode[] = sorted.map((span) => ({
    span,
    parent: null,
    children: [],
    depth: 0,
    selfMs: 0,
    attributed: false,
    phase: nextPhaseForSpan(span),
  }))
  const bySpanId = new Map(nodes.map((node) => [node.span.spanId, node]))
  const missingParentSpanIds = new Set<string>()
  for (const node of nodes) {
    const parentId = node.span.parentSpanId
    if (!parentId) continue
    const parent = bySpanId.get(parentId)
    if (!parent) {
      missingParentSpanIds.add(parentId)
      continue
    }
    node.parent = parent
    parent.children.push(node)
  }
  for (const node of nodes) {
    node.children.sort(
      (a, b) => a.span.startTime - b.span.startTime || a.span.spanId.localeCompare(b.span.spanId),
    )
  }
  const root = pickRequestRoot(nodes, request)
  markAttributed(root)
  const clockSkewSpanIds: string[] = []
  for (const node of nodes) {
    const windowStart = node.span.startTime
    const windowEnd = node.span.startTime + Math.max(0, node.span.durationMs)
    const childIntervals: Interval[] = []
    for (const child of node.children) {
      childIntervals.push({ start: child.span.startTime, end: child.span.endTime })
      if (
        child.span.startTime < windowStart - CLOCK_SKEW_TOLERANCE_MS ||
        child.span.endTime > windowEnd + CLOCK_SKEW_TOLERANCE_MS
      ) {
        clockSkewSpanIds.push(child.span.spanId)
      }
    }
    const childDuration = intervalUnionDuration(childIntervals, windowStart, windowEnd)
    node.selfMs = Math.max(0, Math.max(0, node.span.durationMs) - childDuration)
  }
  const startTime =
    nodes.length > 0 ? Math.min(...nodes.map((node) => node.span.startTime)) : 0
  const endTime =
    nodes.length > 0
      ? Math.max(...nodes.map((node) => node.span.endTime))
      : startTime
  const route = routeForRequest(request, root?.span ?? null)
  const method = methodForRequest(request, root?.span ?? null)
  return {
    traceId,
    request,
    root,
    nodes,
    bySpanId,
    route,
    method,
    routeKey: routeKeyFor(route, method),
    requestDurationMs:
      request?.durationMs !== null && request?.durationMs !== undefined
        ? Math.max(0, request.durationMs)
        : root
          ? Math.max(0, root.span.durationMs)
          : null,
    statusCode: request?.statusCode ?? root?.span.statusCode ?? null,
    startTime,
    endTime,
    missingParentSpanIds: [...missingParentSpanIds].sort(),
    unattributedSpanCount: nodes.filter((node) => !node.attributed).length,
    clockSkewSpanIds: [...new Set(clockSkewSpanIds)].sort(),
    deepestErrorSpan: traceErrorSpan(nodes),
  }
}

export function buildTraceIndex(snapshot: DiagnosticSnapshot): DiagnosticTraceIndex {
  const requestByTrace = new Map(snapshot.requests.map((request) => [request.traceId, request]))
  const spansByTrace = new Map<string, StackNextSpan[]>()
  for (const span of snapshot.spans) {
    const existing = spansByTrace.get(span.traceId)
    if (existing) existing.push(span)
    else spansByTrace.set(span.traceId, [span])
  }
  const traceIds = new Set([...spansByTrace.keys(), ...requestByTrace.keys()])
  for (const error of snapshot.errors) {
    const traceId = error.resolvedTraceId ?? error.traceId ?? null
    if (traceId) traceIds.add(traceId)
  }
  const traces = new Map<string, DiagnosticTraceModel>()
  for (const traceId of traceIds) {
    traces.set(
      traceId,
      buildTraceModel(
        traceId,
        spansByTrace.get(traceId) ?? [],
        requestByTrace.get(traceId) ?? null,
      ),
    )
  }
  const models = [...traces.values()]
  const requestTraces = models
    .filter((trace) => trace.root !== null)
    .sort((a, b) => a.startTime - b.startTime || a.traceId.localeCompare(b.traceId))
  const tracesWithoutRequestRoot = models
    .filter((trace) => trace.root === null)
    .sort((a, b) => a.startTime - b.startTime || a.traceId.localeCompare(b.traceId))
  return {
    traces,
    requestTraces,
    tracesWithoutRequestRoot,
    requestByTrace,
    missingParentTraceIds: new Set(
      models.filter((trace) => trace.missingParentSpanIds.length > 0).map((trace) => trace.traceId),
    ),
    clockSkewTraceIds: new Set(
      models.filter((trace) => trace.clockSkewSpanIds.length > 0).map((trace) => trace.traceId),
    ),
    unattributedSpans: models.reduce((sum, trace) => sum + trace.unattributedSpanCount, 0),
  }
}

export function routeTraceStats(index: DiagnosticTraceIndex): Map<string, RouteTraceStat> {
  const groups = new Map<string, RouteTraceStat>()
  for (const trace of index.requestTraces) {
    if (!trace.route || !trace.routeKey) continue
    const existing = groups.get(trace.routeKey)
    if (existing) existing.traces.push(trace)
    else {
      groups.set(trace.routeKey, {
        route: trace.route,
        method: trace.method,
        routeKey: trace.routeKey,
        traces: [trace],
      })
    }
  }
  for (const group of groups.values()) {
    group.traces.sort((a, b) => a.startTime - b.startTime || a.traceId.localeCompare(b.traceId))
  }
  return groups
}

export function contributorsForTrace(
  trace: DiagnosticTraceModel,
  limit = 5,
): TraceSpanNode[] {
  return trace.nodes
    .filter((node) => node.attributed && node.selfMs > 0)
    .sort(
      (a, b) =>
        b.selfMs - a.selfMs ||
        b.depth - a.depth ||
        b.span.startTime - a.span.startTime ||
        a.span.spanId.localeCompare(b.span.spanId),
    )
    .slice(0, Math.max(1, limit))
}

export function spanEvidenceForNode(node: TraceSpanNode): DiagnosticSpanEvidence {
  const route = safeRoute(node.span.route ?? node.span.nextRoute)
  return {
    spanId: node.span.spanId,
    traceId: node.span.traceId,
    name: safeSpanName(node.span.name),
    durationMs: roundMs(node.span.durationMs),
    selfDurationMs: roundMs(node.selfMs),
    category: diagnosticSpanCategory(node.span),
    status: node.span.status,
    ...(route ? { route } : {}),
    ...(node.span.nextSpanType ? { nextSpanType: node.span.nextSpanType } : {}),
    nextPhase: node.phase,
    ...(node.span.parentSpanId ? { parentSpanId: node.span.parentSpanId } : {}),
    isRequestRoot: isRequestRootNode(node),
  }
}

export function contributorForNode(node: TraceSpanNode): DiagnosticContributor {
  const label = safeSpanName(node.span.nextSpanName ?? node.span.name)
  return {
    traceId: node.span.traceId,
    spanId: node.span.spanId,
    label: label.length > 160 ? `${label.slice(0, 160)}…` : label,
    category: diagnosticSpanCategory(node.span),
    phase: node.phase,
    selfMs: roundMs(node.selfMs),
    durationMs: roundMs(node.span.durationMs),
  }
}

export function deepestErrorSpanForTrace(
  trace: DiagnosticTraceModel,
): TraceSpanNode | null {
  return trace.deepestErrorSpan
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? null
  const left = sorted[middle - 1]
  const right = sorted[middle]
  return left === undefined || right === undefined ? null : (left + right) / 2
}

export function maxValue(values: number[]): number | null {
  return values.length === 0 ? null : Math.max(...values)
}

export function minValue(values: number[]): number | null {
  return values.length === 0 ? null : Math.min(...values)
}

export function isRequestRootNode(node: TraceSpanNode): boolean {
  return node.parent === null && node.attributed
}
