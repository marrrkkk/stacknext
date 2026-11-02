import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import {
  STACKNEXT_SDK_VERSION,
  type CoverageReport,
  type DiagnosticDetailResponse,
  type DiagnosticListResponse,
  type ErrorDetailResponse,
  type ErrorListResponse,
  type HealthResponse,
  type OverviewResponse,
  type PageResult,
  type TraceDetail,
} from '@stacknext/core'
import type { Baseline, Comparison, TestRun } from '@stacknext/regression'
import { StackNextApiClient, StackNextApiError } from './client.js'
import {
  HealthCache,
  buildMeta,
  withoutStack,
  type CoverageMeta,
} from './meta.js'
import {
  baselineOutputSchema,
  baselinesOutputSchema,
  comparisonOutputSchema,
  comparisonsOutputSchema,
  databaseOutputSchema,
  diagnosticDetailOutputSchema,
  diagnosticsOutputSchema,
  errorDetailOutputSchema,
  errorsOutputSchema,
  overviewOutputSchema,
  requestsOutputSchema,
  testRunOutputSchema,
  testRunsOutputSchema,
  traceDetailOutputSchema,
  tracesOutputSchema,
} from './schemas.js'

const traceIdSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/i, 'traceId must be 32 hexadecimal characters')

const runIdSchema = z
  .string()
  .regex(/^run-[0-9a-f]{16}$/, 'runId must look like run-xxxxxxxxxxxxxxxx')
const baselineIdSchema = z
  .string()
  .regex(/^base-[0-9a-f]{16}$/, 'baselineId must look like base-xxxxxxxxxxxxxxxx')
const comparisonIdSchema = z
  .string()
  .regex(/^cmp-[0-9a-f]{16}$/, 'comparisonId must look like cmp-xxxxxxxxxxxxxxxx')

const limitSchema = z.number().int().min(1).max(200).optional()
const offsetSchema = z.number().int().min(0).optional()
const minDurationSchema = z.number().min(0).max(600_000).optional()

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

const SERVER_INSTRUCTIONS = `StackNext exposes read-only runtime telemetry for one local Next.js App Router project.

Start every investigation with get_project_summary. It reports the project, connection state, counts, latency, recent errors, instrumentation coverage and the retention window. Then use list_requests, list_errors, list_database_queries, find_slow_requests or list_traces to narrow the evidence, and get_request, get_trace or get_error to inspect one record.

For deterministic findings, use stacknext_list_diagnostics with category, severity, status, ruleId, route, traceId or time filters. Call stacknext_get_diagnostic with a finding id for its bounded evidence, related trace reference and verification steps. Findings are heuristics over the current sample, not confirmed root causes. Never present one as a proven cause without checking the referenced trace, error or query evidence.

Every successful response has a top-level meta object. Check meta.connection.instrumentation before drawing conclusions: "waiting" means the collector is running but no app has connected. Check meta.completeness.reasons and meta.result.hasMore; paginate with meta.result.nextOffset. Tool text content is JSON and structured content is available when the client supports it.

get_project_summary also returns a coverage report and summarises it in meta.coverage. Coverage separates missing instrumentation from absent runtime problems: "not-observed" or "unknown" means the current sample has no evidence for a feature, not that the app is healthy or broken. Read the coverage item limitations before recommending instrumentation changes.

Drizzle query durations are null because the adapter cannot measure them. Null means unmeasured, not zero. Bodies, headers, cookies, URL query values and SQL bind parameters are never captured; [redacted] marks removed values. Diagnostic findings are bounded, deterministic and versioned; they are not AI output and no data leaves the machine.

Regression records are saved from Playwright-linked capture runs under the project's .stacknext directory. Use stacknext_list_test_runs and stacknext_get_test_run to inspect captured scenarios and correlation completeness. Use stacknext_list_baselines and stacknext_get_baseline for immutable baselines. Use stacknext_list_comparisons and stacknext_get_comparison for deterministic baseline/candidate comparisons. Regression statuses are improved, regressed, unchanged or inconclusive. Inconclusive is not a pass: environment differences, missing samples or unverified correlation prevent a verdict. Never describe a regression as statistically significant; comparisons use medians and thresholds, not significance tests.

All tools are read-only. They cannot edit the app, replay requests, change configuration or read files. If the collector is unreachable, ask the user to start "stacknext dev" instead of guessing. Prompts diagnose-error, investigate-slow-request, inspect-database-activity, investigate-trace and diagnose-runtime-issue provide guided workflows.`

type ToolHints = Partial<Record<number, string>>

function textAndStructured(
  data: Record<string, unknown>,
): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: data,
  }
}

function errorResult(error: unknown, hint?: string): CallToolResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: hint ? `${message}\n\n${hint}` : message,
      },
    ],
  }
}

async function safely(
  fn: () => Promise<CallToolResult>,
  hints?: ToolHints,
): Promise<CallToolResult> {
  try {
    return await fn()
  } catch (error) {
    const hint =
      error instanceof StackNextApiError ? hints?.[error.status] : undefined
    return errorResult(error, hint)
  }
}

function rangeOf(
  items: Array<{ timestamp: number }>,
): { first: number | null; last: number | null } {
  if (items.length === 0) return { first: null, last: null }
  const times = items.map((item) => item.timestamp)
  return { first: Math.min(...times), last: Math.max(...times) }
}

