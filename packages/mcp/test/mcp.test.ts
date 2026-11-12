import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildMeta } from '../src/meta.js'
import { StackNextApiClient } from '../src/client.js'
import { createStackNextMcpServer } from '../src/server.js'
import { verifyMcpServer } from '../src/verify.js'

const TOKEN = 'm'.repeat(32)
const TRACE_A = 'a'.repeat(32)
const TRACE_B = 'b'.repeat(32)

const ERROR_WITH_STACK = {
  id: 'error-1',
  fingerprint: 'fingerprint-1',
  message: 'boom for [redacted]',
  name: 'Error',
  stack: 'Error: boom\n    at handler (/app/api/error/route.ts:1:1)',
  timestamp: 40,
  route: '/api/error',
  method: 'GET',
  requestPath: '/api/error',
  traceId: TRACE_B,
  spanId: 'span-b',
  attributes: {},
  receivedAt: 41,
  resolvedTraceId: TRACE_B,
}

const REQUEST_A = {
  id: TRACE_A,
  traceId: TRACE_A,
  name: 'GET /api/users',
  method: 'GET',
  route: '/api/users',
  statusCode: 200,
  statusClass: '2xx',
  durationMs: 120,
  timestamp: 1,
  endTime: 121,
  spanCount: 3,
  errorCount: 0,
  databaseQueryCount: 1,
  fetchCount: 0,
  failed: false,
  slow: true,
  serviceName: 'mcp-demo',
}

const REQUEST_B = {
  id: TRACE_B,
  traceId: TRACE_B,
  name: 'GET /api/error',
  method: 'GET',
  route: '/api/error',
  statusCode: 500,
  statusClass: '5xx',
  durationMs: 40,
  timestamp: 30,
  endTime: 70,
  spanCount: 1,
  errorCount: 1,
  databaseQueryCount: 1,
  fetchCount: 0,
  failed: true,
  slow: false,
  serviceName: 'mcp-demo',
}

const QUERY_A = {
  id: 'query-1',
  traceId: TRACE_A,
  spanId: 'span-a2',
  timestamp: 10,
  durationMs: 4,
  sql: 'select * from "users"',
  databaseSystem: 'sqlite',
  operation: 'select',
  success: true,
  source: 'drizzle',
  attributes: {},
  receivedAt: 11,
  resolvedTraceId: TRACE_A,
  route: '/api/users',
}

const QUERY_B = {
  id: 'query-2',
  traceId: TRACE_B,
  spanId: 'span-b',
  timestamp: 50,
  durationMs: null,
  sql: 'select * from "tasks" where "id" = ?',
  databaseSystem: 'sqlite',
  operation: 'select',
  success: true,
  source: 'drizzle',
  attributes: {},
  receivedAt: 51,
  resolvedTraceId: TRACE_B,
  route: '/api/error',
}

const SPAN_A_ROOT = {
  traceId: TRACE_A,
  spanId: 'span-a1',
  name: 'GET /api/users',
  kind: 'server',
  startTime: 1,
  endTime: 121,
  durationMs: 120,
  status: 'ok',
  serviceName: 'mcp-demo',
  route: '/api/users',
  method: 'GET',
  statusCode: 200,
  nextSpanType: 'BaseServer.handleRequest',
  attributes: {},
  events: [],
  resource: {},
  receivedAt: 122,
}

const SPAN_A_CHILD = {
  traceId: TRACE_A,
  spanId: 'span-a2',
  parentSpanId: 'span-a1',
  name: 'executing api route',
  kind: 'internal',
  startTime: 5,
  endTime: 100,
  durationMs: 95,
  status: 'ok',
  serviceName: 'mcp-demo',
  route: '/api/users',
  attributes: {},
  events: [],
  resource: {},
  receivedAt: 122,
}

const SPAN_B_ROOT = {
  traceId: TRACE_B,
  spanId: 'span-b',
  name: 'GET /api/error',
  kind: 'server',
  startTime: 30,
  endTime: 70,
  durationMs: 40,
  status: 'error',
  statusMessage: 'boom for [redacted]',
  serviceName: 'mcp-demo',
  route: '/api/error',
  method: 'GET',
  statusCode: 500,
  nextSpanType: 'BaseServer.handleRequest',
  attributes: {},
  events: [],
  resource: {},
  receivedAt: 71,
}

const HEALTH = {
  status: 'ok',
  name: 'stacknext',
  version: '0.6.1',
  projectName: 'mcp-demo',
  dashboardUrl: 'http://127.0.0.1:4400',
  startedAt: 1,
  uptimeMs: 1_000,
  time: 2,
  connected: true,
  connections: [
    {
      instanceId: 'instance-1',
      serviceName: 'mcp-demo',
      projectName: 'mcp-demo',
      nextVersion: '16.4.3',
      sdkVersion: '0.6.1',
      lastSeen: 2,
      connected: true,
    },
  ],
  counts: {
    requests: 2,
    failedRequests: 1,
    slowRequests: 1,
    spans: 3,
    errors: 1,
    databaseQueries: 2,
  },
  store: {
    spansReceived: 3,
    errorsReceived: 1,
    databaseQueriesReceived: 2,
    dropped: { capacity: 0, retention: 0 },
    limits: {
      maxSpans: 5_000,
      maxErrors: 1_000,
      maxDatabaseQueries: 2_000,
      retentionMs: 600_000,
    },
  },
  server: {
    rejectedRequests: 0,
    droppedPayload: 0,
    droppedMalformed: 0,
    sseClients: 0,
  },
  exporter: { droppedSpans: 0, droppedEvents: 0, lastError: null },
  config: {},
}

const SUMMARY = {
  totalRequests: 2,
  failedRequests: 1,
  slowRequests: 1,
  avgDurationMs: 80,
  p95DurationMs: 120,
  spanCount: 3,
  errorCount: 1,
  databaseQueryCount: 2,
  fetchCount: 0,
  slowestRequests: [REQUEST_A, REQUEST_B],
  recentErrors: [ERROR_WITH_STACK],
  firstEventTime: 1,
  lastEventTime: 121,
}

