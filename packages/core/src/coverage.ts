import {
  FETCH_SPAN_TYPES,
  RENDER_SPAN_TYPES,
  REQUEST_ROOT_SPAN_TYPES,
  ROUTE_HANDLER_SPAN_TYPES,
  isStandardNextSpanType,
  type StackNextSpanCategory,
} from './framework.js'
import type {
  ConnectionInfo,
  CoverageCategory,
  CoverageEvidenceSummary,
  CoverageItem,
  CoverageReport,
  CoverageSample,
  CoverageStatus,
  NextOtelVerboseStatus,
  StackNextDatabaseSource,
} from './types.js'
import type { StackNextConfig } from './config.js'
import { COVERAGE_STATUSES } from './types.js'

export interface CoverageSpanTypeEvidence {
  count: number
  lastSeen: number | null
}

export interface CoverageEvidence {
  sample: {
    firstEventTime: number | null
    lastEventTime: number | null
    spanCount: number
    errorCount: number
    databaseQueryCount: number
    requestCount: number
    retentionMs: number
    errorLastSeen: number | null
    queryLastSeen: number | null
  }
  spanTypes: Record<string, CoverageSpanTypeEvidence>
  categoryCounts: Record<StackNextSpanCategory, number>
  requestRootSpans: number
  renderSpans: number
  routeHandlerSpans: number
  fetchSpans: number
  databaseSpans: number
  customSpans: number
  actionSpans: number
  fetchLastSeen: number | null
  customLastSeen: number | null
  actionLastSeen: number | null
  verboseSpanTypes: string[]
  querySources: Record<StackNextDatabaseSource, number>
  querySourceLastSeen: Record<StackNextDatabaseSource, number | null>
}

export interface ComputeCoverageInput {
  projectName: string
  collectorVersion: string
  now: number
  config: StackNextConfig
  connections: ConnectionInfo[]
  verbose: NextOtelVerboseStatus
  evidence: CoverageEvidence
}

function emptyStatusCounts(): Record<CoverageStatus, number> {
  return Object.fromEntries(
    COVERAGE_STATUSES.map((status) => [status, 0]),
  ) as Record<CoverageStatus, number>
}

function spanTypesFor(
  evidence: CoverageEvidence,
  types: Iterable<string>,
): CoverageEvidenceSummary {
  const matched: string[] = []
  let count = 0
  let lastSeen: number | null = null
  for (const type of types) {
    if (!Object.hasOwn(evidence.spanTypes, type)) continue
    const entry = evidence.spanTypes[type]
    if (!entry || entry.count === 0) continue
    matched.push(type)
    count += entry.count
    if (entry.lastSeen !== null) {
      lastSeen = lastSeen === null ? entry.lastSeen : Math.max(lastSeen, entry.lastSeen)
    }
  }
  return { spanTypes: matched.sort(), count, lastSeen }
}

function simpleEvidence(
  count: number,
  lastSeen: number | null,
  spanTypes: string[] = [],
): CoverageEvidenceSummary {
  return { spanTypes, count, lastSeen }
}

