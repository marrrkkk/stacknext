import type {
  DatabaseQueryListItem,
  ErrorListItem,
  StackNextDatabaseQuery,
  StackNextError,
  StackNextSpan,
  RequestSummary,
} from './types.js'

export const STACKNEXT_DIAGNOSTICS_FORMAT = 'stacknext-diagnostics'
export const STACKNEXT_DIAGNOSTICS_FORMAT_VERSION = 1
export const STACKNEXT_DIAGNOSTICS_RULE_SET_VERSION = 2

export const DIAGNOSTIC_CATEGORIES = [
  'database',
  'http',
  'performance',
  'errors',
  'runtime',
] as const
export type DiagnosticCategory = (typeof DIAGNOSTIC_CATEGORIES)[number]

export const DIAGNOSTIC_SEVERITIES = ['info', 'warning', 'error'] as const
export type DiagnosticSeverity = (typeof DIAGNOSTIC_SEVERITIES)[number]

export const DIAGNOSTIC_STATUSES = [
  'observed',
  'possible',
  'insufficient-evidence',
] as const
export type DiagnosticStatus = (typeof DIAGNOSTIC_STATUSES)[number]

export const DIAGNOSTIC_RULE_IDS = [
  'n-plus-one-queries',
  'slow-request',
  'slow-span',
  'repeated-external-http',
  'error-fingerprint',
  'server-error-response',
] as const
export type DiagnosticRuleId = (typeof DIAGNOSTIC_RULE_IDS)[number]

export interface DiagnosticRuleSummary {
  id: DiagnosticRuleId
  label: string
  category: DiagnosticCategory
  severity: DiagnosticSeverity
  description: string
}

export const DIAGNOSTIC_RULES: readonly DiagnosticRuleSummary[] = [
  {
    id: 'n-plus-one-queries',
    label: 'Possible N+1 queries',
    category: 'database',
    severity: 'warning',
    description:
      'The same SQL shape runs repeatedly in request traces. This is consistent with a per-item query loop, but it is not proof of an N+1 bug.',
  },
  {
    id: 'slow-request',
    label: 'Slow request',
    category: 'performance',
    severity: 'warning',
    description:
      'A request root exceeds the configured request threshold. StackNext attributes self time to the deepest measured spans and names the dominant contributor without claiming causality.',
  },
  {
    id: 'slow-span',
    label: 'Slow operation',
    category: 'performance',
    severity: 'warning',
    description:
      'A measured span exceeds its category threshold when the enclosing request is not already reported as slow. Duration is evaluated as self time, not as inclusive child time.',
  },
  {
    id: 'repeated-external-http',
    label: 'Repeated HTTP calls',
    category: 'http',
    severity: 'warning',
    description:
      'The same outbound HTTP endpoint is called repeatedly from one route. Cache status and same-app/external origin are reported as evidence; repeated calls can be intentional.',
  },
  {
    id: 'error-fingerprint',
    label: 'Request errors',
    category: 'errors',
    severity: 'error',
    description:
      'A single or repeated request error is reported with its Next.js route context. Grouping is heuristic and does not establish a root cause.',
  },
  {
    id: 'server-error-response',
    label: 'Server error response',
    category: 'errors',
    severity: 'error',
    description:
      'A request returned a 5xx response without a correlated error record. The status is observed; the cause is unknown.',
  },
]

export interface DiagnosticMeasurement {
  label: string
  value: number | string | boolean | null
  unit?: string
}

export type DiagnosticSpanCategory =
  | 'database'
  | 'http'
  | 'custom'
  | 'framework'
  | 'other'

export const DIAGNOSTIC_NEXT_PHASES = [
  'request',
  'routing',
  'render',
  'route-handler',
  'fetch',
  'database',
  'client-components',
  'response',
  'middleware',
  'custom',
  'other',
] as const
export type DiagnosticNextPhase = (typeof DIAGNOSTIC_NEXT_PHASES)[number]

export interface DiagnosticSpanEvidence {
  spanId: string
  traceId: string
  name: string
  durationMs: number
  /** Duration after subtracting the union of direct child intervals. */
  selfDurationMs?: number
  category: DiagnosticSpanCategory
  status: string
  route?: string
  nextSpanType?: string
  nextPhase?: DiagnosticNextPhase
  parentSpanId?: string
  isRequestRoot?: boolean
}

export interface DiagnosticQueryEvidence {
  id: string
  traceId: string | null
  spanId?: string
  sqlFingerprint: string
  sqlPreview: string
  durationMs: number | null
  databaseSystem: string
  operation?: string
  success: boolean
  timestamp: number
}

export interface DiagnosticErrorEvidence {
  id: string
  name: string
  message: string
  timestamp: number
  route?: string
  method?: string
  traceId: string | null
  fingerprint: string
  routeType?: string
  renderSource?: string
  renderType?: string
  revalidateReason?: string
  routerKind?: string
  digest?: string
  statusCode?: number
  spanId?: string
}