const COVERAGE = {
  projectName: 'mcp-demo',
  generatedAt: 130,
  collectorVersion: '0.6.1',
  sample: {
    firstEventTime: 1,
    lastEventTime: 121,
    retentionMs: 600_000,
    requests: 2,
    spans: 3,
    errors: 1,
    databaseQueries: 2,
    connectedInstances: 1,
    connected: true,
  },
  statusCounts: {
    observed: 1,
    active: 0,
    configured: 0,
    'not-observed': 1,
    unsupported: 0,
    unknown: 0,
  },
  items: [
    {
      id: 'next.request-root',
      label: 'HTTP request root spans',
      category: 'framework',
      status: 'observed',
      configured: true,
      observed: true,
      description: 'Request root spans were received.',
      evidence: {
        spanTypes: ['BaseServer.handleRequest'],
        count: 2,
        lastSeen: 121,
      },
      limitations: [],
    },
    {
      id: 'next.middleware',
      label: 'Middleware',
      category: 'framework',
      status: 'not-observed',
      configured: true,
      observed: false,
      description: 'Middleware.execute spans appear when middleware runs.',
      evidence: { spanTypes: [], count: 0, lastSeen: null },
      limitations: ['No middleware span appeared in this sample.'],
    },
  ],
  notes: [
    '1 item(s) were not observed in this sample. Absence is not proof that the feature is broken.',
  ],
  limitations: [
    'Coverage is inferred from the current in-memory retention window.',
  ],
}

const DIAGNOSTIC_ID = 'diag-1234abcd-5678ef90'

const DIAGNOSTIC_FINDING = {
  id: DIAGNOSTIC_ID,
  ruleId: 'slow-span' as const,
  ruleVersion: 2,
  category: 'performance' as const,
  severity: 'warning' as const,
  status: 'observed' as const,
  title: 'Slow http span: fetch GET https://api.example.test/users',
  summary: '520 ms exceeded the 500 ms http threshold in trace ' + TRACE_A + '.',
  detail: 'Span fetch GET https://api.example.test/users took 520 ms.',
  route: '/api/users',
  method: 'GET',
  traceIds: [TRACE_A],
  affectedTraceCount: 1,
  firstSeen: 1,
  lastSeen: 121,
  fingerprint: 'abcd1234',
  evidence: {
    traceIds: [TRACE_A],
    spans: [
      {
        spanId: SPAN_A_CHILD.spanId,
        traceId: TRACE_A,
        name: 'fetch GET https://api.example.test/users',
        durationMs: 520,
        category: 'http' as const,
        status: 'ok',
        route: '/api/users',
        nextSpanType: 'AppRender.fetch',
        selfDurationMs: 520,
        nextPhase: 'fetch' as const,
        isRequestRoot: false as const,
      },
    ],
    queries: [],
    errors: [],
    contributors: [
      {
        traceId: TRACE_A,
        spanId: SPAN_A_CHILD.spanId,
        label: 'fetch GET https://api.example.test/users',
        category: 'http' as const,
        phase: 'fetch' as const,
        selfMs: 520,
        durationMs: 520,
      },
    ],
    traces: [
      {
        traceId: TRACE_A,
        timestamp: 1,
        occurrences: 1,
        durationMs: 520,
        contributor: 'fetch GET https://api.example.test/users',
      },
    ],
    measurements: [
      { label: 'duration', value: 520, unit: 'ms' },
      { label: 'threshold', value: 500, unit: 'ms' },
    ],
  },
  verification: [
    'Confirm the duration was measured rather than estimated.',
    'Check the referenced trace before changing code.',
  ],
  limitations: [
    'Findings are deterministic heuristics, not confirmed root causes.',
    'Span duration includes child work.',
  ],
}

const DIAGNOSTIC_TRACE = {
  traceId: TRACE_A,
  request: REQUEST_A,
  spans: [SPAN_A_ROOT, SPAN_A_CHILD],
  errors: [],
  databaseQueries: [QUERY_A],
  startTime: 1,
  endTime: 121,
  durationMs: 120,
  spanCount: 2,
  errorCount: 0,
  databaseQueryCount: 1,
  missingParentSpanIds: [],
}

const SNAPSHOT_ID = 'snap-0123456789abcdef'

const SNAPSHOT_SUMMARY = {
  id: SNAPSHOT_ID,
  createdAt: 500,
  source: 'manual',
  projectName: 'mcp-demo',
  collectorVersion: '0.6.1',
  label: 'before change',
  sample: {
    firstEventTime: 1,
    lastEventTime: 121,
    retentionMs: 600_000,
  },
  stats: {
    requests: 1,
    errors: 0,
    databaseQueries: 1,
    spans: 2,
  },
  bytes: 2_048,
}

const SNAPSHOT_CONFIG = {
  collector: { maxSpans: 5_000, retentionMs: 600_000 },
  slowRequestMs: 500,
  snapshots: {
    autoOnExit: true,
    autoOnError: true,
    autoKeep: 10,
    maxBytes: 67_108_864,
  },
}

const SNAPSHOT_DETAIL = {
  snapshot: SNAPSHOT_SUMMARY,
  config: SNAPSHOT_CONFIG,
  limitations: [
    'A snapshot is a frozen, redacted copy of one collector sample. It is not live telemetry.',
    'Diagnostics and coverage are not stored in a snapshot.',
  ],
  traces: [
    {
      traceId: TRACE_A,
      rootName: 'GET /api/users',
      rootSpanId: 'span-a1',
      serviceName: 'mcp-demo',
      startTime: 1,
      endTime: 121,
      durationMs: 120,
      spanCount: 2,
      errorCount: 0,
      databaseQueryCount: 1,
      failed: false,
      request: REQUEST_A,
    },
  ],
  errors: [],
  databaseQueries: [QUERY_A],
}

