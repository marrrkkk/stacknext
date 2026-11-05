import { z } from 'zod'
import { DIAGNOSTIC_RULE_IDS } from '@stacknext/core'
import {
  CORRELATION_STATUSES,
  STACKNEXT_BASELINE_FORMAT,
  STACKNEXT_COMPARISON_FORMAT,
  STACKNEXT_REGRESSION_FORMAT_VERSION,
  STACKNEXT_RUN_FORMAT,
  REGRESSION_METRIC_KINDS,
  REGRESSION_SEVERITIES,
  REGRESSION_STATUSES,
  RUN_STATUSES,
  SAMPLE_EXPECTED_STATUSES,
  SAMPLE_STATUSES,
  SCENARIO_ID_PATTERN,
  SAMPLE_ID_PATTERN,
} from './constants.js'

const runIdSchema = z.string().regex(/^run-[0-9a-f]{16}$/, 'invalid run id')
const baselineIdSchema = z.string().regex(/^base-[0-9a-f]{16}$/, 'invalid baseline id')
const comparisonIdSchema = z.string().regex(/^cmp-[0-9a-f]{16}$/, 'invalid comparison id')
const scenarioIdSchema = z.string().regex(SCENARIO_ID_PATTERN, 'invalid scenario id')
const sampleIdSchema = z.string().regex(SAMPLE_ID_PATTERN, 'invalid sample id')
const shortText = (max: number) => z.string().min(1).max(max)
const boundedText = (max: number) => z.string().max(max)

export const databaseNameSchema = z.string().min(1).max(80)
export const instrumentationSnapshotSchema = z
  .object({
    verbose: z.boolean(),
    verboseSource: z.string().min(1).max(40),
    captureFetch: z.boolean(),
    captureErrors: z.boolean(),
  })
  .strict()

