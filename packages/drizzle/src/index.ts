import { randomUUID } from 'node:crypto'
import { isSpanContextValid, trace } from '@opentelemetry/api'
import {
  redactSql,
  type NextScopeDatabaseQueryInput,
} from '@nextscope/core'
import {
  getNextScopeTransport,
  type NextScopeTransport,
} from '@nextscope/core/transport'

/** Structural subset of Drizzle's `Logger` interface. */
export interface DrizzleLoggerLike {
  logQuery(query: string, params: unknown[]): void
}

export interface NextScopeDrizzleLoggerOptions {
  /** Database engine reported to NextScope, for example "sqlite". */
  databaseSystem?: string
  /** Override the process-wide transport (mostly for tests). */
  transport?: Pick<NextScopeTransport, 'enqueueDatabaseQuery'>
  /** Called when the telemetry sink throws; instrumentation never breaks queries. */
  onError?: (error: unknown) => void
}

const OPERATION_PATTERN =
  /^\s*(select|insert|update|delete|with|create|alter|drop|pragma|begin|commit|rollback)\b/i

function inferOperation(sql: string): string | undefined {
  return OPERATION_PATTERN.exec(sql)?.[1]?.toLowerCase()
}

/**
 * Captures Drizzle queries through the `logger` option:
 *
 * ```ts
 * const db = drizzle(client, {
 *   logger: createNextScopeDrizzleLogger({ databaseSystem: 'sqlite' }),
 * })
 * ```
 *
 * Drizzle's Logger API does not expose query duration, so durationMs is null.
 * Bind parameters are counted but never read or transmitted.
 */
export function createNextScopeDrizzleLogger(
  options: NextScopeDrizzleLoggerOptions = {},
): DrizzleLoggerLike {
  const databaseSystem = options.databaseSystem ?? 'sql'
  return {
    logQuery(query: string, params: unknown[]): void {
      try {
        const transport =
          options.transport ?? getNextScopeTransport()
        if (!transport) return
        const activeSpan = trace.getActiveSpan()
        const spanContext = activeSpan?.spanContext()
        const operation = inferOperation(query)
        const input: NextScopeDatabaseQueryInput = {
          id: randomUUID(),
          ...(spanContext && isSpanContextValid(spanContext)
            ? { traceId: spanContext.traceId, spanId: spanContext.spanId }
            : {}),
          timestamp: Date.now(),
          durationMs: null,
          sql: redactSql(query).slice(0, 20_000),
          databaseSystem,
          ...(operation ? { operation } : {}),
          success: true,
          source: 'drizzle',
          attributes: {
            'db.system.name': databaseSystem,
            'db.query.parameter_count': Array.isArray(params) ? params.length : 0,
            'db.duration.measured': false,
          },
        }
        transport.enqueueDatabaseQuery(input)
      } catch (error) {
        options.onError?.(error)
      }
    },
  }
}