export function computeCoverage(input: ComputeCoverageInput): CoverageReport {
  const { evidence, config, connections } = input
  const connected = connections.some((connection) => connection.connected)
  const anySpans = evidence.sample.spanCount > 0
  const anyRequests = evidence.sample.requestCount > 0
  const requestOpportunity = connected && anyRequests
  const items: CoverageItem[] = []

  const add = (
    item: Omit<CoverageItem, 'observed' | 'configured'> & {
      observed: boolean
      configured: boolean | null
    },
  ): void => {
    items.push(item)
  }

  const requestEvidence = spanTypesFor(evidence, REQUEST_ROOT_SPAN_TYPES)
  add({
    id: 'next.request-root',
    label: 'HTTP request root spans',
    category: 'framework',
    status: requestEvidence.count > 0
      ? 'observed'
      : !connected
        ? 'configured'
        : anySpans
          ? 'not-observed'
          : 'active',
    configured: true,
    observed: requestEvidence.count > 0,
    description:
      'Next.js BaseServer.handleRequest spans provide the request route, method, status and duration.',
    evidence: requestEvidence,
    limitations:
      requestEvidence.count === 0 && anySpans
        ? [
            'Spans were received without a documented request-root span. The trace may start below the HTTP layer or the Next.js version may have changed its span types.',
          ]
        : [],
  })

  const renderEvidence = spanTypesFor(evidence, RENDER_SPAN_TYPES)
  add({
    id: 'next.app-render',
    label: 'App Router page renders',
    category: 'framework',
    status: renderEvidence.count > 0
      ? 'observed'
      : !connected
        ? 'configured'
        : requestOpportunity
          ? 'not-observed'
          : 'active',
    configured: true,
    observed: renderEvidence.count > 0,
    description:
      'AppRender render spans show page rendering. Individual Server Components are not traced separately.',
    evidence: renderEvidence,
    limitations:
      renderEvidence.count === 0 && requestOpportunity
        ? ['No page render appeared in this sample. Route-handler or API-only traffic does not exercise rendering.']
        : ['Server Components are not individually traced; only the route render is visible.'],
  })

  const routeEvidence = spanTypesFor(evidence, ROUTE_HANDLER_SPAN_TYPES)
  add({
    id: 'next.route-handlers',
    label: 'Route handlers',
    category: 'framework',
    status: routeEvidence.count > 0
      ? 'observed'
      : !connected
        ? 'configured'
        : requestOpportunity
          ? 'not-observed'
          : 'active',
    configured: true,
    observed: routeEvidence.count > 0,
    description:
      'AppRouteRouteHandlers.runHandler spans identify App Router route-handler execution.',
    evidence: routeEvidence,
    limitations:
      routeEvidence.count === 0 && requestOpportunity
        ? ['No route-handler span appeared in this sample. Page-only traffic does not exercise this feature.']
        : [],
  })

  const middlewareEvidence = spanTypesFor(evidence, ['Middleware.execute'])
  add({
    id: 'next.middleware',
    label: 'Middleware',
    category: 'framework',
    status: middlewareEvidence.count > 0
      ? 'observed'
      : !connected
        ? 'configured'
        : requestOpportunity
          ? 'not-observed'
          : 'active',
    configured: true,
    observed: middlewareEvidence.count > 0,
    description: 'Middleware.execute spans appear when Next.js middleware handles a request.',
    evidence: middlewareEvidence,
    limitations:
      middlewareEvidence.count === 0 && requestOpportunity
        ? ['No middleware span appeared. The project may not define middleware, or the request bypassed it.']
        : [],
  })

  const fetchEnabled = config.instrumentation.captureFetch
  const fetchTypes = Object.keys(evidence.spanTypes)
    .filter((type) => FETCH_SPAN_TYPES.has(type))
    .sort()
  const fetchEvidence = simpleEvidence(
    evidence.fetchSpans,
    evidence.fetchLastSeen,
    fetchTypes,
  )
  add({
    id: 'next.fetch',
    label: 'Fetch calls',
    category: 'framework',
    status: fetchEvidence.count > 0
      ? 'observed'
      : !fetchEnabled
        ? 'not-observed'
        : !connected
          ? 'configured'
          : requestOpportunity
            ? 'not-observed'
            : 'active',
    configured: fetchEnabled,
    observed: fetchEvidence.count > 0,
    description:
      'Next.js AppRender.fetch spans and client fetch spans are captured when captureFetch is enabled.',
    evidence: fetchEvidence,
    limitations: !fetchEnabled
      ? ['instrumentation.captureFetch is false, so StackNext drops AppRender.fetch spans.']
      : fetchEvidence.count === 0 && requestOpportunity
        ? ['No fetch span appeared in this sample. The request may not have performed a fetch.']
        : [],
  })

  const errorsEnabled = config.instrumentation.captureErrors
  const errorEvidence = simpleEvidence(
    evidence.sample.errorCount,
    evidence.sample.errorLastSeen,
  )
  add({
    id: 'next.request-errors',
    label: 'Request error hook',
    category: 'errors',
    status: errorEvidence.count > 0
      ? 'observed'
      : !errorsEnabled
        ? 'not-observed'
        : !connected
          ? 'configured'
          : requestOpportunity
            ? 'not-observed'
            : 'active',
    configured: errorsEnabled,
    observed: errorEvidence.count > 0,
    description:
      'Next.js onRequestError reports server errors and correlates them to the active trace when available.',
    evidence: errorEvidence,
    limitations: !errorsEnabled
      ? ['instrumentation.captureErrors is false, so the error hook is a no-op.']
      : [
          'Hook registration cannot be proven from telemetry alone. A healthy sample can legitimately contain zero errors.',
          'Successful Server Actions do not call onRequestError; wrap them with withStackNextAction for visibility.',
        ],
  })

  const drizzleConfigured = config.database.drizzle
  const drizzleCount = evidence.querySources.drizzle
  add({
    id: 'database.drizzle',
    label: 'Drizzle queries',
    category: 'database',
    status: drizzleCount > 0
      ? 'observed'
      : !drizzleConfigured
        ? 'unknown'
        : !connected
          ? 'configured'
          : requestOpportunity
            ? 'not-observed'
            : 'active',
    configured: drizzleConfigured,
    observed: drizzleCount > 0,
    description:
      'The Drizzle Logger adapter emits redacted SQL. Drizzle does not expose query duration.',
    evidence: simpleEvidence(drizzleCount, evidence.querySourceLastSeen.drizzle),
    limitations:
      drizzleCount === 0 && !drizzleConfigured
        ? ['database.drizzle is false. Adapter registration cannot be inferred from telemetry.']
        : ['Drizzle query durations are unmeasured (null), never zero.'],
  })

  const prismaConfigured = config.database.prisma
  const prismaCount = evidence.querySources.prisma
  add({
    id: 'database.prisma',
    label: 'Prisma queries',
    category: 'database',
    status: prismaCount > 0
      ? 'observed'
      : !prismaConfigured
        ? 'unknown'
        : !connected
          ? 'configured'
          : requestOpportunity
            ? 'not-observed'
            : 'active',
    configured: prismaConfigured,
    observed: prismaCount > 0,
    description:
      'The Prisma query event adapter emits redacted SQL and Prisma-reported durations.',
    evidence: simpleEvidence(prismaCount, evidence.querySourceLastSeen.prisma),
    limitations:
      prismaCount === 0 && !prismaConfigured
        ? [
            'database.prisma is false. Prisma needs event-based query logging and instrumentPrismaClient().',
          ]
        : [],
  })

  const actionEvidence = simpleEvidence(
    evidence.actionSpans,
    evidence.actionLastSeen,
  )
  add({
    id: 'custom.server-actions',
    label: 'Server Actions',
    category: 'custom',
    status: actionEvidence.count > 0
      ? 'observed'
      : !connected
        ? 'unknown'
        : requestOpportunity
          ? 'not-observed'
          : 'active',
    configured: null,
    observed: actionEvidence.count > 0,
    description:
      'withStackNextAction creates a named span for both successful and failing Server Actions.',
    evidence: actionEvidence,
    limitations: [
      'Successful Server Actions are only visible when wrapped with withStackNextAction(). onRequestError captures failures only.',
      'Automatic Server Action naming is not supported.',
    ],
  })

  const customEvidence = simpleEvidence(
    evidence.customSpans,
    evidence.customLastSeen,
  )
  add({
    id: 'custom.spans',
    label: 'Custom application spans',
    category: 'custom',
    status: customEvidence.count > 0 ? 'observed' : 'unknown',
    configured: null,
    observed: customEvidence.count > 0,
    description:
      'withStackNextSpan and withStackNextSpanSync add application work to the same request trace.',
    evidence: customEvidence,
    limitations:
      customEvidence.count === 0
        ? ['No custom spans appeared. The optional helpers may not be used in this sample.']
        : [],
  })

  const verboseEvidence =
    evidence.verboseSpanTypes.length > 0
      ? spanTypesFor(evidence, evidence.verboseSpanTypes)
      : simpleEvidence(0, null)
  add({
    id: 'next.verbose-spans',
    label: 'Verbose Next.js spans',
    category: 'runtime',
    status: verboseEvidence.count > 0
      ? 'observed'
      : !input.verbose.enabled
        ? 'not-observed'
        : !connected
          ? 'configured'
          : requestOpportunity
            ? 'not-observed'
            : 'active',
    configured: input.verbose.enabled,
    observed: verboseEvidence.count > 0,
    description:
      'NEXT_OTEL_VERBOSE=1 exposes additional documented Next.js span types beyond the default allowlist.',
    evidence: verboseEvidence,
    limitations: !input.verbose.enabled
      ? [
          `Verbose tracing is disabled (${input.verbose.source}). Enable instrumentation.verbose or set NEXT_OTEL_VERBOSE=1.`,
        ]
      : [
          'Verbose tracing increases span volume and can add measurable dev-server overhead. Use it for targeted investigations.',
        ],
  })

  add({
    id: 'unsupported.server-components',
    label: 'Individual Server Components',
    category: 'runtime',
    status: 'unsupported',
    configured: false,
    observed: false,
    description:
      'Next.js does not expose a supported per-Server-Component telemetry hook. StackNext does not patch internals.',
    evidence: simpleEvidence(0, null),
    limitations: ['Use withStackNextSpan inside a component when a specific component must be measured.'],
  })

  add({
    id: 'unsupported.edge-runtime',
    label: 'Edge runtime',
    category: 'runtime',
    status: 'unsupported',
    configured: false,
    observed: false,
    description:
      'StackNext instrumentation and collectors are Node.js-only. Edge runtime and Edge middleware are out of scope.',
    evidence: simpleEvidence(0, null),
    limitations: ['StackNext does not claim Edge support for Next.js 15 or 16.'],
  })

  add({
    id: 'unsupported.automatic-actions',
    label: 'Automatic Server Action tracing',
    category: 'runtime',
    status: 'unsupported',
    configured: false,
    observed: false,
    description:
      'StackNext does not automatically identify or name every Server Action. Use withStackNextAction for explicit spans.',
    evidence: simpleEvidence(0, null),
    limitations: ['Failures may still appear through onRequestError.'],
  })

  const statusCounts = emptyStatusCounts()
  for (const item of items) statusCounts[item.status] += 1

  const sample: CoverageSample = {
    firstEventTime: evidence.sample.firstEventTime,
    lastEventTime: evidence.sample.lastEventTime,
    retentionMs: evidence.sample.retentionMs,
    requests: evidence.sample.requestCount,
    spans: evidence.sample.spanCount,
    errors: evidence.sample.errorCount,
    databaseQueries: evidence.sample.databaseQueryCount,
    connectedInstances: connections.filter((connection) => connection.connected).length,
    connected,
  }

  const notes: string[] = []
  if (!connected) {
    notes.push(
      'No app is currently connected. Configured items describe setup, not observed runtime behavior.',
    )
  } else if (!anyRequests) {
    notes.push('The app is connected but no requests are in the current sample window.')
  }
  const notObserved = items.filter((item) => item.status === 'not-observed')
  if (notObserved.length > 0) {
    notes.push(
      `${notObserved.length} item(s) were not observed in this sample: ${notObserved
        .map((item) => item.label)
        .join(', ')}. Absence is not proof that the feature is broken.`,
    )
  }

  return {
    projectName: input.projectName,
    generatedAt: input.now,
    collectorVersion: input.collectorVersion,
    sample,
    statusCounts,
    items,
    notes,
    limitations: [
      'Coverage is inferred from spans and events in the current in-memory retention window. It is not a historical audit.',
      'No percentage or composite score is calculated: these features are independent and workload-dependent.',
      'A not-observed item may simply mean the sample did not exercise it. Read the item limitations before changing code.',
      'StackNext only reports documented Next.js telemetry. It does not patch internals or claim Edge/Server Component coverage.',
    ],
  }
}