function traceRangeOf(
  items: Array<{ startTime: number; endTime: number }>,
): { first: number | null; last: number | null } {
  if (items.length === 0) return { first: null, last: null }
  return {
    first: Math.min(...items.map((item) => item.startTime)),
    last: Math.max(...items.map((item) => item.endTime)),
  }
}

function detailNotes(detail: TraceDetail): string[] {
  const notes: string[] = []
  if (detail.databaseQueries.some((query) => query.durationMs === null)) {
    notes.push(
      'Some database query durations are null because the adapter cannot measure them. Null means unmeasured, not zero.',
    )
  }
  if (detail.missingParentSpanIds.length > 0) {
    notes.push(
      'Some parent spans were not received. The timeline is incomplete; do not infer hidden work from the gaps.',
    )
  }
  return notes
}

function detailReasons(detail: TraceDetail): string[] {
  return detail.missingParentSpanIds.length > 0
    ? [
        `${detail.missingParentSpanIds.length} parent span id(s) are missing from this trace.`,
      ]
    : []
}

function coverageMetaOf(coverage: CoverageReport | undefined): CoverageMeta | undefined {
  if (!coverage) return undefined
  return {
    observed: coverage.statusCounts.observed,
    active: coverage.statusCounts.active,
    configured: coverage.statusCounts.configured,
    notObserved: coverage.statusCounts['not-observed'],
    unsupported: coverage.statusCounts.unsupported,
    unknown: coverage.statusCounts.unknown,
    requestsInSample: coverage.sample.requests,
  }
}

function coverageNotes(coverage: CoverageReport | undefined): string[] {
  if (!coverage) return []
  const meta = coverageMetaOf(coverage)
  if (!meta) return []
  const notes = [
    `Instrumentation coverage for this sample (${meta.requestsInSample} request(s)): ${meta.observed} observed, ${meta.active} active, ${meta.configured} configured, ${meta.notObserved} not observed, ${meta.unsupported} unsupported, ${meta.unknown} unknown. Not-observed or unknown items mean evidence is missing, not that the feature is broken.`,
  ]
  if (coverage.notes.length > 0) notes.push(...coverage.notes)
  return notes
}

function pageMeta(
  tool: string,
  health: HealthResponse | null,
  page: PageResult<unknown>,
  firstEventTime: number | null,
  lastEventTime: number | null,
  notes: string[] = [],
): ReturnType<typeof buildMeta> {
  return buildMeta({
    tool,
    health,
    firstEventTime,
    lastEventTime,
    found: page.total,
    returned: page.items.length,
    limit: page.limit,
    offset: page.offset,
    notes,
  })
}

/**
 * Builds the read-only MCP server. Kept separate from stdio setup so tests can
 * connect an in-memory transport.
 */