export interface DiagnosticContributor {
  traceId?: string
  spanId?: string
  label: string
  category: DiagnosticSpanCategory
  phase?: DiagnosticNextPhase
  selfMs: number
  durationMs?: number
}

export interface DiagnosticTraceOccurrence {
  traceId: string
  timestamp: number
  /** Query, call or error occurrences in this trace; one for slow requests. */
  occurrences: number
  durationMs?: number
  contributor?: string
}

export interface DiagnosticEvidence {
  traceIds: string[]
  spans: DiagnosticSpanEvidence[]
  queries: DiagnosticQueryEvidence[]
  errors: DiagnosticErrorEvidence[]
  contributors: DiagnosticContributor[]
  traces: DiagnosticTraceOccurrence[]
  measurements: DiagnosticMeasurement[]
}

export interface DiagnosticFinding {
  id: string
  ruleId: DiagnosticRuleId
  ruleVersion: number
  category: DiagnosticCategory
  severity: DiagnosticSeverity
  status: DiagnosticStatus
  title: string
  summary: string
  detail: string
  route: string | null
  method: string | null
  traceIds: string[]
  /** Number of distinct traces matched, even when traceIds is capped. */
  affectedTraceCount: number
  firstSeen: number
  lastSeen: number
  fingerprint: string
  evidence: DiagnosticEvidence
  verification: string[]
  limitations: string[]
}

export interface DiagnosticSample {
  firstEventTime: number | null
  lastEventTime: number | null
  retentionMs: number
  requests: number
  spans: number
  errors: number
  databaseQueries: number
  connectedInstances: number
  connected: boolean
  /** Request traces used by request-level rules. */
  requestTraces?: number
  /** Traces excluded because no request root was captured. */
  tracesWithoutRequestRoot?: number
  /** Request traces with at least one missing parent span. */
  tracesWithMissingParents?: number
  /** Spans that could not be attributed to a request root. */
  unattributedSpans?: number
  /** Next.js control-flow errors ignored by the error rule. */
  ignoredControlFlowErrors?: number
  /** 5xx request traces without a correlated error record. */
  serverErrorsWithoutError?: number
}

export interface DiagnosticCounts {
  total: number
  bySeverity: Record<DiagnosticSeverity, number>
  byCategory: Record<DiagnosticCategory, number>
  byStatus: Record<DiagnosticStatus, number>
}

export interface DiagnosticReport {
  format: typeof STACKNEXT_DIAGNOSTICS_FORMAT
  version: typeof STACKNEXT_DIAGNOSTICS_FORMAT_VERSION
  engineVersion: string
  ruleSetVersion: number
  generatedAt: number
  projectName: string
  collectorVersion: string
  sample: DiagnosticSample
  counts: DiagnosticCounts
  findings: DiagnosticFinding[]
  notes: string[]
  limitations: string[]
}

export interface DiagnosticOverview {
  generatedAt: number
  engineVersion: string
  ruleSetVersion: number
  sample: DiagnosticSample
  counts: DiagnosticCounts
  topFindings: DiagnosticFinding[]
  limitations: string[]
}

export interface DiagnosticFilters {
  limit?: number
  offset?: number
  category?: DiagnosticCategory
  severity?: DiagnosticSeverity
  status?: DiagnosticStatus
  ruleId?: DiagnosticRuleId
  route?: string
  traceId?: string
  since?: number
  until?: number
  q?: string
}

export interface DiagnosticListResponse {
  items: DiagnosticFinding[]
  total: number
  limit: number
  offset: number
  generatedAt: number
  engineVersion: string
  ruleSetVersion: number
  sample: DiagnosticSample
  counts: DiagnosticCounts
  notes: string[]
  limitations: string[]
}

export interface DiagnosticReference {
  id: string
  ruleId: DiagnosticRuleId
  category: DiagnosticCategory
  severity: DiagnosticSeverity
  status: DiagnosticStatus
  title: string
}

export interface DiagnosticTraceContext {
  traceId: string
  request: RequestSummary | null
  startTime: number
  endTime: number
  durationMs: number
  spanCount: number
  errorCount: number
  databaseQueryCount: number
  spans: StackNextSpan[]
  errors: StackNextError[]
  databaseQueries: StackNextDatabaseQuery[]
  missingParentSpanIds: string[]
}

export interface DiagnosticDetailResponse {
  finding: DiagnosticFinding
  trace: DiagnosticTraceContext | null
}

/** Store snapshot consumed by the diagnostics engine. */
export interface DiagnosticSnapshot {
  revision: number
  spans: StackNextSpan[]
  errors: ErrorListItem[]
  databaseQueries: DatabaseQueryListItem[]
  requests: RequestSummary[]
  firstEventTime: number | null
  lastEventTime: number | null
  retentionMs: number
}

export function diagnosticReference(finding: DiagnosticFinding): DiagnosticReference {
  return {
    id: finding.id,
    ruleId: finding.ruleId,
    category: finding.category,
    severity: finding.severity,
    status: finding.status,
    title: finding.title,
  }
}
