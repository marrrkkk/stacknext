import { z } from 'zod'

const portSchema = z.number().int().min(1024).max(65535)

export const stackNextConfigSchema = z
  .object({
    projectName: z.string().min(1).max(200).optional(),
    dashboard: z
      .object({
        port: portSchema.default(4400),
      })
      .strict()
      .default({ port: 4400 }),
    collector: z
      .object({
        maxSpans: z.number().int().min(100).max(100_000).default(5_000),
        retentionMs: z.number().int().min(30_000).max(86_400_000).default(600_000),
      })
      .strict()
      .default({ maxSpans: 5_000, retentionMs: 600_000 }),
    instrumentation: z
      .object({
        verbose: z.boolean().default(false),
        captureFetch: z.boolean().default(true),
        captureErrors: z.boolean().default(true),
      })
      .strict()
      .default({ verbose: false, captureFetch: true, captureErrors: true }),
    privacy: z
      .object({
        captureHeaders: z.boolean().default(false),
        captureRequestBodies: z.boolean().default(false),
        captureSqlParameters: z.boolean().default(false),
        redactSensitiveData: z.literal(true).default(true),
      })
      .strict()
      .default({
        captureHeaders: false,
        captureRequestBodies: false,
        captureSqlParameters: false,
        redactSensitiveData: true,
      }),
    database: z
      .object({
        drizzle: z.boolean().default(false),
        prisma: z.boolean().default(false),
      })
      .strict()
      .default({ drizzle: false, prisma: false }),
    diagnostics: z
      .object({
        enabled: z.boolean().default(true),
        repeatedQueryMin: z.number().int().min(2).max(100).default(5),
        slowSpans: z
          .object({
            databaseMs: z.number().int().min(1).max(600_000).default(250),
            httpMs: z.number().int().min(1).max(600_000).default(500),
            customMs: z.number().int().min(1).max(600_000).default(300),
            otherMs: z.number().int().min(1).max(600_000).default(500),
          })
          .strict()
          .default({
            databaseMs: 250,
            httpMs: 500,
            customMs: 300,
            otherMs: 500,
          }),
        repeatedHttpMin: z.number().int().min(2).max(100).default(3),
        errorGrouping: z.boolean().default(true),
        errorGroupMin: z.number().int().min(2).max(100).default(2),
        maxFindings: z.number().int().min(10).max(1_000).default(100),
      })
      .strict()
      .default({
        enabled: true,
        repeatedQueryMin: 5,
        slowSpans: {
          databaseMs: 250,
          httpMs: 500,
          customMs: 300,
          otherMs: 500,
        },
        repeatedHttpMin: 3,
        errorGrouping: true,
        errorGroupMin: 2,
        maxFindings: 100,
      }),
    slowRequestMs: z.number().int().min(1).max(600_000).default(500),
  })
  .strict()

export type StackNextConfig = z.infer<typeof stackNextConfigSchema>
export type StackNextConfigInput = z.input<typeof stackNextConfigSchema>

export class StackNextConfigError extends Error {
  readonly issues: string[]

  constructor(message: string, issues: string[] = []) {
    super(
      issues.length > 0
        ? `${message}:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`
        : message,
    )
    this.name = 'StackNextConfigError'
    this.issues = issues
  }
}

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
    return `${path}: ${issue.message}`
  })
}

export function parseStackNextConfig(input: unknown): StackNextConfig {
  const result = stackNextConfigSchema.safeParse(input)
  if (!result.success) {
    throw new StackNextConfigError(
      'Invalid StackNext configuration',
      formatIssues(result.error),
    )
  }
  const config = result.data
  if (config.privacy.captureRequestBodies) {
    throw new StackNextConfigError(
      'Invalid StackNext configuration',
      ['privacy.captureRequestBodies: request bodies are not captured by StackNext'],
    )
  }
  if (config.privacy.captureSqlParameters) {
    throw new StackNextConfigError(
      'Invalid StackNext configuration',
      ['privacy.captureSqlParameters: SQL parameters are not captured by StackNext'],
    )
  }
  if (config.privacy.captureHeaders) {
    throw new StackNextConfigError(
      'Invalid StackNext configuration',
      ['privacy.captureHeaders: request headers are not captured by StackNext'],
    )
  }
  return config
}

export const DEFAULT_CONFIG: StackNextConfig = parseStackNextConfig({})
