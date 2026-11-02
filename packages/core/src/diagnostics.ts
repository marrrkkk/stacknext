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
export const STACKNEXT_DIAGNOSTICS_RULE_SET_VERSION = 1

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
  'slow-span',
  'repeated-external-http',
  'error-fingerprint',
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
      'The same SQL shape runs repeatedly inside one trace. This is consistent with a per-item query loop, but it is not proof of an N+1 bug.',
  },
  {
    id: 'slow-span',
    label: 'Slow span',
    category: 'performance',
    severity: 'warning',
    description:
      'A measured span exceeds the configured threshold for its category. Span duration includes child work and is not a sum of overlapping work.',
  },
  {
    id: 'repeated-external-http',
    label: 'Repeated HTTP calls',
    category: 'http',
    severity: 'warning',
    description:
      'The same outbound HTTP endpoint is called repeatedly inside one trace. This may indicate missing caching or request deduplication, but repeated calls can be intentional.',
  },
  {
    id: 'error-fingerprint',
    label: 'Repeated error group',
    category: 'errors',
    severity: 'error',
    description:
      'A route-independent error signature occurs more than once in the sample. Grouping is heuristic and does not establish a root cause.',
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

export interface DiagnosticSpanEvidence {
  spanId: string
  traceId: string
  name: string
  durationMs: number
  category: DiagnosticSpanCategory
  status: string
  route?: string
  nextSpanType?: string
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
}

export interface DiagnosticEvidence {
  traceIds: string[]
  spans: DiagnosticSpanEvidence[]
  queries: DiagnosticQueryEvidence[]
  errors: DiagnosticErrorEvidence[]
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