const DIAGNOSTICS = {
  items: [DIAGNOSTIC_FINDING],
  total: 1,
  limit: 50,
  offset: 0,
  generatedAt: 130,
  engineVersion: '0.6.1',
  ruleSetVersion: 2,
  sample: {
    firstEventTime: 1,
    lastEventTime: 121,
    retentionMs: 600_000,
    requests: 2,
    spans: 3,
    errors: 1,
    databaseQueries: 2,
    connectedInstances: 1,
    connected: true,
    requestTraces: 2,
    tracesWithoutRequestRoot: 0,
    tracesWithMissingParents: 0,
    unattributedSpans: 0,
    ignoredControlFlowErrors: 0,
    serverErrorsWithoutError: 0,
  },
  counts: {
    total: 1,
    bySeverity: { info: 0, warning: 1, error: 0 },
    byCategory: { database: 0, http: 0, performance: 1, errors: 0, runtime: 0 },
    byStatus: { observed: 1, 'insufficient-evidence': 0, possible: 0 },
  },
  notes: [
    'Findings are deterministic heuristics over the current sample, not confirmed root causes.',
  ],
  limitations: [
    'Only the current in-memory retention window is analyzed.',
  ],
}

const RUN_ID = 'run-1111111111111111'
const CANDIDATE_RUN_ID = 'run-3333333333333333'
const BASELINE_ID = 'base-2222222222222222'
const COMPARISON_ID = 'cmp-4444444444444444'
const SCENARIO_ID = 'scn-5555555555555555'

const REGRESSION_ENVIRONMENT = {
  nodeVersion: '24.21.0',
  nextVersion: '16.4.3',
  platform: 'linux',
  arch: 'x64',
  runtime: 'nodejs' as const,
  databases: ['sqlite'],
  instrumentation: {
    verbose: false,
    verboseSource: 'default',
    captureFetch: true,
    captureErrors: true,
  },
  sdkVersion: '0.6.1',
  diagnostics: { ruleSetVersion: 2 },
  playwrightVersion: '1.58.2',
}

function capturedSample(index: number): Record<string, unknown> {
  return {
    id: `smp-${String(index + 1).padStart(16, '0')}`,
    status: 'passed',
    expectedStatus: 'passed',
    retry: 0,
    repeatEachIndex: index,
    durationMs: 100 + index,
    capturedAt: 1_000 + index,
    correlation: {
      status: 'verified',
      reasons: [],
      traces: [
        {
          traceId: `${'c'.repeat(31)}${index}`,
          injectedSpanId: `${'d'.repeat(15)}${index}`,
          key: 'GET /projects/[id]',
          method: 'GET',
          route: '/projects/[id]',
          rootName: 'GET /projects/[id]',
          statusCode: 200,
          durationMs: 90 + index,
          spanCount: 2,
          errorCount: 0,
          databaseQueryCount: 1,
          fetchCount: 0,
          spans: [
            {
              key: 'span:GET /projects/[id]',
              name: 'GET /projects/[id]',
              kind: 'server',
              category: 'framework',
              durationMs: 90 + index,
              status: 'ok',
              nextSpanType: 'BaseServer.handleRequest',
            },
          ],
          queries: [
            {
              key: 'query:select tasks',
              shape: 'select * from tasks where id = ?',
              durationMs: 5,
              source: 'drizzle',
              success: true,
            },
          ],
          errors: [],
        },
      ],
    },
    findings: [
      {
        key: 'finding:slow-span',
        ruleId: 'slow-span',
        category: 'performance',
        severity: 'warning',
        status: 'observed',
      },
    ],
  }
}

const CAPTURED_SCENARIO = {
  identity: {
    id: SCENARIO_ID,
    source: 'annotation',
    title: 'project detail responds',
    file: 'tests/project.spec.ts',
    project: 'chromium',
    tags: ['critical'],
  },
  samples: [capturedSample(0), capturedSample(1), capturedSample(2)],
  findings: [
    {
      key: 'finding:slow-span',
      ruleId: 'slow-span',
      category: 'performance',
      severity: 'warning',
      status: 'observed',
    },
  ],
  notes: [],
  limitations: [],
}

const REGRESSION_STATS = {
  scenarios: 1,
  samples: 3,
  verifiedSamples: 3,
  incompleteSamples: 0,
  traces: 3,
  requests: 3,
  spans: 6,
  errors: 0,
  databaseQueries: 3,
}

const TEST_RUN = {
  format: 'stacknext-test-run',
  version: 1,
  id: RUN_ID,
  name: 'baseline-capture',
  projectName: 'mcp-demo',
  status: 'completed',
  createdAt: 2_000,
  completedAt: 3_000,
  command: {
    executable: 'npx',
    args: ['playwright', 'test'],
    exitCode: 0,
    signal: null,
    durationMs: 1_000,
  },
  environment: REGRESSION_ENVIRONMENT,
  collector: { version: '0.6.1', connected: true },
  scenarios: [CAPTURED_SCENARIO],
  warnings: [],
  notes: [],
  limitations: ['Comparisons use only correlated local samples.'],
  stats: REGRESSION_STATS,
}

const RUN_SUMMARY = {
  id: RUN_ID,
  name: TEST_RUN.name,
  projectName: TEST_RUN.projectName,
  status: TEST_RUN.status,
  createdAt: TEST_RUN.createdAt,
  completedAt: TEST_RUN.completedAt,
  durationMs: TEST_RUN.command.durationMs,
  scenarios: REGRESSION_STATS.scenarios,
  samples: REGRESSION_STATS.samples,
  verifiedSamples: REGRESSION_STATS.verifiedSamples,
  incompleteSamples: REGRESSION_STATS.incompleteSamples,
  environment: REGRESSION_ENVIRONMENT,
}

const BASELINE = {
  format: 'stacknext-baseline',
  version: 1,
  id: BASELINE_ID,
  name: 'main-baseline',
  projectName: 'mcp-demo',
  createdAt: 3_100,
  sourceRunId: RUN_ID,
  environment: REGRESSION_ENVIRONMENT,
  scenarios: [CAPTURED_SCENARIO],
  warnings: [],
  notes: ['Captured before the regression branch.'],
  limitations: ['Baselines are immutable local snapshots.'],
  stats: REGRESSION_STATS,
}

const BASELINE_SUMMARY = {
  id: BASELINE_ID,
  name: BASELINE.name,
  projectName: BASELINE.projectName,
  createdAt: BASELINE.createdAt,
  sourceRunId: BASELINE.sourceRunId,
  scenarios: REGRESSION_STATS.scenarios,
  samples: REGRESSION_STATS.samples,
  environment: REGRESSION_ENVIRONMENT,
}

