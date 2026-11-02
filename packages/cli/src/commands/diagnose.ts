import type { Command } from 'commander'
import {
  DIAGNOSTIC_CATEGORIES,
  DIAGNOSTIC_RULE_IDS,
  DIAGNOSTIC_SEVERITIES,
  DIAGNOSTIC_STATUSES,
  type DiagnosticCategory,
  type DiagnosticDetailResponse,
  type DiagnosticFinding,
  type DiagnosticListResponse,
  type DiagnosticRuleId,
  type DiagnosticSeverity,
  type DiagnosticStatus,
} from '@stacknext/core'
import { collectorJson } from '../http.js'
import {
  formatDuration,
  formatRelativeTime,
  printBanner,
  style,
} from '../output.js'
import { requireRunningState } from '../session.js'
import { CLI_VERSION } from '../version.js'

export interface DiagnoseOptions {
  json?: boolean
  id?: string
  traceId?: string
  category?: string
  severity?: string
  status?: string
  rule?: string
  route?: string
  since?: string
  until?: string
  limit?: string
  offset?: string
  q?: string
}

function parseChoice<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  label: string,
): T | undefined {
  if (!value) return undefined
  if (!allowed.includes(value as T)) {
    throw new Error(`Invalid ${label} "${value}". Use one of: ${allowed.join(', ')}`)
  }
  return value as T
}

function parseTimestamp(value: string | undefined, label: string): number | undefined {
  if (!value) return undefined
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric
  const parsed = Date.parse(value)
  if (Number.isFinite(parsed)) return parsed
  throw new Error(`Invalid ${label} "${value}". Use an ISO timestamp or epoch milliseconds.`)
}