export function emptyCoverageEvidence(retentionMs = 600_000): CoverageEvidence {
  return {
    sample: {
      firstEventTime: null,
      lastEventTime: null,
      spanCount: 0,
      errorCount: 0,
      databaseQueryCount: 0,
      requestCount: 0,
      retentionMs,
      errorLastSeen: null,
      queryLastSeen: null,
    },
    spanTypes: {},
    categoryCounts: { framework: 0, app: 0, database: 0, fetch: 0 },
    requestRootSpans: 0,
    renderSpans: 0,
    routeHandlerSpans: 0,
    fetchSpans: 0,
    databaseSpans: 0,
    customSpans: 0,
    actionSpans: 0,
    fetchLastSeen: null,
    customLastSeen: null,
    actionLastSeen: null,
    verboseSpanTypes: [],
    querySources: { drizzle: 0, prisma: 0, manual: 0 },
    querySourceLastSeen: { drizzle: null, prisma: null, manual: null },
  }
}

export function coverageCategoryLabel(category: CoverageCategory): string {
  switch (category) {
    case 'framework':
      return 'Next.js framework'
    case 'database':
      return 'Database adapter'
    case 'errors':
      return 'Errors'
    case 'custom':
      return 'Custom instrumentation'
    case 'runtime':
      return 'Runtime boundary'
  }
}

export function isVerboseOnlySpanType(value: string | undefined): boolean {
  return value !== undefined && value !== '' && !isStandardNextSpanType(value)
}