const COMPARISON = {
  format: 'stacknext-comparison',
  version: 1,
  id: COMPARISON_ID,
  projectName: 'mcp-demo',
  createdAt: 3_200,
  baselineId: BASELINE_ID,
  candidateId: CANDIDATE_RUN_ID,
  status: 'regressed',
  severity: 'high',
  environment: { compatible: true, ignored: false, differences: [] },
  options: {
    minSamples: 3,
    durationRegressionPct: 20,
    durationRegressionMs: 25,
    durationImprovementPct: 20,
    durationImprovementMs: 25,
    countRegressionMin: 1,
    ignoreEnvironment: false,
  },
  summary: { scenarios: 1, regressed: 1, improved: 0, unchanged: 0, inconclusive: 0 },
  scenarios: [
    {
      scenarioId: SCENARIO_ID,
      title: CAPTURED_SCENARIO.identity.title,
      file: CAPTURED_SCENARIO.identity.file,
      project: CAPTURED_SCENARIO.identity.project,
      status: 'regressed',
      severity: 'high',
      reasons: ['duration-regression'],
      metrics: [
        {
          key: 'scenario:duration',
          label: 'Scenario request duration',
          kind: 'duration',
          status: 'regressed',
          severity: 'high',
          baselineValue: 91,
          candidateValue: 300,
          delta: 209,
          percent: 229.7,
          sampleCount: 3,
        },
      ],
      baseline: { samples: 3, verifiedSamples: 3, incompleteSamples: 0, traces: 3, findings: 1 },
      candidate: { samples: 3, verifiedSamples: 3, incompleteSamples: 0, traces: 3, findings: 0 },
    },
  ],
  warnings: [],
  limitations: ['Medians are not a statistical significance test.'],
}

const COMPARISON_SUMMARY = {
  id: COMPARISON_ID,
  projectName: COMPARISON.projectName,
  baselineId: BASELINE_ID,
  candidateId: CANDIDATE_RUN_ID,
  createdAt: COMPARISON.createdAt,
  status: COMPARISON.status,
  severity: COMPARISON.severity,
  summary: COMPARISON.summary,
  environmentCompatible: true,
}

interface MockCollector {
  url: string
  requests: string[]
  close(): Promise<void>
}

function page<T>(items: T[], url: URL): {
  items: T[]
  total: number
  limit: number
  offset: number
} {
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50)))
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0))
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    limit,
    offset,
  }
}