export function createStackNextMcpServer(
  client: StackNextApiClient,
): McpServer {
  const server = new McpServer(
    {
      name: 'stacknext',
      version: STACKNEXT_SDK_VERSION,
    },
    { instructions: SERVER_INSTRUCTIONS },
  )
  const healthCache = new HealthCache(client)

  server.registerTool(
    'get_project_summary',
    {
      title: 'Get project summary',
      description:
        'Start here. Returns the StackNext project name, connection state, request/error/database counts, latency summary, recent errors and instrumentation coverage. Check meta.connection, meta.coverage and meta.completeness before investigating further; coverage separates missing instrumentation from absent runtime problems.',
      inputSchema: {},
      outputSchema: overviewOutputSchema,
      annotations: readOnly,
    },
    () =>
      safely(async () => {
        const data: OverviewResponse = await client.overview()
        healthCache.seed(data.health)
        const hadStacks = data.summary.recentErrors.some((error) => error.stack)
        const summary = {
          ...data.summary,
          recentErrors: data.summary.recentErrors.map(withoutStack),
        }
        const notes = [
          ...(hadStacks
            ? [
                'Recent error stacks are omitted from the summary. Call get_error for a full redacted stack.',
              ]
            : []),
          ...coverageNotes(data.coverage),
        ]
        const meta = buildMeta({
          tool: 'get_project_summary',
          health: data.health,
          project: data.health.projectName,
          firstEventTime: summary.firstEventTime,
          lastEventTime: summary.lastEventTime,
          found: summary.totalRequests,
          returned: summary.totalRequests,
          notes,
          coverage: coverageMetaOf(data.coverage),
        })
        return textAndStructured({ ...data, summary, meta })
      }),
  )

  server.registerTool(
    'list_requests',
    {
      title: 'List requests',
      description:
        'Lists recent HTTP requests with route, status, duration, span/error/query counts and trace id. Filter by text, method, status class, slow-only or minimum duration; sort by recent, oldest or slowest. Use get_request with a traceId for the timeline.',
      inputSchema: {
        limit: limitSchema,
        offset: offsetSchema,
        q: z.string().max(200).optional(),
        method: z.string().max(32).optional(),
        status: z.enum(['2xx', '3xx', '4xx', '5xx', 'none']).optional(),
        slow: z.boolean().optional(),
        minDurationMs: minDurationSchema,
        sort: z.enum(['recent', 'oldest', 'slowest']).optional(),
      },
      outputSchema: requestsOutputSchema,
      annotations: readOnly,
    },
    (args) =>
      safely(async () => {
        const page = await client.listRequests({
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
          ...(args.offset !== undefined ? { offset: args.offset } : {}),
          ...(args.q !== undefined ? { q: args.q } : {}),
          ...(args.method !== undefined ? { method: args.method } : {}),
          ...(args.status !== undefined ? { status: args.status } : {}),
          ...(args.slow !== undefined ? { slow: args.slow } : {}),
          ...(args.minDurationMs !== undefined
            ? { minDuration: args.minDurationMs }
            : {}),
          ...(args.sort !== undefined ? { sort: args.sort } : {}),
        })
        const health = await healthCache.get()
        const range = rangeOf(page.items)
        const meta = pageMeta(
          'list_requests',
          health,
          page,
          range.first,
          range.last,
        )
        return textAndStructured({ ...page, meta })
      }),
  )

  server.registerTool(
    'get_request',
    {
      title: 'Get request',
      description:
        'Returns one request trace by 32-character trace id: request summary, every captured span in the timeline, correlated errors and database queries. Use missingParentSpanIds and meta.completeness to judge whether the timeline is complete.',
      inputSchema: {
        traceId: traceIdSchema,
      },
      outputSchema: traceDetailOutputSchema,
      annotations: readOnly,
    },
    (args) =>
      safely(
        async () => {
          const detail = await client.getRequest(args.traceId)
          const health = await healthCache.get()
          const meta = buildMeta({
            tool: 'get_request',
            health,
            firstEventTime: detail.startTime,
            lastEventTime: detail.endTime,
            found: 1,
            returned: 1,
            identifiers: { traceId: args.traceId },
            reasons: detailReasons(detail),
            notes: detailNotes(detail),
          })
          return textAndStructured({ ...detail, meta })
        },
        {
          404: `No request with trace id "${args.traceId}" was found in the collector's current retention window. Call list_requests to find a recent trace id.`,
          400: 'Trace ids must be 32 hexadecimal characters.',
        },
      ),
  )

  server.registerTool(
    'list_traces',
    {
      title: 'List traces',
      description:
        'Lists traces with root span, service, duration, span/error/query counts and an optional request summary. Newest first unless sorted otherwise. Use get_trace for the full span tree.',
      inputSchema: {
        limit: limitSchema,
        offset: offsetSchema,
        q: z.string().max(200).optional(),
        sort: z.enum(['recent', 'oldest', 'slowest']).optional(),
      },
      outputSchema: tracesOutputSchema,
      annotations: readOnly,
    },
    (args) =>
      safely(async () => {
        const page = await client.listTraces({
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
          ...(args.offset !== undefined ? { offset: args.offset } : {}),
          ...(args.q !== undefined ? { q: args.q } : {}),
          ...(args.sort !== undefined ? { sort: args.sort } : {}),
        })
        const health = await healthCache.get()
        const range = traceRangeOf(page.items)
        const meta = pageMeta(
          'list_traces',
          health,
          page,
          range.first,
          range.last,
        )
        return textAndStructured({ ...page, meta })
      }),
  )

  server.registerTool(
    'get_trace',
    {
      title: 'Get trace',
      description:
        'Returns the full span tree for a 32-character trace id, including correlated errors and database queries. Prefer this when you do not know whether the id has a request root; prefer get_request when you have a request trace id.',
      inputSchema: {
        traceId: traceIdSchema,
      },
      outputSchema: traceDetailOutputSchema,
      annotations: readOnly,
    },
    (args) =>
      safely(
        async () => {
          const detail = await client.getTrace(args.traceId)
          const health = await healthCache.get()
          const references = detail.diagnostics ?? []
          const notes = [...detailNotes(detail)]
          if (references.length > 0) {
            notes.push(
              `${references.length} diagnostic finding(s) reference this trace. Call stacknext_get_diagnostic for an id, for example ${references
                .slice(0, 3)
                .map((reference) => reference.id)
                .join(', ')}.`,
            )
          }
          const meta = buildMeta({
            tool: 'get_trace',
            health,
            firstEventTime: detail.startTime,
            lastEventTime: detail.endTime,
            found: 1,
            returned: 1,
            identifiers: { traceId: args.traceId },
            reasons: detailReasons(detail),
            notes,
          })
          return textAndStructured({ ...detail, meta })
        },
        {
          404: `No trace with id "${args.traceId}" was found in the collector's current retention window. Call list_traces or list_requests to find a recent id.`,
          400: 'Trace ids must be 32 hexadecimal characters.',
        },
      ),
  )

  server.registerTool(
    'list_errors',
    {
      title: 'List errors',
      description:
        'Lists captured server errors with fingerprint groups, route, name, message and trace correlation. Stacks are omitted by default; set includeStack=true or call get_error for one full redacted stack.',
      inputSchema: {
        limit: limitSchema,
        offset: offsetSchema,
        q: z.string().max(200).optional(),
        route: z.string().max(2_000).optional(),
        name: z.string().max(200).optional(),
        includeStack: z.boolean().optional(),
      },
      outputSchema: errorsOutputSchema,
      annotations: readOnly,
    },
    (args) =>
      safely(async () => {
        const page: ErrorListResponse = await client.listErrors({
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
          ...(args.offset !== undefined ? { offset: args.offset } : {}),
          ...(args.q !== undefined ? { q: args.q } : {}),
          ...(args.route !== undefined ? { route: args.route } : {}),
          ...(args.name !== undefined ? { name: args.name } : {}),
        })
        const health = await healthCache.get()
        const includeStack = args.includeStack === true
        const hadStacks = page.items.some((error) => error.stack)
        const items = includeStack
          ? page.items
          : page.items.map(withoutStack)
        const notes =
          !includeStack && hadStacks
            ? [
                'Error stacks are omitted by default. Set includeStack=true or call get_error for one full redacted stack.',
              ]
            : []
        const range = rangeOf(items)
        const meta = buildMeta({
          tool: 'list_errors',
          health,
          firstEventTime: range.first,
          lastEventTime: range.last,
          found: page.total,
          returned: items.length,
          limit: page.limit,
          offset: page.offset,
          notes,
        })
        return textAndStructured({ ...page, items, meta })
      }),
  )

  server.registerTool(
    'get_error',
    {
      title: 'Get error',
      description:
        'Returns one error with its redacted stack and the correlated request trace, if available. Use list_errors to find the id. Treat the trace link as exact only when the error carries a span context; route/time fallback is weaker.',
      inputSchema: {
        errorId: z.string().min(1).max(128),
      },
      outputSchema: errorDetailOutputSchema,
      annotations: readOnly,
    },
    (args) =>
      safely(
        async () => {
          const detail: ErrorDetailResponse = await client.getError(args.errorId)
          const health = await healthCache.get()
          const identifiers: Record<string, string> = { errorId: args.errorId }
          if (detail.error.resolvedTraceId) {
            identifiers.traceId = detail.error.resolvedTraceId
          }
          const reasons = detail.error.resolvedTraceId
            ? detail.trace
              ? detailReasons(detail.trace)
              : []
            : ['The error has no correlated trace in the current retention window.']
          const notes = detail.trace ? detailNotes(detail.trace) : []
          const meta = buildMeta({
            tool: 'get_error',
            health,
            firstEventTime: detail.error.timestamp,
            lastEventTime: detail.error.timestamp,
            found: 1,
            returned: 1,
            identifiers,
            reasons,
            notes,
          })
          return textAndStructured({ ...detail, meta })
        },
        {
          404: `No error with id "${args.errorId}" was found in the collector's current retention window. Call list_errors to find a current error id.`,
        },
      ),
  )

  server.registerTool(
    'list_database_queries',
    {
      title: 'List database queries',
      description:
        'Lists redacted SQL queries with source, success state, duration (null when the adapter cannot measure it), route and trace correlation. Filter by SQL text, database system, trace id or minimum duration. Null duration means unmeasured, never zero.',
      inputSchema: {
        limit: limitSchema,
        offset: offsetSchema,
        q: z.string().max(200).optional(),
        minDurationMs: minDurationSchema,
        traceId: traceIdSchema.optional(),
        databaseSystem: z.string().max(100).optional(),
      },
      outputSchema: databaseOutputSchema,
      annotations: readOnly,
    },
    (args) =>
      safely(async () => {
        const page = await client.listDatabaseQueries({
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
          ...(args.offset !== undefined ? { offset: args.offset } : {}),
          ...(args.q !== undefined ? { q: args.q } : {}),
          ...(args.minDurationMs !== undefined
            ? { minDuration: args.minDurationMs }
            : {}),
          ...(args.traceId !== undefined ? { traceId: args.traceId } : {}),
          ...(args.databaseSystem !== undefined
            ? { databaseSystem: args.databaseSystem }
            : {}),
        })
        const health = await healthCache.get()
        const range = rangeOf(page.items)
        const notes = page.items.some((query) => query.durationMs === null)
          ? [
              'Some query durations are null because the adapter cannot measure them. Null means unmeasured, not zero.',
            ]
          : []
        const meta = pageMeta(
          'list_database_queries',
          health,
          page,
          range.first,
          range.last,
          notes,
        )
        return textAndStructured({ ...page, meta })
      }),
  )

  server.registerTool(
    'find_slow_requests',
    {
      title: 'Find slow requests',
      description:
        'Finds the slowest requests at or above a duration threshold (default 500 ms), sorted slowest first. Use get_request on a result to see which spans or queries consumed the time.',
      inputSchema: {
        minDurationMs: minDurationSchema,
        limit: limitSchema,
      },
      outputSchema: requestsOutputSchema,
      annotations: readOnly,
    },
    (args) =>
      safely(async () => {
        const page = await client.findSlowRequests({
          ...(args.minDurationMs !== undefined
            ? { minDurationMs: args.minDurationMs }
            : {}),
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
        })
        const health = await healthCache.get()
        const range = rangeOf(page.items)
        const meta = pageMeta(
          'find_slow_requests',
          health,
          page,
          range.first,
          range.last,
        )
        return textAndStructured({ ...page, meta })
      }),
  )

  server.registerTool(
    'stacknext_list_diagnostics',
    {
      title: 'List StackNext diagnostics',
      description:
        'Lists deterministic, evidence-backed diagnostic findings for the current retention window. Filter by category, severity, status, rule, route, trace id or time. Findings are possible explanations, not confirmed root causes; call stacknext_get_diagnostic for one finding and its bounded evidence.',
      inputSchema: {
        limit: limitSchema,
        offset: offsetSchema,
        category: z
          .enum(['database', 'http', 'performance', 'errors', 'runtime'])
          .optional(),
        severity: z.enum(['info', 'warning', 'error']).optional(),
        status: z.enum(['observed', 'possible', 'insufficient-evidence']).optional(),
        ruleId: z
          .enum([
            'n-plus-one-queries',
            'slow-span',
            'repeated-external-http',
            'error-fingerprint',
          ])
          .optional(),
        route: z.string().max(2_000).optional(),
        traceId: traceIdSchema.optional(),
        since: z.number().int().min(0).optional(),
        until: z.number().int().min(0).optional(),
        q: z.string().max(200).optional(),
      },
      outputSchema: diagnosticsOutputSchema,
      annotations: readOnly,
    },
    (args) =>
      safely(async () => {
        const page: DiagnosticListResponse = await client.listDiagnostics({
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
          ...(args.offset !== undefined ? { offset: args.offset } : {}),
          ...(args.category !== undefined ? { category: args.category } : {}),
          ...(args.severity !== undefined ? { severity: args.severity } : {}),
          ...(args.status !== undefined ? { status: args.status } : {}),
          ...(args.ruleId !== undefined ? { ruleId: args.ruleId } : {}),
          ...(args.route !== undefined ? { route: args.route } : {}),
          ...(args.traceId !== undefined ? { traceId: args.traceId } : {}),
          ...(args.since !== undefined ? { since: args.since } : {}),
          ...(args.until !== undefined ? { until: args.until } : {}),
          ...(args.q !== undefined ? { q: args.q } : {}),
        })
        const health = await healthCache.get()
        const meta = buildMeta({
          tool: 'stacknext_list_diagnostics',
          health,
          firstEventTime: page.sample.firstEventTime,
          lastEventTime: page.sample.lastEventTime,
          found: page.total,
          returned: page.items.length,
          limit: page.limit,
          offset: page.offset,
          notes: [
            'Findings are deterministic heuristics over the current sample, not confirmed root causes. Verify each one against its evidence before recommending a fix.',
            ...page.notes,
          ],
        })
        return textAndStructured({ ...page, meta })
      }),
  )

  server.registerTool(
    'stacknext_get_diagnostic',
    {
      title: 'Get StackNext diagnostic',
      description:
        'Returns one diagnostic finding with bounded evidence, verification steps, limitations and a related trace reference. Use stacknext_list_diagnostics to find an id. Do not treat the finding as a root cause without checking the referenced spans, queries or errors.',
      inputSchema: {
        diagnosticId: z
          .string()
          .regex(
            /^diag-[0-9a-f]{8}-[0-9a-f]{8}$/,
            'diagnosticId must look like diag-xxxxxxxx-xxxxxxxx',
          ),
      },
      outputSchema: diagnosticDetailOutputSchema,
      annotations: readOnly,
    },
    (args) =>
      safely(
        async () => {
          const detail: DiagnosticDetailResponse = await client.getDiagnostic(
            args.diagnosticId,
          )
          const health = await healthCache.get()
          const finding = {
            ...detail.finding,
            evidence: {
              ...detail.finding.evidence,
              spans: detail.finding.evidence.spans.slice(0, 5),
              queries: detail.finding.evidence.queries.slice(0, 5),
              errors: detail.finding.evidence.errors.slice(0, 5),
            },
          }
          const trace = detail.trace
            ? {
                ...detail.trace,
                spans: detail.trace.spans.slice(0, 20),
                errors: detail.trace.errors.slice(0, 5),
                databaseQueries: detail.trace.databaseQueries.slice(0, 10),
              }
            : null
          const notes = [
            'Findings are deterministic heuristics over the current sample, not confirmed root causes.',
            ...(detail.finding.evidence.spans.length > 5 ||
            detail.finding.evidence.queries.length > 5 ||
            detail.finding.evidence.errors.length > 5
              ? ['Finding evidence is bounded; counts in the finding describe the full group.']
              : []),
            ...(detail.trace &&
            (detail.trace.spans.length > 20 ||
              detail.trace.errors.length > 5 ||
              detail.trace.databaseQueries.length > 10)
              ? [
                  'Related trace evidence is bounded. Use get_trace for the complete span tree.',
                ]
              : []),
            ...detail.finding.limitations.slice(0, 3),
          ]
          const identifiers: Record<string, string> = {
            diagnosticId: detail.finding.id,
          }
          if (trace) identifiers.traceId = trace.traceId
          const meta = buildMeta({
            tool: 'stacknext_get_diagnostic',
            health,
            firstEventTime: finding.firstSeen,
            lastEventTime: finding.lastSeen,
            found: 1,
            returned: 1,
            identifiers,
            reasons: trace
              ? []
              : ['This finding has no related trace in the current retention window.'],
            notes,
          })
          return textAndStructured({ ...detail, finding, trace, meta })
        },
        {
          404: `No diagnostic with id "${args.diagnosticId}" was found in the current retention window. Call stacknext_list_diagnostics to find a current id.`,
          400: 'Diagnostic ids look like diag-xxxxxxxx-xxxxxxxx.',
        },
      ),
  )

  server.registerTool(
    'stacknext_list_test_runs',
    {
      title: 'List StackNext test runs',
      description:
        'Lists saved Playwright-linked capture runs from the project .stacknext/runs directory. Each summary includes run status, sample and correlation counts, command timing and the captured environment. Use stacknext_get_test_run for scenarios and telemetry evidence. Incomplete correlation is reported, never hidden.',
      inputSchema: {
        limit: limitSchema,
        offset: offsetSchema,
      },
      outputSchema: testRunsOutputSchema,
      annotations: readOnly,
    },
    (args) =>
      safely(async () => {
        const page = await client.listTestRuns({
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
          ...(args.offset !== undefined ? { offset: args.offset } : {}),
        })
        const health = await healthCache.get()
        const created = page.items.map((run) => run.createdAt)
        const meta = buildMeta({
          tool: 'stacknext_list_test_runs',
          health,
          firstEventTime: created.length > 0 ? Math.min(...created) : null,
          lastEventTime: created.length > 0 ? Math.max(...created) : null,
          found: page.total,
          returned: page.items.length,
          limit: page.limit,
          offset: page.offset,
          notes:
            page.items.some((run) => run.status !== 'completed')
              ? [
                  'Some runs are not completed. Their telemetry is incomplete and no regression verdict can be inferred from them.',
                ]
              : [],
        })
        return textAndStructured({ ...page, meta })
      }),
  )

  server.registerTool(
    'stacknext_get_test_run',
    {
      title: 'Get StackNext test run',
      description:
        'Returns one saved capture run with its scenarios, samples, verified correlations, captured span/query/error evidence, findings, warnings and limitations. A scenario sample is verified only when the collector proves the injected request span is a parent of a server span. Use this evidence before comparing.',
      inputSchema: {
        runId: runIdSchema,
      },
      outputSchema: testRunOutputSchema,
      annotations: readOnly,
    },
    (args) =>
      safely(
        async () => {
          const run: TestRun = await client.getTestRun(args.runId)
          const health = await healthCache.get()
          const reasons: string[] = []
          if (run.status !== 'completed') {
            reasons.push(
              `Run status is "${run.status}"; no regression verdict can be inferred from it.`,
            )
          }
          if (run.stats.incompleteSamples > 0) {
            reasons.push(
              `${run.stats.incompleteSamples} sample(s) have incomplete correlation evidence.`,
            )
          }
          if (run.stats.verifiedSamples === 0) {
            reasons.push('The run has no verified telemetry samples.')
          }
          const notes = [
            ...run.warnings,
            ...run.limitations.slice(0, 3),
            ...(run.collector.connected
              ? []
              : [
                  'The collector was not connected when this run was finalized; treat telemetry coverage as incomplete.',
                ]),
          ]
          const meta = buildMeta({
            tool: 'stacknext_get_test_run',
            health,
            firstEventTime: run.createdAt,
            lastEventTime: run.completedAt ?? run.createdAt,
            found: 1,
            returned: 1,
            identifiers: { runId: run.id },
            reasons,
            notes,
          })
          return textAndStructured({ ...run, meta })
        },
        {
          404: `No saved test run with id "${args.runId}" was found. Call stacknext_list_test_runs to find a current id.`,
          400: 'Run ids look like run-xxxxxxxxxxxxxxxx.',
        },
      ),
  )

  server.registerTool(
    'stacknext_list_baselines',
    {
      title: 'List StackNext baselines',
      description:
        'Lists immutable regression baselines saved under .stacknext/baselines. Baselines are never deleted automatically. Each summary includes the source run, scenario/sample counts and the recorded environment. Use stacknext_get_baseline for full scenario evidence.',
      inputSchema: {
        limit: limitSchema,
        offset: offsetSchema,
      },
      outputSchema: baselinesOutputSchema,
      annotations: readOnly,
    },
    (args) =>
      safely(async () => {
        const page = await client.listBaselines({
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
          ...(args.offset !== undefined ? { offset: args.offset } : {}),
        })
        const health = await healthCache.get()
        const created = page.items.map((baseline) => baseline.createdAt)
        const meta = buildMeta({
          tool: 'stacknext_list_baselines',
          health,
          firstEventTime: created.length > 0 ? Math.min(...created) : null,
          lastEventTime: created.length > 0 ? Math.max(...created) : null,
          found: page.total,
          returned: page.items.length,
          limit: page.limit,
          offset: page.offset,
          notes: [
            'Baselines are immutable snapshots. Saving a completed run creates a new baseline; deleting one requires an explicit baseline remove --yes action.',
          ],
        })
        return textAndStructured({ ...page, meta })
      }),
  )

  server.registerTool(
    'stacknext_get_baseline',
    {
      title: 'Get StackNext baseline',
      description:
        'Returns one immutable baseline with its source run, environment, scenarios and verified sample evidence. Compare against a candidate run with stacknext_list_comparisons or the CLI compare command.',
      inputSchema: {
        baselineId: baselineIdSchema,
      },
      outputSchema: baselineOutputSchema,
      annotations: readOnly,
    },
    (args) =>
      safely(
        async () => {
          const baseline: Baseline = await client.getBaseline(args.baselineId)
          const health = await healthCache.get()
          const meta = buildMeta({
            tool: 'stacknext_get_baseline',
            health,
            firstEventTime: baseline.createdAt,
            lastEventTime: baseline.createdAt,
            found: 1,
            returned: 1,
            identifiers: {
              baselineId: baseline.id,
              sourceRunId: baseline.sourceRunId,
            },
            notes: [
              `Baseline source run: ${baseline.sourceRunId}.`,
              ...baseline.limitations.slice(0, 3),
            ],
          })
          return textAndStructured({ ...baseline, meta })
        },
        {
          404: `No baseline with id "${args.baselineId}" was found. Call stacknext_list_baselines to find a current id.`,
          400: 'Baseline ids look like base-xxxxxxxxxxxxxxxx.',
        },
      ),
  )

  server.registerTool(
    'stacknext_list_comparisons',
    {
      title: 'List StackNext comparisons',
      description:
        'Lists saved deterministic baseline/candidate comparisons. Status is improved, regressed, unchanged or inconclusive; severity is separate. Environment differences, insufficient samples and unverified correlation make a comparison inconclusive. No significance claim is made.',
      inputSchema: {
        limit: limitSchema,
        offset: offsetSchema,
      },
      outputSchema: comparisonsOutputSchema,
      annotations: readOnly,
    },
    (args) =>
      safely(async () => {
        const page = await client.listComparisons({
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
          ...(args.offset !== undefined ? { offset: args.offset } : {}),
        })
        const health = await healthCache.get()
        const created = page.items.map((comparison) => comparison.createdAt)
        const meta = buildMeta({
          tool: 'stacknext_list_comparisons',
          health,
          firstEventTime: created.length > 0 ? Math.min(...created) : null,
          lastEventTime: created.length > 0 ? Math.max(...created) : null,
          found: page.total,
          returned: page.items.length,
          limit: page.limit,
          offset: page.offset,
          notes: [
            'Comparison statuses are deterministic classifications from medians and thresholds, not statistical significance tests.',
          ],
        })
        return textAndStructured({ ...page, meta })
      }),
  )

  server.registerTool(
    'stacknext_get_comparison',
    {
      title: 'Get StackNext comparison',
      description:
        'Returns one comparison with per-scenario status, severity, reasons and metrics, plus environment differences and limitations. Use it to explain a regression or inconclusive result. Do not present "possible" diagnostic evidence or an inconclusive comparison as a confirmed root cause.',
      inputSchema: {
        comparisonId: comparisonIdSchema,
      },
      outputSchema: comparisonOutputSchema,
      annotations: readOnly,
    },
    (args) =>
      safely(
        async () => {
          const comparison: Comparison = await client.getComparison(
            args.comparisonId,
          )
          const health = await healthCache.get()
          const reasons: string[] = []
          if (comparison.status === 'inconclusive') {
            reasons.push(
              'The comparison is inconclusive; no regression or improvement verdict is inferred.',
            )
          }
          if (!comparison.environment.compatible) {
            reasons.push(
              'Baseline and candidate environments differ. The result is environment-sensitive.',
            )
          }
          const notes = [
            ...comparison.warnings,
            ...comparison.limitations.slice(0, 4),
          ]
          const meta = buildMeta({
            tool: 'stacknext_get_comparison',
            health,
            firstEventTime: comparison.createdAt,
            lastEventTime: comparison.createdAt,
            found: 1,
            returned: 1,
            identifiers: {
              comparisonId: comparison.id,
              baselineId: comparison.baselineId,
              candidateId: comparison.candidateId,
            },
            reasons,
            notes,
          })
          return textAndStructured({ ...comparison, meta })
        },
        {
          404: `No comparison with id "${args.comparisonId}" was found. Call stacknext_list_comparisons to find a current id.`,
          400: 'Comparison ids look like cmp-xxxxxxxxxxxxxxxx.',
        },
      ),
  )

  registerPrompts(server)

  return server
}

