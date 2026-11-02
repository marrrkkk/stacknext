import { z } from 'zod'
import {
  DATABASE_SOURCES,
  SPAN_KINDS,
  SPAN_STATUSES,
} from './types.js'

const idSchema = (length: number) =>
  z
    .string()
    .regex(new RegExp(`^[0-9a-f]{${length}}$`, 'i'), `must be ${length} hexadecimal characters`)

export const traceIdSchema = idSchema(32)
export const spanIdSchema = idSchema(16)

const MAX_TIMESTAMP = 8_640_000_000_000_000
const MAX_DURATION_MS = 86_400_000

const timestampSchema = z.number().finite().nonnegative().max(MAX_TIMESTAMP)
const durationSchema = z.number().finite().nonnegative().max(MAX_DURATION_MS)
const longTextSchema = (max: number) => z.string().max(max)
const jsonRecordSchema = z.record(z.string(), z.unknown())

export const spanEventSchema = z
  .object({
    name: z.string().min(1).max(512),
    time: timestampSchema,
    attributes: jsonRecordSchema,
  })
  .strict()

export const ingestSpanSchema = z
  .object({
    traceId: traceIdSchema,
    spanId: spanIdSchema,
    parentSpanId: spanIdSchema.optional(),
    name: z.string().min(1).max(512),
    kind: z.enum(SPAN_KINDS),
    startTime: timestampSchema,
    endTime: timestampSchema,
    durationMs: durationSchema,
    status: z.enum(SPAN_STATUSES),
    statusMessage: longTextSchema(8_000).optional(),
    serviceName: z.string().min(1).max(200),
    route: z.string().max(2_000).optional(),
    method: z.string().max(32).optional(),
    statusCode: z.number().int().min(100).max(999).optional(),
    nextSpanType: z.string().max(200).optional(),
    nextSpanName: z.string().max(512).optional(),
    nextRoute: z.string().max(2_000).optional(),
    nextPage: z.string().max(2_000).optional(),
    nextSegment: z.string().max(2_000).optional(),
    nextRsc: z.boolean().optional(),
    attributes: jsonRecordSchema,
    events: z.array(spanEventSchema).max(100),
    resource: jsonRecordSchema,
  })
  .strict()

export const ingestErrorSchema = z
  .object({
    id: z.string().min(1).max(128),
    message: z.string().min(1).max(16_000),
    name: z.string().min(1).max(200),
    stack: longTextSchema(64_000).optional(),
    digest: longTextSchema(1_000).optional(),
    timestamp: timestampSchema,
    route: z.string().max(2_000).optional(),
    method: z.string().max(32).optional(),
    requestPath: z.string().max(2_000).optional(),
    routerKind: z.string().max(100).optional(),
    routeType: z.string().max(100).optional(),
    renderSource: z.string().max(100).optional(),
    traceId: traceIdSchema.optional(),
    spanId: spanIdSchema.optional(),
    attributes: jsonRecordSchema,
  })
  .strict()

export const ingestDatabaseQuerySchema = z
  .object({
    id: z.string().min(1).max(128),
    traceId: traceIdSchema.optional(),
    spanId: spanIdSchema.optional(),
    timestamp: timestampSchema,
    durationMs: durationSchema.nullable(),
    sql: z.string().min(1).max(20_000),
    databaseSystem: z.string().min(1).max(100),
    operation: z.string().max(200).optional(),
    success: z.boolean(),
    errorMessage: longTextSchema(8_000).optional(),
    source: z.enum(DATABASE_SOURCES),
    attributes: jsonRecordSchema,
  })
  .strict()

export const exporterDiagnosticsSchema = z
  .object({
    instanceId: z.string().min(1).max(200),
    exportedSpans: z.number().int().nonnegative(),
    droppedSpans: z.number().int().nonnegative(),
    exportedEvents: z.number().int().nonnegative(),
    droppedEvents: z.number().int().nonnegative(),
    lastError: z.string().max(2_000).optional(),
    queueDepth: z.number().int().nonnegative(),
    timestamp: timestampSchema,
  })
  .strict()

export const instanceSchema = z
  .object({
    instanceId: z.string().min(1).max(200),
    serviceName: z.string().min(1).max(200),
    projectName: z.string().max(200).optional(),
    nextVersion: z.string().max(100).optional(),
    runtimeVersion: z.string().max(100).optional(),
    sdkVersion: z.string().min(1).max(100),
    runtime: z.literal('nodejs'),
  })
  .strict()

export const ingestEnvelopeSchema = z
  .object({
    version: z.literal(1),
    instance: instanceSchema,
    spans: z.array(ingestSpanSchema).max(500),
    errors: z.array(ingestErrorSchema).max(25),
    databaseQueries: z.array(ingestDatabaseQuerySchema).max(100),
    diagnostics: exporterDiagnosticsSchema.optional(),
  })
  .strict()

export type ParsedIngestEnvelope = z.infer<typeof ingestEnvelopeSchema>
