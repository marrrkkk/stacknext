import type { Command } from 'commander'
import type {
  DiagnosticDetailResponse,
  DiagnosticFinding,
  DiagnosticStatus,
  HealthResponse,
  PageResult,
  RequestSummary,
  TraceDetail,
  VerificationResult,
} from '@stacknext/core'
import {
  VERIFY_MAX_SINCE_MS,
  verifyDiagnosticStatus,
  verifyMaxDatabaseQueries,
  verifyMaxRequestDuration,
  verifyRequestStatus,
} from '@stacknext/core'
import { appendCaseEvent } from '../cases-storage.js'
import { CollectorApiError, collectorJson } from '../http.js'
import { style } from '../output.js'
import { detectProject } from '../project.js'
import { requireRunningState } from '../session.js'

export interface VerifyOptions {
  trace?: string
  expectStatus?: string
  route?: string
  since?: string
  maxQueries?: string
  maxDuration?: string
  diagnostic?: string
  case?: string
  json?: boolean
}

const TRACE_PATTERN = /^[0-9a-f]{32}$/i
const CASE_PATTERN = /^case_[0-9a-f-]{36}$/i
const DIAGNOSTIC_PATTERN = /^diag-[0-9a-f]{8}-[0-9a-f]{8}$/i
const ROUTE_PATTERN = /^\/[A-Za-z0-9/{}._-]{0,1998}$/
const STATUSES: DiagnosticStatus[] = ['observed', 'possible', 'insufficient-evidence']