function promptMessage(text: string): {
  role: 'user'
  content: { type: 'text'; text: string }
} {
  return {
    role: 'user',
    content: { type: 'text', text },
  }
}

function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'diagnose-error',
    {
      title: 'Diagnose a runtime error',
      description:
        'Guided workflow for a captured Next.js server error. Optionally pass an error id or route.',
      argsSchema: {
        errorId: z.string().max(128).optional(),
        route: z.string().max(2_000).optional(),
      },
    },
    ({ errorId, route }) => ({
      description: 'Diagnose a StackNext-captured runtime error',
      messages: [
        promptMessage(
          [
            'Use the StackNext MCP tools to diagnose a runtime error. Stay read-only and cite tool evidence.',
            errorId
              ? `Start with get_error for errorId "${errorId}".`
              : route
                ? `Start with list_errors filtered to route "${route}". Then call get_error for the most relevant id.`
                : 'Start with get_project_summary, then list_errors to find the most relevant recent error. Call get_error for its id.',
            'Read the redacted message, stack, route and resolvedTraceId. If a trace is present, call get_trace and find the failing span, its statusMessage, and any failed database query.',
            'Check meta.completeness and missingParentSpanIds. Separate the proven application failure from fallback correlation or missing telemetry.',
            'Report: finding, evidence (ids, route, frame, span, status), correlation type, completeness, and one concrete next step. Do not invent a root cause from the message alone.',
          ].join('\n\n'),
        ),
      ],
    }),
  )

  server.registerPrompt(
    'investigate-slow-request',
    {
      title: 'Investigate a slow request',
      description:
        'Guided workflow for latency. Optionally pass a minimum duration in milliseconds and a route.',
      argsSchema: {
        minDurationMs: z
          .string()
          .regex(/^\d+$/, 'minDurationMs must be a whole number')
          .optional(),
        route: z.string().max(2_000).optional(),
      },
    },
    ({ minDurationMs, route }) => {
      const threshold = minDurationMs ?? '500'
      return {
        description: 'Investigate slow Next.js requests with StackNext',
        messages: [
          promptMessage(
            [
              `Use the StackNext MCP tools to investigate a slow request. Use minDurationMs=${threshold}.`,
              route
                ? `Focus on route "${route}". Start with get_project_summary, then find_slow_requests and list_requests with q="${route}" and sort="slowest".`
                : 'Start with get_project_summary, then find_slow_requests. Pick the worst relevant result and call get_request.',
              'Break down the trace: total duration, longest spans, route/render spans, fetch spans and database queries. Do not add parent and child durations together.',
              'Test whether the slowdown repeats with a filtered list_requests call. Treat null database durations as unmeasured, not zero.',
              'Report: trace id, total duration, the measured bottleneck, whether it repeats, and any unmeasured regions. Propose one next step.',
            ].join('\n\n'),
          ),
        ],
      }
    },
  )

  server.registerPrompt(
    'inspect-database-activity',
    {
      title: 'Inspect database activity',
      description:
        'Guided workflow for SQL activity. Optionally pass a trace id or minimum duration.',
      argsSchema: {
        traceId: traceIdSchema.optional(),
        minDurationMs: z
          .string()
          .regex(/^\d+$/, 'minDurationMs must be a whole number')
          .optional(),
      },
    },
    ({ traceId, minDurationMs }) => {
      const filters: string[] = []
      if (traceId) filters.push(`traceId="${traceId}"`)
      if (minDurationMs) filters.push(`minDurationMs=${minDurationMs}`)
      return {
        description: 'Inspect StackNext database activity',
        messages: [
          promptMessage(
            [
              `Use the StackNext MCP tools to inspect database activity${filters.length > 0 ? ` with ${filters.join(' and ')}` : ''}.`,
              'Start with get_project_summary to confirm queries were captured. Then call list_database_queries with the narrowest filter available.',
              'For each relevant query, read the redacted SQL, source, success, errorMessage, durationMs, resolvedTraceId and route. Drizzle durations are null; null means unmeasured, never zero. Bind parameters are never captured.',
              'For failures or suspected N+1 patterns, open the correlated trace with get_request and compare query counts across similar requests.',
              'Report: SQL shape, source, success, measured duration or null, trace id, route, and one next step. Do not reconstruct bind parameters or compare Drizzle and Prisma durations.',
            ].join('\n\n'),
          ),
        ],
      }
    },
  )

  server.registerPrompt(
    'investigate-trace',
    {
      title: 'Investigate a trace',
      description:
        'Guided workflow for one 32-character trace id, including timeline, errors and queries.',
      argsSchema: {
        traceId: traceIdSchema,
      },
    },
    ({ traceId }) => ({
      description: `Investigate StackNext trace ${traceId}`,
      messages: [
        promptMessage(
          [
            `Use the StackNext MCP tools to investigate trace "${traceId}". Stay read-only and cite evidence.`,
            'Start with get_project_summary, then call get_trace for the trace id. If it is a request trace, get_request returns the same detail with request context.',
            'Build a short timeline: request total, longest spans, failing spans and their statusMessage, database queries, and missingParentSpanIds. Check meta.completeness.',
            'Correlate errors and queries only when the trace id matches. If the trace is incomplete or has no request root, say so.',
            'Report: finding, trace id, key spans and durations, error/query evidence, completeness, and one concrete next step.',
          ].join('\n\n'),
        ),
      ],
    }),
  )

  server.registerPrompt(
    'diagnose-runtime-issue',
    {
      title: 'Diagnose a runtime issue with findings',
      description:
        'Guided workflow over deterministic diagnostic findings. Optionally pass a diagnostic id, trace id or route.',
      argsSchema: {
        diagnosticId: z
          .string()
          .regex(/^diag-[0-9a-f]{8}-[0-9a-f]{8}$/)
          .optional(),
        traceId: traceIdSchema.optional(),
        route: z.string().max(2_000).optional(),
      },
    },
    ({ diagnosticId, traceId, route }) => {
      const start = diagnosticId
        ? `Start with stacknext_get_diagnostic for diagnosticId "${diagnosticId}".`
        : traceId
          ? `Start with stacknext_list_diagnostics filtered to traceId "${traceId}", then call stacknext_get_diagnostic for the most relevant finding.`
          : route
            ? `Start with stacknext_list_diagnostics filtered to route "${route}", then call stacknext_get_diagnostic for the most relevant finding.`
            : 'Start with get_project_summary, then call stacknext_list_diagnostics and pick the most relevant finding.'
      return {
        description: 'Diagnose a StackNext runtime issue with deterministic findings',
        messages: [
          promptMessage(
            [
              'Use the StackNext MCP tools to diagnose a runtime issue. Stay read-only, cite tool evidence and separate observation from inference.',
              start,
              'Read the finding rule, category, severity, status, sample window and limitations. "possible" is not proof; "observed" still does not establish a root cause.',
              'Verify with the referenced evidence: call get_trace or get_request for the trace, get_error for an error id, and list_database_queries for SQL context. Never add overlapping span durations, never treat null query durations as zero, and never reconstruct bind parameters.',
              'If the evidence is insufficient or the sample is empty, say so. Do not invent a cause, an index recommendation, EXPLAIN output or a source change.',
              'Report: finding id and rule, status and severity, the evidence you checked, what remains unproven, and one concrete next step. Include trace/error/query ids when available.',
            ].join('\n\n'),
          ),
        ],
      }
    },
  )
}

export interface StartMcpServerOptions {
  baseUrl: string
  token: string
  version?: string
}

/**
 * Connects a read-only StackNext MCP server to stdin/stdout. Nothing except
 * MCP protocol messages may be written to stdout.
 */
export async function startMcpServer(
  options: StartMcpServerOptions,
): Promise<McpServer> {
  const client = new StackNextApiClient({
    baseUrl: options.baseUrl,
    token: options.token,
  })
  const server = createStackNextMcpServer(client)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  return server
}