async function startMockCollector(): Promise<MockCollector> {
  const requests: string[] = []
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`)
    if (request.headers.authorization !== `Bearer ${TOKEN}`) {
      response.writeHead(401, { 'content-type': 'application/json' })
      response.end('{"error":"Unauthorized"}')
      return
    }
    if (request.method !== 'GET') {
      response.writeHead(405)
      response.end()
      return
    }
    const send = (payload: unknown): void => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(payload))
    }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/api/health') {
      send(HEALTH)
      return
    }
    if (url.pathname === '/api/summary') {
      send({ health: HEALTH, summary: SUMMARY, coverage: COVERAGE })
      return
    }
    if (url.pathname === '/api/test-runs') {
      send(page([RUN_SUMMARY], url))
      return
    }
    if (url.pathname === `/api/test-runs/${RUN_ID}`) {
      send(TEST_RUN)
      return
    }
    if (url.pathname.startsWith('/api/test-runs/')) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end('{"error":"Test run not found"}')
      return
    }
    if (url.pathname === '/api/baselines') {
      send(page([BASELINE_SUMMARY], url))
      return
    }
    if (url.pathname === `/api/baselines/${BASELINE_ID}`) {
      send(BASELINE)
      return
    }
    if (url.pathname.startsWith('/api/baselines/')) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end('{"error":"Baseline not found"}')
      return
    }
    if (url.pathname === '/api/comparisons') {
      send(page([COMPARISON_SUMMARY], url))
      return
    }
    if (url.pathname === `/api/comparisons/${COMPARISON_ID}`) {
      send(COMPARISON)
      return
    }
    if (url.pathname.startsWith('/api/comparisons/')) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end('{"error":"Comparison not found"}')
      return
    }
    if (url.pathname === '/api/snapshots') {
      send({ ...page([SNAPSHOT_SUMMARY], url), invalid: 0 })
      return
    }
    if (url.pathname === `/api/snapshots/${SNAPSHOT_ID}`) {
      send(SNAPSHOT_DETAIL)
      return
    }
    if (url.pathname === `/api/snapshots/${SNAPSHOT_ID}/traces/${TRACE_A}`) {
      send(DIAGNOSTIC_TRACE)
      return
    }
    if (url.pathname.startsWith('/api/snapshots/')) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end('{"error":"Snapshot not found"}')
      return
    }
    if (url.pathname === '/api/requests') {
      const minDuration = Number(url.searchParams.get('minDuration') ?? 0)
      const q = url.searchParams.get('q')?.toLowerCase()
      const items = [REQUEST_A, REQUEST_B].filter(
        (item) =>
          (item.durationMs ?? 0) >= minDuration &&
          (!q || JSON.stringify(item).toLowerCase().includes(q)),
      )
      if (url.searchParams.get('sort') === 'slowest') {
        items.sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
      }
      send(page(items, url))
      return
    }
    if (url.pathname === '/api/traces') {
      send(
        page(
          [
            {
              traceId: TRACE_A,
              rootName: 'GET /api/users',
              rootSpanId: 'span-a1',
              serviceName: 'mcp-demo',
              startTime: 1,
              endTime: 121,
              durationMs: 120,
              spanCount: 2,
              errorCount: 0,
              databaseQueryCount: 1,
              failed: false,
              request: REQUEST_A,
            },
          ],
          url,
        ),
      )
      return
    }
    if (url.pathname === `/api/traces/${TRACE_A}`) {
      send({
        ...DIAGNOSTIC_TRACE,
        diagnostics: [
          {
            id: DIAGNOSTIC_ID,
            ruleId: 'slow-span',
            category: 'performance',
            severity: 'warning',
            status: 'observed',
            title: DIAGNOSTIC_FINDING.title,
          },
        ],
      })
      return
    }
    if (url.pathname === `/api/traces/${TRACE_B}`) {
      send({
        traceId: TRACE_B,
        request: REQUEST_B,
        spans: [SPAN_B_ROOT],
        errors: [ERROR_WITH_STACK],
        databaseQueries: [QUERY_B],
        startTime: 30,
        endTime: 70,
        durationMs: 40,
        missingParentSpanIds: ['missing-parent'],
      })
      return
    }
    if (url.pathname === '/api/diagnostics') {
      const category = url.searchParams.get('category')
      const severity = url.searchParams.get('severity')
      const ruleId = url.searchParams.get('ruleId')
      const items = [DIAGNOSTIC_FINDING].filter(
        (item) =>
          (!category || item.category === category) &&
          (!severity || item.severity === severity) &&
          (!ruleId || item.ruleId === ruleId),
      )
      const paged = page(items, url)
      send({ ...DIAGNOSTICS, ...paged, counts: { ...DIAGNOSTICS.counts, total: paged.total } })
      return
    }
    if (url.pathname === `/api/diagnostics/${DIAGNOSTIC_ID}`) {
      send({ finding: DIAGNOSTIC_FINDING, trace: DIAGNOSTIC_TRACE })
      return
    }
    if (url.pathname.startsWith('/api/diagnostics/')) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end('{"error":"Diagnostic not found"}')
      return
    }
    if (url.pathname === '/api/errors') {
      send({ ...page([ERROR_WITH_STACK], url), groups: [] })
      return
    }
    if (url.pathname === `/api/errors/${ERROR_WITH_STACK.id}`) {
      send({
        error: ERROR_WITH_STACK,
        trace: {
          traceId: TRACE_B,
          request: REQUEST_B,
          spans: [SPAN_B_ROOT],
          errors: [ERROR_WITH_STACK],
          databaseQueries: [QUERY_B],
          startTime: 30,
          endTime: 70,
          durationMs: 40,
          missingParentSpanIds: [],
        },
      })
      return
    }
    if (url.pathname === '/api/database') {
      send(page([QUERY_A, QUERY_B], url))
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end('{"error":"Not found"}')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = result.content as Array<{ type: string; text?: string }>
  return content.map((entry) => entry.text ?? '').join('\n')
}

function structuredOf(
  result: Awaited<ReturnType<Client['callTool']>>,
): Record<string, unknown> {
  return result.structuredContent as Record<string, unknown>
}

async function connect(
  api: StackNextApiClient,
): Promise<{ client: Client; close(): Promise<void> }> {
  const server = createStackNextMcpServer(api)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return {
    client,
    close: async () => {
      await client.close()
      await server.close()
    },
  }
}

describe('read-only MCP server', () => {
  let collector: MockCollector
  let client: Client
  let close: () => Promise<void>

  beforeEach(async () => {
    collector = await startMockCollector()
    const connection = await connect(
      new StackNextApiClient({ baseUrl: collector.url, token: TOKEN }),
    )
    client = connection.client
    close = connection.close
  })

  afterEach(async () => {
    await close()
    await collector.close()
  })

  it('exposes only read-only investigation tools with output schemas', async () => {
    const { tools } = await client.listTools()
    const names = tools.map((tool) => tool.name).sort()
    expect(names).toEqual([
      'find_slow_requests',
      'get_error',
      'get_project_summary',
      'get_request',
      'get_trace',
      'list_database_queries',
      'list_errors',
      'list_requests',
      'list_traces',
      'stacknext_get_baseline',
      'stacknext_get_comparison',
      'stacknext_get_diagnostic',
      'stacknext_get_snapshot',
      'stacknext_get_snapshot_trace',
      'stacknext_get_test_run',
      'stacknext_list_baselines',
      'stacknext_list_comparisons',
      'stacknext_list_diagnostics',
      'stacknext_list_snapshots',
      'stacknext_list_test_runs',
    ])
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true)
      expect(tool.annotations?.destructiveHint).toBe(false)
      expect(tool.outputSchema, `${tool.name} has no output schema`).toBeTruthy()
      expect(tool.description?.length ?? 0).toBeGreaterThan(40)
    }
  })

  it('publishes server instructions and guided prompts', async () => {
    expect(client.getInstructions()).toContain('get_project_summary')
    expect(client.getInstructions()).toContain('stacknext_list_diagnostics')
    expect(client.getInstructions()).toContain('stacknext_get_diagnostic')
    expect(client.getInstructions()).toContain('stacknext_list_test_runs')
    expect(client.getInstructions()).toContain('stacknext_get_comparison')
    expect(client.getInstructions()).toContain('stacknext_list_snapshots')
    expect(client.getInstructions()).toContain('stacknext_get_snapshot_trace')

    const { prompts } = await client.listPrompts()
    expect(prompts.map((prompt) => prompt.name).sort()).toEqual([
      'diagnose-error',
      'diagnose-runtime-issue',
      'inspect-database-activity',
      'investigate-slow-request',
      'investigate-trace',
    ])

    const diagnosis = await client.getPrompt({
      name: 'diagnose-error',
      arguments: { errorId: 'error-1' },
    })
    const diagnosisText = diagnosis.messages
      .map((message) =>
        message.content.type === 'text' ? message.content.text : '',
      )
      .join('\n')
    expect(diagnosisText).toContain('get_error')
    expect(diagnosisText).toContain('error-1')

    const trace = await client.getPrompt({
      name: 'investigate-trace',
      arguments: { traceId: TRACE_A },
    })
    expect(trace.messages[0]?.content.type).toBe('text')

    const diagnostics = await client.getPrompt({
      name: 'diagnose-runtime-issue',
      arguments: { diagnosticId: DIAGNOSTIC_ID },
    })
    const diagnosticsText = diagnostics.messages
      .map((message) =>
        message.content.type === 'text' ? message.content.text : '',
      )
      .join('\n')
    expect(diagnosticsText).toContain('stacknext_get_diagnostic')
    expect(diagnosticsText).toContain(DIAGNOSTIC_ID)
    expect(diagnosticsText).toContain('does not establish a root cause')
    expect(diagnosticsText).toContain('never treat null query durations as zero')
  })

  it('serves project, request, trace and database data', async () => {
    const summary = await client.callTool({
      name: 'get_project_summary',
      arguments: {},
    })
    expect(textOf(summary)).toContain('mcp-demo')
    const summaryData = structuredOf(summary)
    expect((summaryData.summary as { totalRequests: number }).totalRequests).toBe(2)
    expect(summaryData.meta).toMatchObject({
      tool: 'get_project_summary',
      project: 'mcp-demo',
      connection: { instrumentation: 'connected', collectorVersion: '0.6.1' },
      coverage: {
        observed: 1,
        notObserved: 1,
        unsupported: 0,
        requestsInSample: 2,
      },
    })
    const summaryNotes = (summaryData.meta as { notes: string[] }).notes.join(' ')
    expect(summaryNotes).toContain('Instrumentation coverage')
    expect(summaryNotes).toContain('not that the feature is broken')
    expect(summaryData.coverage).toMatchObject({
      statusCounts: { observed: 1, 'not-observed': 1 },
      sample: { requests: 2, connected: true },
    })

    const requests = await client.callTool({
      name: 'list_requests',
      arguments: { limit: 5, sort: 'slowest' },
    })
    expect(textOf(requests)).toContain('GET /api/users')
    expect(structuredOf(requests).meta).toMatchObject({
      tool: 'list_requests',
      result: { found: 2, returned: 2, limit: 5, offset: 0, hasMore: false },
    })

    const slow = await client.callTool({
      name: 'find_slow_requests',
      arguments: { minDurationMs: 100 },
    })
    expect(textOf(slow)).toContain(TRACE_A)
    expect(collector.requests).toContain(
      'GET /api/requests?limit=20&minDuration=100&sort=slowest',
    )

    const request = await client.callTool({
      name: 'get_request',
      arguments: { traceId: TRACE_A },
    })
    const requestData = structuredOf(request)
    expect(requestData.traceId).toBe(TRACE_A)
    expect(requestData.meta).toMatchObject({
      tool: 'get_request',
      identifiers: { traceId: TRACE_A },
      completeness: { complete: true },
    })

    const database = await client.callTool({
      name: 'list_database_queries',
      arguments: {},
    })
    expect(textOf(database)).toContain('select * from')
    expect(textOf(database)).toContain('users')
    expect(structuredOf(database).meta).toMatchObject({
      notes: [expect.stringContaining('null because the adapter')],
    })
  })

  it('serves deterministic diagnostics with bounded evidence and filters', async () => {
    const listed = await client.callTool({
      name: 'stacknext_list_diagnostics',
      arguments: {
        category: 'performance',
        severity: 'warning',
        ruleId: 'slow-span',
        limit: 5,
      },
    })
    const listedData = structuredOf(listed)
    expect(listed.isError).not.toBe(true)
    expect(listedData.total).toBe(1)
    expect((listedData.items as Array<{ id: string }>)[0]?.id).toBe(DIAGNOSTIC_ID)
    expect(listedData.meta).toMatchObject({
      tool: 'stacknext_list_diagnostics',
      result: { found: 1, returned: 1, limit: 5, offset: 0, hasMore: false },
    })
    const listNotes = (listedData.meta as { notes: string[] }).notes.join(' ')
    expect(listNotes).toContain('not confirmed root causes')
    expect(
      collector.requests.some(
        (entry) =>
          entry.startsWith('GET /api/diagnostics?') &&
          entry.includes('category=performance') &&
          entry.includes('severity=warning') &&
          entry.includes('ruleId=slow-span'),
      ),
    ).toBe(true)

    const detail = await client.callTool({
      name: 'stacknext_get_diagnostic',
      arguments: { diagnosticId: DIAGNOSTIC_ID },
    })
    const detailData = structuredOf(detail)
    expect(detail.isError).not.toBe(true)
    expect((detailData.finding as { id: string }).id).toBe(DIAGNOSTIC_ID)
    expect((detailData.trace as { traceId: string }).traceId).toBe(TRACE_A)
    expect(detailData.meta).toMatchObject({
      tool: 'stacknext_get_diagnostic',
      identifiers: { diagnosticId: DIAGNOSTIC_ID, traceId: TRACE_A },
    })
    const detailNotes = (detailData.meta as { notes: string[] }).notes.join(' ')
    expect(detailNotes).toContain('not confirmed root causes')
    expect(detailNotes).toContain('Span duration includes child work')

    const missing = await client.callTool({
      name: 'stacknext_get_diagnostic',
      arguments: { diagnosticId: 'diag-00000000-00000000' },
    })
    expect(missing.isError).toBe(true)
    expect(textOf(missing)).toContain('No diagnostic with id')
    expect(textOf(missing)).toContain('stacknext_list_diagnostics')

    const invalid = await client.callTool({
      name: 'stacknext_get_diagnostic',
      arguments: { diagnosticId: 'not-an-id' },
    })
    expect(invalid.isError).toBe(true)
  })

  it('serves regression runs, baselines and comparisons read-only', async () => {
    const runs = await client.callTool({
      name: 'stacknext_list_test_runs',
      arguments: { limit: 10 },
    })
    const runsData = structuredOf(runs)
    expect(runs.isError).not.toBe(true)
    expect(runsData.total).toBe(1)
    expect((runsData.items as Array<{ id: string }>)[0]?.id).toBe(RUN_ID)
    expect(runsData.meta).toMatchObject({
      tool: 'stacknext_list_test_runs',
      result: { found: 1, returned: 1, limit: 10, offset: 0, hasMore: false },
    })

    const run = await client.callTool({
      name: 'stacknext_get_test_run',
      arguments: { runId: RUN_ID },
    })
    const runData = structuredOf(run)
    expect(run.isError).not.toBe(true)
    expect(textOf(run)).toContain(CAPTURED_SCENARIO.identity.title)
    expect(runData.status).toBe('completed')
    expect((runData.stats as { verifiedSamples: number }).verifiedSamples).toBe(3)
    expect(runData.meta).toMatchObject({
      tool: 'stacknext_get_test_run',
      identifiers: { runId: RUN_ID },
    })

    const baselines = await client.callTool({
      name: 'stacknext_list_baselines',
      arguments: { limit: 10 },
    })
    const baselinesData = structuredOf(baselines)
    expect(baselinesData.total).toBe(1)
    expect((baselinesData.items as Array<{ id: string }>)[0]?.id).toBe(BASELINE_ID)

    const baseline = await client.callTool({
      name: 'stacknext_get_baseline',
      arguments: { baselineId: BASELINE_ID },
    })
    const baselineData = structuredOf(baseline)
    expect(baseline.isError).not.toBe(true)
    expect(baselineData.sourceRunId).toBe(RUN_ID)
    expect(baselineData.meta).toMatchObject({
      tool: 'stacknext_get_baseline',
      identifiers: { baselineId: BASELINE_ID, sourceRunId: RUN_ID },
    })

    const comparisons = await client.callTool({
      name: 'stacknext_list_comparisons',
      arguments: { limit: 10 },
    })
    const comparisonsData = structuredOf(comparisons)
    expect(comparisonsData.total).toBe(1)
    expect(
      (comparisonsData.items as Array<{ status: string }>)[0]?.status,
    ).toBe('regressed')
    expect(
      (comparisonsData.meta as { notes: string[] }).notes.join(' '),
    ).toContain('not statistical significance tests')

    const comparison = await client.callTool({
      name: 'stacknext_get_comparison',
      arguments: { comparisonId: COMPARISON_ID },
    })
    const comparisonData = structuredOf(comparison)
    expect(comparison.isError).not.toBe(true)
    expect(textOf(comparison)).toContain('Scenario request duration')
    expect(comparisonData.status).toBe('regressed')
    expect(comparisonData.meta).toMatchObject({
      tool: 'stacknext_get_comparison',
      identifiers: {
        comparisonId: COMPARISON_ID,
        baselineId: BASELINE_ID,
        candidateId: CANDIDATE_RUN_ID,
      },
    })

    const missing = await client.callTool({
      name: 'stacknext_get_test_run',
      arguments: { runId: 'run-0000000000000000' },
    })
    expect(missing.isError).toBe(true)
    expect(textOf(missing)).toContain('No saved test run')
    expect(textOf(missing)).toContain('stacknext_list_test_runs')

    const invalid = await client.callTool({
      name: 'stacknext_get_comparison',
      arguments: { comparisonId: 'not-an-id' },
    })
    expect(invalid.isError).toBe(true)
  })

  it('serves snapshots as frozen evidence without live diagnostics', async () => {
    const listed = await client.callTool({
      name: 'stacknext_list_snapshots',
      arguments: { limit: 10 },
    })
    expect(listed.isError).not.toBe(true)
    const listedData = structuredOf(listed)
    expect(listedData.total).toBe(1)
    expect(listedData.invalid).toBe(0)
    expect((listedData.items as Array<{ id: string }>)[0]?.id).toBe(SNAPSHOT_ID)
    expect(listedData.meta).toMatchObject({
      tool: 'stacknext_list_snapshots',
      result: { found: 1, returned: 1, limit: 10, offset: 0, hasMore: false },
    })
    const listNotes = (listedData.meta as { notes: string[] }).notes.join(' ')
    expect(listNotes).toContain('frozen copies')
    expect(listNotes).toContain('not describe the current live sample')
    expect(
      collector.requests.some((entry) => entry.startsWith('GET /api/snapshots?')),
    ).toBe(true)

    const detail = await client.callTool({
      name: 'stacknext_get_snapshot',
      arguments: { snapshotId: SNAPSHOT_ID },
    })
    expect(detail.isError).not.toBe(true)
    const detailData = structuredOf(detail)
    expect((detailData.snapshot as { id: string }).id).toBe(SNAPSHOT_ID)
    expect(detailData.traces).toHaveLength(1)
    expect(detailData.errors).toHaveLength(0)
    expect(detailData.databaseQueries).toHaveLength(1)
    expect(detailData.meta).toMatchObject({
      tool: 'stacknext_get_snapshot',
      identifiers: { snapshotId: SNAPSHOT_ID },
    })
    const detailNotes = (detailData.meta as { notes: string[] }).notes.join(' ')
    expect(detailNotes).toContain('frozen snapshot, not the live sample')
    expect(detailNotes).toContain('not live telemetry')

    const trace = await client.callTool({
      name: 'stacknext_get_snapshot_trace',
      arguments: { snapshotId: SNAPSHOT_ID, traceId: TRACE_A },
    })
    expect(trace.isError).not.toBe(true)
    const traceData = structuredOf(trace)
    expect(traceData.traceId).toBe(TRACE_A)
    expect(traceData.spans).toHaveLength(2)
    expect(traceData).not.toHaveProperty('diagnostics')
    expect(traceData.meta).toMatchObject({
      tool: 'stacknext_get_snapshot_trace',
      identifiers: { snapshotId: SNAPSHOT_ID, traceId: TRACE_A },
    })
    expect(
      collector.requests.some(
        (entry) =>
          entry === `GET /api/snapshots/${SNAPSHOT_ID}/traces/${TRACE_A}`,
      ),
    ).toBe(true)

    const missing = await client.callTool({
      name: 'stacknext_get_snapshot',
      arguments: { snapshotId: 'snap-ffffffffffffffff' },
    })
    expect(missing.isError).toBe(true)
    expect(textOf(missing)).toContain('No snapshot with id')
    expect(textOf(missing)).toContain('stacknext_list_snapshots')

    const invalid = await client.callTool({
      name: 'stacknext_get_snapshot',
      arguments: { snapshotId: 'not-an-id' },
    })
    expect(invalid.isError).toBe(true)
  })

  it('adds diagnostic references to get_trace without changing the trace shape', async () => {
    const trace = await client.callTool({
      name: 'get_trace',
      arguments: { traceId: TRACE_A },
    })
    const data = structuredOf(trace)
    expect(data.traceId).toBe(TRACE_A)
    expect(data.spans).toHaveLength(2)
    const diagnostics = data.diagnostics as Array<{ id: string }>
    expect(diagnostics[0]?.id).toBe(DIAGNOSTIC_ID)
    const notes = (data.meta as { notes: string[] }).notes.join(' ')
    expect(notes).toContain('diagnostic finding(s) reference this trace')
    expect(notes).toContain(DIAGNOSTIC_ID)
  })

  it('adds pagination metadata and completeness reasons', async () => {
    const first = await client.callTool({
      name: 'list_requests',
      arguments: { limit: 1, offset: 0 },
    })
    expect(structuredOf(first).meta).toMatchObject({
      result: {
        found: 2,
        returned: 1,
        limit: 1,
        offset: 0,
        hasMore: true,
        nextOffset: 1,
      },
      completeness: { complete: false },
    })
    const reasons = (structuredOf(first).meta as {
      completeness: { reasons: string[] }
    }).completeness.reasons
    expect(reasons.join(' ')).toContain('offset=1')

    const second = await client.callTool({
      name: 'list_requests',
      arguments: { limit: 1, offset: 1 },
    })
    expect(structuredOf(second).meta).toMatchObject({
      result: { found: 2, returned: 1, hasMore: false, nextOffset: null },
    })
  })

  it('omits error stacks by default and includes them on request', async () => {
    const listed = await client.callTool({
      name: 'list_errors',
      arguments: {},
    })
    const listedData = structuredOf(listed)
    const listedItems = listedData.items as Array<Record<string, unknown>>
    expect(listedItems[0]?.stack).toBeUndefined()
    expect(listedData.meta).toMatchObject({
      notes: [expect.stringContaining('stacks are omitted')],
    })

    const withStack = await client.callTool({
      name: 'list_errors',
      arguments: { includeStack: true },
    })
    const withStackItems = structuredOf(withStack).items as Array<
      Record<string, unknown>
    >
    expect(withStackItems[0]?.stack).toContain('route.ts')

    const detail = await client.callTool({
      name: 'get_error',
      arguments: { errorId: 'error-1' },
    })
    const detailData = structuredOf(detail)
    expect((detailData.error as { stack: string }).stack).toContain('route.ts')
    expect(detailData.meta).toMatchObject({
      identifiers: { errorId: 'error-1', traceId: TRACE_B },
    })
  })

  it('reports incomplete traces and empty results honestly', async () => {
    const incomplete = await client.callTool({
      name: 'get_request',
      arguments: { traceId: TRACE_B },
    })
    expect(structuredOf(incomplete).meta).toMatchObject({
      completeness: { complete: false },
    })
    const reasons = (structuredOf(incomplete).meta as {
      completeness: { reasons: string[] }
    }).completeness.reasons
    expect(reasons.join(' ')).toContain('missing')

    const empty = await client.callTool({
      name: 'list_requests',
      arguments: { q: 'does-not-exist' },
    })
    expect(structuredOf(empty).meta).toMatchObject({
      result: { found: 0, returned: 0 },
      completeness: { complete: false },
    })
  })

  it('returns actionable tool errors without crashing the server', async () => {
    const missing = await client.callTool({
      name: 'get_request',
      arguments: { traceId: TRACE_B.replace('b', 'c') },
    })
    expect(missing.isError).toBe(true)
    expect(textOf(missing)).toContain('No request with trace id')
    expect(textOf(missing)).toContain('list_requests')

    const invalid = await client.callTool({
      name: 'get_request',
      arguments: { traceId: 'not-a-trace' },
    })
    expect(invalid.isError).toBe(true)

    const summary = await client.callTool({
      name: 'get_project_summary',
      arguments: {},
    })
    expect(summary.isError).not.toBe(true)
  })

  it('never issues mutating HTTP requests', () => {
    expect(collector.requests.every((entry) => entry.startsWith('GET '))).toBe(true)
  })
})

describe('unreachable collector', () => {
  it('returns a clear startup hint instead of crashing', async () => {
    const dead = createServer()
    await new Promise<void>((resolve) => dead.listen(0, '127.0.0.1', resolve))
    const address = dead.address() as AddressInfo
    await new Promise<void>((resolve) => dead.close(() => resolve()))

    const connection = await connect(
      new StackNextApiClient({
        baseUrl: `http://127.0.0.1:${address.port}`,
        token: TOKEN,
        timeoutMs: 1_000,
      }),
    )
    try {
      const result = await connection.client.callTool({
        name: 'get_project_summary',
        arguments: {},
      })
      expect(result.isError).toBe(true)
      expect(textOf(result)).toContain('Cannot reach the StackNext collector')
      expect(textOf(result)).toContain('stacknext dev')
    } finally {
      await connection.close()
    }
  })
})