function integerOption(
  value: string | undefined,
  name: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`)
  }
  return parsed
}

function expectedStatus(value: string | undefined): number {
  const status = integerOption(value, '--expect-status', 100, 599)
  if (status === undefined) throw new Error('--expect-status is required')
  return status
}

function expectedDiagnosticStatus(value: string | undefined): DiagnosticStatus {
  if (!value || !STATUSES.includes(value as DiagnosticStatus)) {
    throw new Error('--expect-status must be observed, possible or insufficient-evidence')
  }
  return value as DiagnosticStatus
}

function routeValue(value: string | undefined): string {
  if (!value || !ROUTE_PATTERN.test(value)) {
    throw new Error('--route must be a short route path without query values')
  }
  return value
}

function sinceValue(value: string | undefined): number {
  const since = integerOption(value, '--since', 0, VERIFY_MAX_SINCE_MS)
  if (since === undefined) throw new Error('--since is required')
  return since
}

function exitCode(result: VerificationResult): number {
  if (result.result === 'supported') return 0
  if (result.result === 'contradicted') return 1
  return 2
}

function printResult(result: VerificationResult): void {
  if (result.result === 'supported') console.log(style.green(`✓ supported — ${result.claim}`))
  else if (result.result === 'contradicted') console.log(style.red(`✗ contradicted — ${result.claim}`))
  else console.log(style.yellow(`! unverifiable — ${result.claim}`))
  for (const check of result.checks) {
    if (!check.passed || check.reason) {
      console.log(
        `  ${check.predicate}: expected ${JSON.stringify(check.expected)}, observed ${JSON.stringify(check.observed)}${check.reason ? ` — ${check.reason}` : ''}`,
      )
    }
  }
  console.log(`  sample ${result.sampleSize} · revision ${result.revision}`)
  if (result.result === 'unverifiable') {
    console.log(style.dim('  Unverifiable is not a pass. Gather narrower evidence and retry.'))
  }
}

async function fetchTrace(
  baseUrl: string,
  token: string,
  traceId: string,
): Promise<TraceDetail | null> {
  try {
    return await collectorJson<TraceDetail>(baseUrl, `/api/traces/${traceId}`, token)
  } catch (error) {
    if (error instanceof CollectorApiError && error.status === 404) return null
    throw error
  }
}

async function fetchDiagnostic(
  baseUrl: string,
  token: string,
  diagnosticId: string,
): Promise<DiagnosticFinding | null> {
  try {
    const detail = await collectorJson<DiagnosticDetailResponse>(
      baseUrl,
      `/api/diagnostics/${diagnosticId}`,
      token,
    )
    return detail.finding
  } catch (error) {
    if (error instanceof CollectorApiError && error.status === 404) return null
    throw error
  }
}

interface CaseArgs {
  mode: 'trace' | 'route' | 'diagnostic'
  trace?: string
  expectStatus?: number | DiagnosticStatus
  route?: string
  since?: number
  maxQueries?: number
  maxDuration?: number
  diagnostic?: string
}

function argsFromOptions(options: VerifyOptions): CaseArgs {
  const trace = options.trace?.trim()
  const diagnostic = options.diagnostic?.trim()
  const route = options.route?.trim()
  const modes = [trace ? 1 : 0, route ? 1 : 0, diagnostic ? 1 : 0, options.case ? 1 : 0]
  if (modes.reduce((sum, value) => sum + value, 0) !== 1) {
    throw new Error(
      'Choose exactly one: --trace, --route, --diagnostic or --case.',
    )
  }
  if (trace) {
    if (!TRACE_PATTERN.test(trace)) throw new Error('--trace must be 32 hexadecimal characters')
    return { mode: 'trace', trace, expectStatus: expectedStatus(options.expectStatus) }
  }
  if (diagnostic) {
    if (!DIAGNOSTIC_PATTERN.test(diagnostic)) {
      throw new Error('--diagnostic must look like diag-xxxxxxxx-xxxxxxxx')
    }
    return {
      mode: 'diagnostic',
      diagnostic,
      expectStatus: expectedDiagnosticStatus(options.expectStatus),
    }
  }
  const path = routeValue(route)
  const since = sinceValue(options.since)
  const maxQueries = integerOption(options.maxQueries, '--max-queries', 0, 1_000)
  const maxDuration = integerOption(options.maxDuration, '--max-duration', 1, 600_000)
  if ((maxQueries === undefined) === (maxDuration === undefined)) {
    throw new Error('--route requires exactly one of --max-queries or --max-duration')
  }
  return {
    mode: 'route',
    route: path,
    since,
    ...(maxQueries !== undefined ? { maxQueries } : {}),
    ...(maxDuration !== undefined ? { maxDuration } : {}),
  }
}

async function evaluate(
  args: CaseArgs,
  baseUrl: string,
  token: string,
  revision: number,
): Promise<VerificationResult> {
  if (args.mode === 'trace') {
    const trace = await fetchTrace(baseUrl, token, args.trace ?? '')
    return verifyRequestStatus({
      traceId: args.trace ?? '',
      expectedStatus: args.expectStatus as number,
      trace,
      revision,
    })
  }
  if (args.mode === 'diagnostic') {
    const diagnostic = await fetchDiagnostic(baseUrl, token, args.diagnostic ?? '')
    return verifyDiagnosticStatus({
      diagnosticId: args.diagnostic ?? '',
      expectedStatus: args.expectStatus as DiagnosticStatus,
      diagnostic,
      revision,
    })
  }
  const page = await collectorJson<PageResult<RequestSummary>>(
    baseUrl,
    '/api/requests?limit=200&sort=recent',
    token,
  )
  const requests = page.items.filter(
    (request) => request.route === args.route && request.timestamp >= (args.since ?? 0),
  )
  if (args.maxQueries !== undefined) {
    const unique = [...new Set(requests.slice(0, 20).map((request) => request.traceId))]
    const settled = await Promise.all(
      unique.map((traceId) =>
        fetchTrace(baseUrl, token, traceId)
          .then((trace) => ({ traceId, trace }))
          .catch(() => ({ traceId, trace: null })),
      ),
    )
    return verifyMaxDatabaseQueries({
      route: args.route ?? '',
      maxQueries: args.maxQueries,
      since: args.since ?? 0,
      requests,
      traces: settled.flatMap((entry) => (entry.trace ? [entry.trace] : [])),
      revision,
    })
  }
  return verifyMaxRequestDuration({
    route: args.route ?? '',
    maxDurationMs: args.maxDuration ?? 600_000,
    since: args.since ?? 0,
    requests,
    revision,
  })
}

export async function runVerify(
  options: VerifyOptions,
  cwd = process.cwd(),
): Promise<number> {
  const state = await requireRunningState(cwd)
  const health = await collectorJson<HealthResponse>(
    state.collectorUrl,
    '/api/health',
    state.token,
  )
  const revision = health.store.revision
  const project = await detectProject(cwd)

  let args: CaseArgs
  if (options.case) {
    const caseId = options.case.trim()
    if (!CASE_PATTERN.test(caseId)) throw new Error('--case must look like case_<uuid>')
    const { foldCaseEvents } = await import('@stacknext/core')
    const { readCaseEvents } = await import('../cases-storage.js')
    const { events } = await readCaseEvents(project.dir, caseId)
    const view = foldCaseEvents(events, caseId)
    if (!view) throw new Error(`No case found with id ${caseId}`)
    const saved = [...view.events]
      .reverse()
      .find((event) => event.kind === 'verification_added')
    const savedArgs = saved?.kind === 'verification_added'
      ? (saved.verification as { args?: CaseArgs }).args
      : undefined
    if (!savedArgs) {
      throw new Error(`Case ${caseId} has no saved verification claim to re-run`)
    }
    args = savedArgs
  } else {
    args = argsFromOptions(options)
  }

  const result = await evaluate(args, state.collectorUrl, state.token, revision)
  if (options.json) console.log(JSON.stringify(result, null, 2))
  else printResult(result)

  if (options.case) {
    await appendCaseEvent(project.dir, options.case.trim(), {
      kind: 'verification_added',
      at: Date.now(),
      actor: 'human',
      verification: { verification: result, args },
    })
  }
  return exitCode(result)
}

export function registerVerifyCommand(program: Command, cwd: string): void {
  program
    .command('verify')
    .description('Check a claim against bounded captured evidence (0 supported, 1 contradicted, 2 unverifiable)')
    .option('--trace <id>', '32-character trace id')
    .option('--expect-status <code|status>', 'expected status code or diagnostic status')
    .option('--route <route>', 'route path to sample')
    .option('--since <ms>', 'only requests at or after this timestamp (max 86,400,000)')
    .option('--max-queries <n>', 'maximum correlated database queries per request')
    .option('--max-duration <ms>', 'maximum request duration in milliseconds')
    .option('--diagnostic <id>', 'diagnostic finding id')
    .option('--case <id>', 're-run the claim saved on a case and append the result')
    .option('--json', 'print machine-readable verification result')
    .action(async (options: VerifyOptions) => {
      const code = await runVerify(options, cwd)
      if (code !== 0) process.exitCode = code
    })
}