export const environmentSnapshotSchema = z
  .object({
    nodeVersion: z.string().min(1).max(100),
    nextVersion: z.string().max(100).nullable(),
    platform: z.string().min(1).max(40),
    arch: z.string().min(1).max(40),
    runtime: z.literal('nodejs'),
    databases: z.array(databaseNameSchema).max(10),
    instrumentation: instrumentationSnapshotSchema,
    sdkVersion: z.string().min(1).max(100),
    diagnostics: z
      .object({
        ruleSetVersion: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    playwrightVersion: z.string().max(100).optional(),
  })
  .strict()

export const scenarioIdentitySchema = z
  .object({
    id: scenarioIdSchema,
    source: z.enum(['annotation', 'test-id', 'title']),
    title: shortText(500),
    file: shortText(1_000),
    project: shortText(200),
    tags: z.array(z.string().min(1).max(100)).max(20),
  })
  .strict()

export const capturedSpanSchema = z
  .object({
    key: shortText(2_000),
    name: shortText(300),
    kind: z.enum(['internal', 'server', 'client', 'producer', 'consumer']),
    category: z.enum(['database', 'http', 'custom', 'framework', 'other']),
    durationMs: z.number().finite().nonnegative(),
    status: z.enum(['unset', 'ok', 'error']),
    nextSpanType: z.string().max(200).optional(),
  })
  .strict()

export const capturedQuerySchema = z
  .object({
    key: shortText(2_000),
    shape: boundedText(500),
    durationMs: z.number().finite().nonnegative().nullable(),
    source: z.enum(['drizzle', 'prisma', 'manual']),
    success: z.boolean(),
  })
  .strict()

export const capturedErrorSchema = z
  .object({
    key: shortText(2_000),
    name: shortText(200),
    message: boundedText(600),
    route: z.string().max(500).nullable(),
  })
  .strict()

export const capturedFindingSchema = z
  .object({
    key: shortText(2_000),
    ruleId: z.enum(DIAGNOSTIC_RULE_IDS),
    category: z.enum(['database', 'http', 'performance', 'errors', 'runtime']),
    severity: z.enum(['info', 'warning', 'error']),
    status: z.enum(['observed', 'possible', 'insufficient-evidence']),
  })
  .strict()

export const capturedTraceSchema = z
  .object({
    traceId: z.string().regex(/^[0-9a-f]{32}$/i, 'invalid trace id'),
    injectedSpanId: z.string().regex(/^[0-9a-f]{16}$/i, 'invalid span id'),
    key: shortText(2_000),
    method: z.string().max(32).nullable(),
    route: z.string().max(500).nullable(),
    rootName: shortText(500),
    statusCode: z.number().int().min(100).max(999).nullable(),
    durationMs: z.number().finite().nonnegative(),
    spanCount: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
    databaseQueryCount: z.number().int().nonnegative(),
    fetchCount: z.number().int().nonnegative(),
    spans: z.array(capturedSpanSchema).max(500),
    queries: z.array(capturedQuerySchema).max(200),
    errors: z.array(capturedErrorSchema).max(100),
  })
  .strict()

export const correlationSchema = z
  .object({
    status: z.enum(CORRELATION_STATUSES),
    reasons: z.array(z.string().max(500)).max(20),
    traces: z.array(capturedTraceSchema).max(20),
  })
  .strict()

export const capturedSampleSchema = z
  .object({
    id: sampleIdSchema,
    status: z.enum(SAMPLE_STATUSES),
    expectedStatus: z.enum(SAMPLE_EXPECTED_STATUSES),
    retry: z.number().int().nonnegative().max(20),
    repeatEachIndex: z.number().int().nonnegative().max(1_000),
    durationMs: z.number().finite().nonnegative(),
    capturedAt: z.number().int().nonnegative(),
    correlation: correlationSchema,
    findings: z.array(capturedFindingSchema).max(100),
  })
  .strict()

export const scenarioSchema = z
  .object({
    identity: scenarioIdentitySchema,
    samples: z.array(capturedSampleSchema).max(100),
    findings: z.array(capturedFindingSchema).max(100),
    notes: z.array(z.string().max(500)).max(30),
    limitations: z.array(z.string().max(500)).max(30),
  })
  .strict()

export const regressionStatsSchema = z
  .object({
    scenarios: z.number().int().nonnegative(),
    samples: z.number().int().nonnegative(),
    verifiedSamples: z.number().int().nonnegative(),
    incompleteSamples: z.number().int().nonnegative(),
    traces: z.number().int().nonnegative(),
    requests: z.number().int().nonnegative(),
    spans: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(),
    databaseQueries: z.number().int().nonnegative(),
  })
  .strict()

export const commandSnapshotSchema = z
  .object({
    executable: shortText(200),
    args: z.array(z.string().max(500)).max(200),
    exitCode: z.number().int().nullable(),
    signal: z.string().max(40).nullable(),
    durationMs: z.number().finite().nonnegative(),
  })
  .strict()

export const runCollectorSchema = z
  .object({
    version: z.string().min(1).max(100),
    connected: z.boolean(),
  })
  .strict()

export const testRunSchema = z
  .object({
    format: z.literal(STACKNEXT_RUN_FORMAT),
    version: z.literal(STACKNEXT_REGRESSION_FORMAT_VERSION),
    id: runIdSchema,
    name: shortText(200),
    projectName: shortText(200),
    status: z.enum(RUN_STATUSES),
    createdAt: z.number().int().nonnegative(),
    completedAt: z.number().int().nonnegative().nullable(),
    command: commandSnapshotSchema,
    environment: environmentSnapshotSchema,
    collector: runCollectorSchema,
    scenarios: z.array(scenarioSchema).max(500),
    warnings: z.array(z.string().max(500)).max(50),
    notes: z.array(z.string().max(500)).max(50),
    limitations: z.array(z.string().max(500)).max(50),
    stats: regressionStatsSchema,
  })
  .strict()

export const baselineSchema = z
  .object({
    format: z.literal(STACKNEXT_BASELINE_FORMAT),
    version: z.literal(STACKNEXT_REGRESSION_FORMAT_VERSION),
    id: baselineIdSchema,
    name: shortText(200),
    projectName: shortText(200),
    createdAt: z.number().int().nonnegative(),
    sourceRunId: runIdSchema,
    environment: environmentSnapshotSchema,
    scenarios: z.array(scenarioSchema).max(500),
    warnings: z.array(z.string().max(500)).max(50),
    notes: z.array(z.string().max(500)).max(50),
    limitations: z.array(z.string().max(500)).max(50),
    stats: regressionStatsSchema,
  })
  .strict()

export const comparisonOptionsSchema = z
  .object({
    minSamples: z.number().int().min(1).max(100),
    durationRegressionPct: z.number().finite().nonnegative().max(10_000),
    durationRegressionMs: z.number().finite().nonnegative().max(600_000),
    durationImprovementPct: z.number().finite().nonnegative().max(10_000),
    durationImprovementMs: z.number().finite().nonnegative().max(600_000),
    countRegressionMin: z.number().int().min(1).max(1_000),
    ignoreEnvironment: z.boolean(),
  })
  .strict()

export const environmentDifferenceSchema = z
  .object({
    field: shortText(100),
    baseline: z.string().max(500),
    candidate: z.string().max(500),
  })
  .strict()

export const regressionMetricSchema = z
  .object({
    queryFingerprint: shortText(2_000).optional(),
    key: shortText(2_000),
    label: shortText(500),
    kind: z.enum(REGRESSION_METRIC_KINDS),
    status: z.enum(REGRESSION_STATUSES),
    severity: z.enum(REGRESSION_SEVERITIES),
    baselineValue: z.number().finite().nullable(),
    candidateValue: z.number().finite().nullable(),
    delta: z.number().finite().nullable(),
    percent: z.number().finite().nullable(),
    sampleCount: z.number().int().nonnegative(),
    note: z.string().max(500).optional(),
    unmeasured: z.boolean().optional(),
  })
  .strict()

export const scenarioComparisonSideSchema = z
  .object({
    samples: z.number().int().nonnegative(),
    verifiedSamples: z.number().int().nonnegative(),
    incompleteSamples: z.number().int().nonnegative(),
    traces: z.number().int().nonnegative(),
    findings: z.number().int().nonnegative(),
  })
  .strict()

export const scenarioComparisonSchema = z
  .object({
    scenarioId: scenarioIdSchema,
    title: shortText(500),
    file: shortText(1_000),
    project: shortText(200),
    status: z.enum(REGRESSION_STATUSES),
    severity: z.enum(REGRESSION_SEVERITIES),
    reasons: z.array(z.string().max(500)).max(50),
    metrics: z.array(regressionMetricSchema).max(1_000),
    baseline: scenarioComparisonSideSchema,
    candidate: scenarioComparisonSideSchema,
  })
  .strict()

export const comparisonSummarySchema = z
  .object({
    scenarios: z.number().int().nonnegative(),
    regressed: z.number().int().nonnegative(),
    improved: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    inconclusive: z.number().int().nonnegative(),
  })
  .strict()

export const comparisonSchema = z
  .object({
    format: z.literal(STACKNEXT_COMPARISON_FORMAT),
    version: z.literal(STACKNEXT_REGRESSION_FORMAT_VERSION),
    id: comparisonIdSchema,
    projectName: shortText(200),
    createdAt: z.number().int().nonnegative(),
    baselineId: baselineIdSchema,
    candidateId: runIdSchema,
    status: z.enum(REGRESSION_STATUSES),
    severity: z.enum(REGRESSION_SEVERITIES),
    environment: z
      .object({
        compatible: z.boolean(),
        ignored: z.boolean(),
        differences: z.array(environmentDifferenceSchema).max(50),
      })
      .strict(),
    options: comparisonOptionsSchema,
    summary: comparisonSummarySchema,
    scenarios: z.array(scenarioComparisonSchema).max(500),
    warnings: z.array(z.string().max(500)).max(50),
    limitations: z.array(z.string().max(500)).max(50),
  })
  .strict()

export const traceReferenceSchema = z
  .object({
    traceId: z.string().regex(/^[0-9a-f]{32}$/i, 'invalid trace id'),
    injectedSpanId: z.string().regex(/^[0-9a-f]{16}$/i, 'invalid span id'),
  })
  .strict()

export const sampleSubmissionSchema = z
  .object({
    id: sampleIdSchema,
    status: z.enum(SAMPLE_STATUSES),
    expectedStatus: z.enum(SAMPLE_EXPECTED_STATUSES),
    retry: z.number().int().nonnegative().max(20),
    repeatEachIndex: z.number().int().nonnegative().max(1_000),
    durationMs: z.number().finite().nonnegative(),
    capturedAt: z.number().int().nonnegative(),
    traces: z.array(traceReferenceSchema).max(20),
  })
  .strict()

export const createRunRequestSchema = z
  .object({
    name: z.string().min(1).max(200),
    projectName: z.string().min(1).max(200),
    environment: environmentSnapshotSchema,
    collectorVersion: z.string().min(1).max(100),
    command: commandSnapshotSchema,
  })
  .strict()

export const submitSampleRequestSchema = z
  .object({
    scenario: scenarioIdentitySchema,
    sample: sampleSubmissionSchema,
  })
  .strict()

export const completeRunRequestSchema = z
  .object({
    status: z.enum(['completed', 'failed', 'interrupted', 'incomplete']),
    warnings: z.array(z.string().max(500)).max(50).optional(),
    command: commandSnapshotSchema.optional(),
  })
  .strict()

export type DatabaseName = z.infer<typeof databaseNameSchema>
export type EnvironmentSnapshot = z.infer<typeof environmentSnapshotSchema>
export type ScenarioIdentity = z.infer<typeof scenarioIdentitySchema>
export type CapturedSpan = z.infer<typeof capturedSpanSchema>
export type CapturedQuery = z.infer<typeof capturedQuerySchema>
export type CapturedError = z.infer<typeof capturedErrorSchema>
export type CapturedFinding = z.infer<typeof capturedFindingSchema>
export type CapturedTrace = z.infer<typeof capturedTraceSchema>
export type CapturedSample = z.infer<typeof capturedSampleSchema>
export type CapturedScenario = z.infer<typeof scenarioSchema>
export type RegressionStats = z.infer<typeof regressionStatsSchema>
export type CommandSnapshot = z.infer<typeof commandSnapshotSchema>
export type TestRun = z.infer<typeof testRunSchema>
export type Baseline = z.infer<typeof baselineSchema>
export type ComparisonOptions = z.infer<typeof comparisonOptionsSchema>
export type EnvironmentDifference = z.infer<typeof environmentDifferenceSchema>
export type RegressionMetric = z.infer<typeof regressionMetricSchema>
export type ScenarioComparison = z.infer<typeof scenarioComparisonSchema>
export type ComparisonSummary = z.infer<typeof comparisonSummarySchema>
export type Comparison = z.infer<typeof comparisonSchema>
export type TraceReference = z.infer<typeof traceReferenceSchema>
export type SampleSubmission = z.infer<typeof sampleSubmissionSchema>
export type CreateRunRequest = z.infer<typeof createRunRequestSchema>
export type SubmitSampleRequest = z.infer<typeof submitSampleRequestSchema>
export type CompleteRunRequest = z.infer<typeof completeRunRequestSchema>

export interface RunSummary {
  id: string
  name: string
  projectName: string
  status: TestRun['status']
  createdAt: number
  completedAt: number | null
  durationMs: number | null
  scenarios: number
  samples: number
  verifiedSamples: number
  incompleteSamples: number
  environment: EnvironmentSnapshot
}

export interface BaselineSummary {
  id: string
  name: string
  projectName: string
  createdAt: number
  sourceRunId: string
  scenarios: number
  samples: number
  environment: EnvironmentSnapshot
}

export interface ComparisonSummaryItem {
  id: string
  projectName: string
  baselineId: string
  candidateId: string
  createdAt: number
  status: Comparison['status']
  severity: Comparison['severity']
  summary: ComparisonSummary
  environmentCompatible: boolean
}