it('verifies the MCP surface without an LLM client', async () => {
  const collector = await startMockCollector()
  try {
    const result = await verifyMcpServer({
      baseUrl: collector.url,
      token: TOKEN,
    })
    expect(result.ok).toBe(true)
    expect(result.toolCount).toBe(20)
    expect(result.promptCount).toBe(5)
    expect(result.connection).toBeDefined()
    expect(result.requests).toBeGreaterThan(0)
  } finally {
    await collector.close()
  }
})

it('keeps snapshot completeness independent of unavailable live health', () => {
  const base = { tool: 'snapshot', health: null, found: 1, returned: 1 }
  expect(buildMeta(base).completeness.complete).toBe(false)
  expect(buildMeta({ ...base, snapshot: true }).completeness).toEqual({ complete: true, reasons: [] })
  expect(buildMeta({ ...base, snapshot: true, reasons: ['Missing parent'] }).completeness.reasons).toEqual(['Missing parent'])
  expect(buildMeta({ ...base, snapshot: true, limit: 1, offset: 0, found: 2 }).completeness.complete).toBe(false)
})

it.each([
  { baseUrl: 'not a URL', token: TOKEN, error: 'Collector URL is not a valid URL' },
  { baseUrl: 'https://example.com', token: TOKEN, error: 'StackNext only reads from a loopback collector' },
  { baseUrl: 'http://127.0.0.1:4400', token: 'short', error: 'Collector token is too short' },
])('returns initialization failures through McpCheckResult: $error', async ({ baseUrl, token, error }) => {
  await expect(verifyMcpServer({ baseUrl, token })).resolves.toEqual({ ok: false, error })
})