function parseInteger(value: string | undefined, label: string): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${label} "${value}". Use a non-negative number.`)
  }
  return Math.trunc(parsed)
}

function severityMarker(severity: DiagnosticSeverity): string {
  if (severity === 'error') return style.red('✗')
  if (severity === 'warning') return style.yellow('!')
  return style.cyan('·')
}

function findingLine(finding: DiagnosticFinding, now: number): string {
  const location = finding.route ? ` ${style.dim(finding.route)}` : ''
  const lastSeen = formatRelativeTime(finding.lastSeen, now)
  return `${severityMarker(finding.severity)} ${style.bold(finding.title)}${location}\n   ${style.dim(
    `${finding.status} · ${finding.ruleId} · last ${lastSeen} · ${finding.id}`,
  )}`
}

function evidenceCount(finding: DiagnosticFinding): string {
  const counts: string[] = []
  if (finding.evidence.spans.length > 0) counts.push(`${finding.evidence.spans.length} spans`)
  if (finding.evidence.queries.length > 0) counts.push(`${finding.evidence.queries.length} queries`)
  if (finding.evidence.errors.length > 0) counts.push(`${finding.evidence.errors.length} errors`)
  return counts.join(', ')
}

export function formatDiagnosticList(
  response: DiagnosticListResponse,
  now = Date.now(),
): string {
  const lines: string[] = []
  lines.push(
    `${style.bold('StackNext diagnostics')} ${style.dim(
      `v${response.engineVersion} · rules ${response.ruleSetVersion}`,
    )}`,
  )
  lines.push(
    `Sample      ${response.sample.requests} requests, ${response.sample.spans} spans, ${response.sample.errors} errors, ${response.sample.databaseQueries} database queries`,
  )
  lines.push(
    `Findings    ${response.total} total · ${response.counts.bySeverity.error} error, ${response.counts.bySeverity.warning} warning, ${response.counts.bySeverity.info} info`,
  )
  lines.push(
    `Statuses    ${DIAGNOSTIC_STATUSES.map(
      (status) => `${status} ${response.counts.byStatus[status]}`,
    ).join(', ')}`,
  )
  lines.push(
    style.dim(
      'Findings are deterministic evidence from the current retention window, not confirmed root causes.',
    ),
  )

  if (response.items.length === 0) {
    lines.push('')
    lines.push('No diagnostic findings matched the filters.')
  } else {
    for (const finding of response.items) {
      lines.push('')
      lines.push(findingLine(finding, now))
      lines.push(`   ${finding.summary}`)
      const counts = evidenceCount(finding)
      const trace = finding.traceIds[0]
      if (counts || trace) {
        lines.push(
          style.dim(
            `   ${counts}${counts && trace ? ' · ' : ''}${trace ? `trace ${trace}` : ''}`,
          ),
        )
      }
      lines.push(style.dim(`   verify: ${finding.verification[0] ?? 'Review the evidence.'}`))
    }
    if (response.total > response.items.length) {
      lines.push('')
      lines.push(
        style.dim(
          `Showing ${response.items.length} of ${response.total}. Use --limit/--offset or narrow the filters.`,
        ),
      )
    }
  }

  if (response.notes.length > 0) {
    lines.push('')
    lines.push(style.bold('Notes'))
    for (const note of response.notes) lines.push(`· ${note}`)
  }
  lines.push('')
  lines.push(style.bold('Limitations'))
  for (const limitation of response.limitations.slice(0, 4)) {
    lines.push(style.dim(`· ${limitation}`))
  }
  return lines.join('\n')
}

export function formatDiagnosticDetail(
  detail: DiagnosticDetailResponse,
  now = Date.now(),
): string {
  const { finding, trace } = detail
  const lines: string[] = []
  lines.push(
    `${style.bold('StackNext diagnostic')} ${style.dim(finding.id)} — ${finding.ruleId}`,
  )
  lines.push('')
  lines.push(findingLine(finding, now))
  lines.push('')
  lines.push(finding.detail)
  lines.push(
    `Route       ${finding.route ?? 'unknown'}${finding.method ? ` · ${finding.method}` : ''}`,
  )
  lines.push(
    `Window      ${new Date(finding.firstSeen).toISOString()} → ${new Date(
      finding.lastSeen,
    ).toISOString()}`,
  )
  lines.push(`Fingerprint ${finding.fingerprint}`)
  lines.push(`Traces      ${finding.traceIds.join(', ') || 'none'}`)

  if (finding.evidence.measurements.length > 0) {
    lines.push('')
    lines.push(style.bold('Measurements'))
    for (const measurement of finding.evidence.measurements) {
      lines.push(
        `· ${measurement.label}: ${String(measurement.value)}${
          measurement.unit ? ` ${measurement.unit}` : ''
        }`,
      )
    }
  }

  if (finding.evidence.spans.length > 0) {
    lines.push('')
    lines.push(style.bold('Spans'))
    for (const span of finding.evidence.spans.slice(0, 5)) {
      lines.push(
        `· ${span.name} — ${formatDuration(span.durationMs)} · ${span.category} · ${span.spanId}`,
      )
    }
  }

  if (finding.evidence.queries.length > 0) {
    lines.push('')
    lines.push(style.bold('Queries'))
    for (const query of finding.evidence.queries.slice(0, 3)) {
      lines.push(
        `· ${query.databaseSystem}${query.operation ? ` ${query.operation}` : ''} — ${formatDuration(
          query.durationMs,
        )}`,
      )
      lines.push(style.dim(`   ${query.sqlPreview}`))
    }
  }

  if (finding.evidence.errors.length > 0) {
    lines.push('')
    lines.push(style.bold('Errors'))
    for (const error of finding.evidence.errors.slice(0, 3)) {
      lines.push(`· ${error.name}: ${error.message}`)
      lines.push(style.dim(`   ${new Date(error.timestamp).toISOString()} · ${error.id}`))
    }
  }

  if (trace) {
    lines.push('')
    lines.push(style.bold('Related trace'))
    lines.push(
      `${trace.traceId} — ${trace.spanCount} spans, ${trace.databaseQueryCount} queries, ${trace.errorCount} errors, ${formatDuration(
        trace.durationMs,
      )}`,
    )
    if (trace.missingParentSpanIds.length > 0) {
      lines.push(
        style.dim(`Missing parent spans: ${trace.missingParentSpanIds.join(', ')}`),
      )
    }
  }

  lines.push('')
  lines.push(style.bold('Verification'))
  for (const step of finding.verification) lines.push(`· ${step}`)
  lines.push('')
  lines.push(style.bold('Limitations'))
  for (const limitation of finding.limitations) lines.push(style.dim(`· ${limitation}`))
  return lines.join('\n')
}

function buildSearch(options: DiagnoseOptions): string {
  const params = new URLSearchParams()
  const category = parseChoice<DiagnosticCategory>(
    options.category,
    DIAGNOSTIC_CATEGORIES,
    'category',
  )
  const severity = parseChoice<DiagnosticSeverity>(
    options.severity,
    DIAGNOSTIC_SEVERITIES,
    'severity',
  )
  const status = parseChoice<DiagnosticStatus>(
    options.status,
    DIAGNOSTIC_STATUSES,
    'status',
  )
  const ruleId = parseChoice<DiagnosticRuleId>(
    options.rule,
    DIAGNOSTIC_RULE_IDS,
    'rule',
  )
  const since = parseTimestamp(options.since, 'since')
  const until = parseTimestamp(options.until, 'until')
  const limit = parseInteger(options.limit, 'limit')
  const offset = parseInteger(options.offset, 'offset')
  if (category) params.set('category', category)
  if (severity) params.set('severity', severity)
  if (status) params.set('status', status)
  if (ruleId) params.set('ruleId', ruleId)
  if (options.traceId) params.set('traceId', options.traceId)
  if (options.route) params.set('route', options.route)
  if (options.q) params.set('q', options.q)
  if (since !== undefined) params.set('since', String(since))
  if (until !== undefined) params.set('until', String(until))
  if (limit !== undefined) params.set('limit', String(limit))
  if (offset !== undefined) params.set('offset', String(offset))
  const query = params.toString()
  return query ? `?${query}` : ''
}

export async function runDiagnose(
  options: DiagnoseOptions,
  cwd = process.cwd(),
): Promise<number> {
  const state = await requireRunningState(cwd)
  if (options.id) {
    const detail = await collectorJson<DiagnosticDetailResponse>(
      state.collectorUrl,
      `/api/diagnostics/${encodeURIComponent(options.id)}`,
      state.token,
    )
    if (options.json) console.log(JSON.stringify(detail, null, 2))
    else console.log(formatDiagnosticDetail(detail))
    return 0
  }
  const response = await collectorJson<DiagnosticListResponse>(
    state.collectorUrl,
    `/api/diagnostics${buildSearch(options)}`,
    state.token,
  )
  if (options.json) {
    console.log(JSON.stringify(response, null, 2))
  } else {
    printBanner(CLI_VERSION)
    console.log(formatDiagnosticList(response))
  }
  return 0
}

export function registerDiagnoseCommand(program: Command, cwd: string): void {
  program
    .command('diagnose')
    .description('List deterministic diagnostic findings from the current sample')
    .option('--id <finding-id>', 'show one finding and its related trace evidence')
    .option('--trace-id <trace-id>', 'only findings that reference this trace')
    .option('--category <category>', `filter by category (${DIAGNOSTIC_CATEGORIES.join(', ')})`)
    .option('--severity <severity>', `filter by severity (${DIAGNOSTIC_SEVERITIES.join(', ')})`)
    .option('--status <status>', `filter by status (${DIAGNOSTIC_STATUSES.join(', ')})`)
    .option('--rule <rule-id>', `filter by rule (${DIAGNOSTIC_RULE_IDS.join(', ')})`)
    .option('--route <route>', 'filter by route substring')
    .option('--since <time>', 'only findings active since an ISO timestamp or epoch ms')
    .option('--until <time>', 'only findings active until an ISO timestamp or epoch ms')
    .option('--limit <number>', 'maximum findings to return (1-200)')
    .option('--offset <number>', 'pagination offset')
    .option('-q, --q <text>', 'search titles, summaries, details and fingerprints')
    .option('--json', 'print machine-readable JSON')
    .action(async (options: DiagnoseOptions) => {
      const code = await runDiagnose(options, cwd)
      if (code !== 0) process.exitCode = code
    })
}
