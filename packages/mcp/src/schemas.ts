import { z } from 'zod'
import {
  baselineSchema,
  comparisonSchema,
  comparisonSummarySchema,
  environmentSnapshotSchema,
  testRunSchema,
} from '@stacknext/regression'

const attributesSchema = z.record(z.string(), z.unknown())

const connectionInfoSchema = z
  .object({
    instanceId: z.string(),
    serviceName: z.string(),
    projectName: z.string().optional(),
    nextVersion: z.string().optional(),
    sdkVersion: z.string(),
    lastSeen: z.number(),
    connected: z.boolean(),
  })
  .passthrough()

const healthSchema = z
  .object({
    status: z.string(),
    name: z.string(),
    version: z.string(),
    projectName: z.string(),
    connected: z.boolean(),
    connections: z.array(connectionInfoSchema),
    counts: z
      .object({
        requests: z.number(),
        failedRequests: z.number(),
        slowRequests: z.number(),
        spans: z.number(),
        errors: z.number(),
        databaseQueries: z.number(),
      })
      .passthrough(),
    store: z
      .object({
        dropped: z
          .object({
            capacity: z.number(),
            retention: z.number(),
          })
          .passthrough(),
      })
      .passthrough()
      .optional(),
    exporter: z
      .object({
        droppedSpans: z.number(),
        droppedEvents: z.number(),
        lastError: z.string().nullable(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

const requestSummarySchema = z
  .object({
    id: z.string(),
    traceId: z.string(),
    name: z.string(),
    method: z.string().nullable(),
    route: z.string().nullable(),
    statusCode: z.number().nullable(),
    statusClass: z.enum(['2xx', '3xx', '4xx', '5xx', 'none']),
    durationMs: z.number().nullable(),
    timestamp: z.number(),
    endTime: z.number().nullable(),
    spanCount: z.number(),
    errorCount: z.number(),
    databaseQueryCount: z.number(),
    fetchCount: z.number(),
    failed: z.boolean(),
    slow: z.boolean(),
    serviceName: z.string(),
  })
  .passthrough()

const spanSchema = z
  .object({
    traceId: z.string(),
    spanId: z.string(),
    parentSpanId: z.string().optional(),
    name: z.string(),
    kind: z.enum(['internal', 'server', 'client', 'producer', 'consumer']),
    startTime: z.number(),
    endTime: z.number(),
    durationMs: z.number(),
    status: z.enum(['unset', 'ok', 'error']),
    statusMessage: z.string().optional(),
    serviceName: z.string(),
    route: z.string().optional(),
    method: z.string().optional(),
    statusCode: z.number().optional(),
    nextSpanType: z.string().optional(),
    attributes: attributesSchema,
    events: z.array(
      z
        .object({
          name: z.string(),
          time: z.number(),
          attributes: attributesSchema,
        })
        .passthrough(),
    ),
    resource: attributesSchema,
    receivedAt: z.number(),
  })
  .passthrough()

const errorSchema = z
  .object({
    id: z.string(),
    fingerprint: z.string(),
    message: z.string(),
    name: z.string(),
    stack: z.string().optional(),
    digest: z.string().optional(),
    timestamp: z.number(),
    route: z.string().optional(),
    method: z.string().optional(),
    requestPath: z.string().optional(),
    routerKind: z.string().optional(),
    routeType: z.string().optional(),
    renderSource: z.string().optional(),
    traceId: z.string().optional(),
    spanId: z.string().optional(),
    attributes: attributesSchema,
    receivedAt: z.number(),
  })
  .passthrough()

const errorItemSchema = errorSchema
  .extend({
    resolvedTraceId: z.string().nullable(),
  })
  .passthrough()

const errorGroupSchema = z
  .object({
    fingerprint: z.string(),
    name: z.string(),
    message: z.string(),
    route: z.string().nullable(),
    count: z.number(),
    firstSeen: z.number(),
    lastSeen: z.number(),
    latestErrorId: z.string(),
    traceId: z.string().nullable(),
  })
  .passthrough()

const databaseQuerySchema = z
  .object({
    id: z.string(),
    traceId: z.string().optional(),
    spanId: z.string().optional(),
    timestamp: z.number(),
    durationMs: z.number().nullable(),
    sql: z.string(),
    databaseSystem: z.string(),
    operation: z.string().optional(),
    success: z.boolean(),
    errorMessage: z.string().optional(),
    source: z.enum(['drizzle', 'prisma', 'manual']),
    attributes: attributesSchema,
    receivedAt: z.number(),
  })
  .passthrough()

const databaseQueryItemSchema = databaseQuerySchema
  .extend({
    resolvedTraceId: z.string().nullable(),
    route: z.string().nullable(),
  })
  .passthrough()

const traceSummarySchema = z
  .object({
    traceId: z.string(),
    rootName: z.string(),
    rootSpanId: z.string().nullable(),
    serviceName: z.string(),
    startTime: z.number(),
    endTime: z.number(),
    durationMs: z.number(),
    spanCount: z.number(),
    errorCount: z.number(),
    databaseQueryCount: z.number(),
    failed: z.boolean(),
    request: requestSummarySchema.nullable(),
  })
  .passthrough()

const diagnosticReferenceSchema = z
  .object({
    id: z.string(),
    ruleId: z.enum([
      'n-plus-one-queries',
      'slow-span',
      'repeated-external-http',
      'error-fingerprint',
    ]),
    category: z.enum(['database', 'http', 'performance', 'errors', 'runtime']),
    severity: z.enum(['info', 'warning', 'error']),
    status: z.enum(['observed', 'possible', 'insufficient-evidence']),
    title: z.string(),
  })
  .passthrough()

const traceDetailSchema = z
  .object({
    traceId: z.string(),
    request: requestSummarySchema.nullable(),
    spans: z.array(spanSchema),
    errors: z.array(errorSchema),
    databaseQueries: z.array(databaseQuerySchema),
    startTime: z.number(),
    endTime: z.number(),
    durationMs: z.number(),
    missingParentSpanIds: z.array(z.string()),
    diagnostics: z.array(diagnosticReferenceSchema).optional(),
  })
  .passthrough()

const summarySchema = z
  .object({
    totalRequests: z.number(),
    failedRequests: z.number(),
    slowRequests: z.number(),
    avgDurationMs: z.number().nullable(),
    p95DurationMs: z.number().nullable(),
    spanCount: z.number(),
    errorCount: z.number(),
    databaseQueryCount: z.number(),
    fetchCount: z.number(),
    slowestRequests: z.array(requestSummarySchema),
    recentErrors: z.array(errorItemSchema),
    firstEventTime: z.number().nullable(),
    lastEventTime: z.number().nullable(),
  })
  .passthrough()

const coverageStatusSchema = z.enum([
  'observed',
  'active',
  'configured',
  'not-observed',
  'unsupported',
  'unknown',
])

const coverageItemSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    category: z.enum(['framework', 'database', 'errors', 'custom', 'runtime']),
    status: coverageStatusSchema,
    configured: z.boolean().nullable(),
    observed: z.boolean(),
    description: z.string(),
    evidence: z.object({
      spanTypes: z.array(z.string()),
      count: z.number(),
      lastSeen: z.number().nullable(),
    }),
    limitations: z.array(z.string()),
  })
  .passthrough()

const coverageReportSchema = z
  .object({
    projectName: z.string(),
    generatedAt: z.number(),
    collectorVersion: z.string(),
    sample: z.object({
      firstEventTime: z.number().nullable(),
      lastEventTime: z.number().nullable(),
      retentionMs: z.number(),
      requests: z.number(),
      spans: z.number(),
      errors: z.number(),
      databaseQueries: z.number(),
      connectedInstances: z.number(),
      connected: z.boolean(),
    }),
    statusCounts: z.object({
      observed: z.number(),
      active: z.number(),
      configured: z.number(),
      'not-observed': z.number(),
      unsupported: z.number(),
      unknown: z.number(),
    }),
    items: z.array(coverageItemSchema),
    notes: z.array(z.string()),
    limitations: z.array(z.string()),
  })
  .passthrough()

const coverageMetaSchema = z.object({
  observed: z.number().int(),
  active: z.number().int(),
  configured: z.number().int(),
  notObserved: z.number().int(),
  unsupported: z.number().int(),
  unknown: z.number().int(),
  requestsInSample: z.number().int(),
})

export const metaSchema = z.object({
  tool: z.string(),
  generatedAt: z.string(),
  project: z.string().nullable(),
  timeRange: z.object({
    firstEventTime: z.string().nullable(),
    lastEventTime: z.string().nullable(),
  }),
  result: z.object({
    found: z.number().int(),
    returned: z.number().int(),
    limit: z.number().int().optional(),
    offset: z.number().int().optional(),
    hasMore: z.boolean().optional(),
    nextOffset: z.number().int().nullable().optional(),
  }),
  connection: z.object({
    instrumentation: z.enum(['connected', 'waiting', 'unknown']),
    instances: z.number().int(),
    lastSeen: z.string().nullable(),
    sdkVersion: z.string().nullable(),
    collectorVersion: z.string().nullable(),
  }),
  completeness: z.object({
    complete: z.boolean(),
    reasons: z.array(z.string()),
  }),
  identifiers: z.record(z.string(), z.string()).optional(),
  coverage: coverageMetaSchema.optional(),
  notes: z.array(z.string()),
})

export type ToolMeta = z.infer<typeof metaSchema>

function pageSchema<T extends z.ZodType>(item: T) {
  return z
    .object({
      items: z.array(item),
      total: z.number(),
      limit: z.number(),
      offset: z.number(),
      meta: metaSchema,
    })
    .passthrough()
}

export const overviewOutputSchema = z
  .object({
    health: healthSchema,
    summary: summarySchema,
    coverage: coverageReportSchema.optional(),
    meta: metaSchema,
  })
  .passthrough()

export const requestsOutputSchema = pageSchema(requestSummarySchema)
export const tracesOutputSchema = pageSchema(traceSummarySchema)
export const databaseOutputSchema = pageSchema(databaseQueryItemSchema)

export const traceDetailOutputSchema = z
  .object({
    traceId: z.string(),
    request: requestSummarySchema.nullable(),
    spans: z.array(spanSchema),
    errors: z.array(errorSchema),
    databaseQueries: z.array(databaseQuerySchema),
    startTime: z.number(),
    endTime: z.number(),
    durationMs: z.number(),
    missingParentSpanIds: z.array(z.string()),
    meta: metaSchema,
  })
  .passthrough()

export const errorsOutputSchema = z
  .object({
    items: z.array(errorItemSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    groups: z.array(errorGroupSchema),
    meta: metaSchema,
  })
  .passthrough()

export const errorDetailOutputSchema = z
  .object({
    error: errorItemSchema,
    trace: traceDetailSchema.nullable(),
    meta: metaSchema,
  })
  .passthrough()

const diagnosticMeasurementSchema = z
  .object({
    label: z.string(),
    value: z.union([z.number(), z.string(), z.boolean(), z.null()]),
    unit: z.string().optional(),
  })
  .passthrough()

const diagnosticSpanEvidenceSchema = z
  .object({
    spanId: z.string(),
    traceId: z.string(),
    name: z.string(),
    durationMs: z.number(),
    category: z.enum(['database', 'http', 'custom', 'framework', 'other']),
    status: z.string(),
    route: z.string().optional(),
    nextSpanType: z.string().optional(),
  })
  .passthrough()

const diagnosticQueryEvidenceSchema = z
  .object({
    id: z.string(),
    traceId: z.string().nullable(),
    spanId: z.string().optional(),
    sqlFingerprint: z.string(),
    sqlPreview: z.string(),
    durationMs: z.number().nullable(),
    databaseSystem: z.string(),
    operation: z.string().optional(),
    success: z.boolean(),
    timestamp: z.number(),
  })
  .passthrough()

const diagnosticErrorEvidenceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    message: z.string(),
    timestamp: z.number(),
    route: z.string().optional(),
    method: z.string().optional(),
    traceId: z.string().nullable(),
    fingerprint: z.string(),
  })
  .passthrough()

const diagnosticEvidenceSchema = z
  .object({
    traceIds: z.array(z.string()),
    spans: z.array(diagnosticSpanEvidenceSchema),
    queries: z.array(diagnosticQueryEvidenceSchema),
    errors: z.array(diagnosticErrorEvidenceSchema),
    measurements: z.array(diagnosticMeasurementSchema),
  })
  .passthrough()

const diagnosticFindingSchema = z
  .object({
    id: z.string(),
    ruleId: z.enum([
      'n-plus-one-queries',
      'slow-span',
      'repeated-external-http',
      'error-fingerprint',
    ]),
    ruleVersion: z.number(),
    category: z.enum(['database', 'http', 'performance', 'errors', 'runtime']),
    severity: z.enum(['info', 'warning', 'error']),
    status: z.enum(['observed', 'possible', 'insufficient-evidence']),
    title: z.string(),
    summary: z.string(),
    detail: z.string(),
    route: z.string().nullable(),
    method: z.string().nullable(),
    traceIds: z.array(z.string()),
    firstSeen: z.number(),
    lastSeen: z.number(),
    fingerprint: z.string(),
    evidence: diagnosticEvidenceSchema,
    verification: z.array(z.string()),
    limitations: z.array(z.string()),
  })
  .passthrough()

const diagnosticSampleSchema = z
  .object({
    firstEventTime: z.number().nullable(),
    lastEventTime: z.number().nullable(),
    retentionMs: z.number(),
    requests: z.number(),
    spans: z.number(),
    errors: z.number(),
    databaseQueries: z.number(),
    connectedInstances: z.number(),
    connected: z.boolean(),
  })
  .passthrough()

const diagnosticCountsSchema = z
  .object({
    total: z.number(),
    bySeverity: z.object({
      info: z.number(),
      warning: z.number(),
      error: z.number(),
    }),
    byCategory: z.object({
      database: z.number(),
      http: z.number(),
      performance: z.number(),
      errors: z.number(),
      runtime: z.number(),
    }),
    byStatus: z.object({
      observed: z.number(),
      possible: z.number(),
      'insufficient-evidence': z.number(),
    }),
  })
  .passthrough()

const diagnosticListResponseSchema = z
  .object({
    items: z.array(diagnosticFindingSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    generatedAt: z.number(),
    engineVersion: z.string(),
    ruleSetVersion: z.number(),
    sample: diagnosticSampleSchema,
    counts: diagnosticCountsSchema,
    notes: z.array(z.string()),
    limitations: z.array(z.string()),
  })
  .passthrough()

const diagnosticTraceContextSchema = z
  .object({
    traceId: z.string(),
    request: requestSummarySchema.nullable(),
    startTime: z.number(),
    endTime: z.number(),
    durationMs: z.number(),
    spanCount: z.number(),
    errorCount: z.number(),
    databaseQueryCount: z.number(),
    spans: z.array(spanSchema),
    errors: z.array(errorSchema),
    databaseQueries: z.array(databaseQuerySchema),
    missingParentSpanIds: z.array(z.string()),
  })
  .passthrough()

const diagnosticDetailResponseSchema = z
  .object({
    finding: diagnosticFindingSchema,
    trace: diagnosticTraceContextSchema.nullable(),
  })
  .passthrough()

export const diagnosticsOutputSchema = z
  .object({
    ...diagnosticListResponseSchema.shape,
    meta: metaSchema,
  })
  .passthrough()

export const diagnosticDetailOutputSchema = z
  .object({
    ...diagnosticDetailResponseSchema.shape,
    meta: metaSchema,
  })
  .passthrough()

const runSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    projectName: z.string(),
    status: z.enum(['running', 'completed', 'failed', 'interrupted', 'incomplete']),
    createdAt: z.number(),
    completedAt: z.number().nullable(),
    durationMs: z.number().nullable(),
    scenarios: z.number(),
    samples: z.number(),
    verifiedSamples: z.number(),
    incompleteSamples: z.number(),
    environment: environmentSnapshotSchema,
  })
  .passthrough()

const baselineSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    projectName: z.string(),
    createdAt: z.number(),
    sourceRunId: z.string(),
    scenarios: z.number(),
    samples: z.number(),
    environment: environmentSnapshotSchema,
  })
  .passthrough()

const comparisonSummaryItemSchema = z
  .object({
    id: z.string(),
    projectName: z.string(),
    baselineId: z.string(),
    candidateId: z.string(),
    createdAt: z.number(),
    status: z.enum(['improved', 'regressed', 'unchanged', 'inconclusive']),
    severity: z.enum(['high', 'medium', 'low', 'none']),
    summary: comparisonSummarySchema,
    environmentCompatible: z.boolean(),
  })
  .passthrough()

export const testRunsOutputSchema = pageSchema(runSummarySchema)
export const testRunOutputSchema = testRunSchema.extend({ meta: metaSchema })
export const baselinesOutputSchema = pageSchema(baselineSummarySchema)
export const baselineOutputSchema = baselineSchema.extend({ meta: metaSchema })
export const comparisonsOutputSchema = pageSchema(comparisonSummaryItemSchema)
export const comparisonOutputSchema = comparisonSchema.extend({ meta: metaSchema })
