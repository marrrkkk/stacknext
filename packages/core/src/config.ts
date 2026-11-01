import { z } from 'zod'

const portSchema = z.number().int().min(1024).max(65535)

export const nextScopeConfigSchema = z
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
    slowRequestMs: z.number().int().min(1).max(600_000).default(500),
  })
  .strict()

export type NextScopeConfig = z.infer<typeof nextScopeConfigSchema>
export type NextScopeConfigInput = z.input<typeof nextScopeConfigSchema>

export class NextScopeConfigError extends Error {
  readonly issues: string[]

  constructor(message: string, issues: string[] = []) {
    super(
      issues.length > 0
        ? `${message}:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`
        : message,
    )
    this.name = 'NextScopeConfigError'
    this.issues = issues
  }
}

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
    return `${path}: ${issue.message}`
  })
}

export function parseNextScopeConfig(input: unknown): NextScopeConfig {
  const result = nextScopeConfigSchema.safeParse(input)
  if (!result.success) {
    throw new NextScopeConfigError(
      'Invalid NextScope configuration',
      formatIssues(result.error),
    )
  }
  const config = result.data
  if (config.privacy.captureRequestBodies) {
    throw new NextScopeConfigError(
      'Invalid NextScope configuration',
      ['privacy.captureRequestBodies: request bodies are not captured by NextScope 0.1'],
    )
  }
  if (config.privacy.captureSqlParameters) {
    throw new NextScopeConfigError(
      'Invalid NextScope configuration',
      ['privacy.captureSqlParameters: SQL parameters are not captured by NextScope 0.1'],
    )
  }
  if (config.privacy.captureHeaders) {
    throw new NextScopeConfigError(
      'Invalid NextScope configuration',
      ['privacy.captureHeaders: request headers are not captured by NextScope 0.1'],
    )
  }
  return config
}

export const DEFAULT_CONFIG: NextScopeConfig = parseNextScopeConfig({})
