import { randomUUID } from 'node:crypto'
import { isSpanContextValid, trace } from '@opentelemetry/api'
import { redactSql, type StackNextDatabaseQueryInput } from '@stacknext/core'
import {
  getStackNextTransport,
  type StackNextTransport,
} from '@stacknext/core/transport'

/** Structural subset of Prisma's `$on('query')` event. */
export interface PrismaQueryEventLike {
  timestamp: Date
  query: string
  /** Prisma passes bind parameters as a JSON string. They are never read. */
  params: string
  duration: number
  target: string
}

/** Structural subset of PrismaClient needed for instrumentation. */
export interface PrismaClientLike {
  $on(event: 'query', callback: (event: PrismaQueryEventLike) => void): void
}

export interface StackNextPrismaOptions {
  /** Database engine reported to StackNext, for example "postgresql". */
  databaseSystem?: string
  /** Override the process-wide transport (mostly for tests). */
  transport?: Pick<StackNextTransport, 'enqueueDatabaseQuery'>
  onError?: (error: unknown) => void
}

const instrumented = new WeakSet<object>()

const OPERATION_PATTERN =
  /^\s*(select|insert|update|delete|with|begin|commit|rollback)\b/i

function inferOperation(sql: string): string | undefined {
  return OPERATION_PATTERN.exec(sql)?.[1]?.toLowerCase()
}

/**
 * Subscribes to Prisma query events:
 *
 * ```ts
 * const prisma = new PrismaClient()
 * instrumentPrismaClient(prisma, { databaseSystem: 'sqlite' })
 * ```
 *
 * Query text is redacted; bind parameters are never read or transmitted.
 * Returns a cleanup function and is idempotent for the same client instance.
 */
export function instrumentPrismaClient(
  client: PrismaClientLike,
  options: StackNextPrismaOptions = {},
): () => void {
  if (instrumented.has(client)) return () => undefined
  instrumented.add(client)
  const databaseSystem = options.databaseSystem ?? 'prisma'
  let disposed = false

  const listener = (event: PrismaQueryEventLike): void => {
    if (disposed) return
    try {
      const transport = options.transport ?? getStackNextTransport()
      if (!transport) return
      const activeSpan = trace.getActiveSpan()
      const spanContext = activeSpan?.spanContext()
      const operation = inferOperation(event.query)
      const duration =
        typeof event.duration === 'number' && Number.isFinite(event.duration)
          ? Math.max(0, event.duration)
          : null
      const input: StackNextDatabaseQueryInput = {
        id: randomUUID(),
        ...(spanContext && isSpanContextValid(spanContext)
          ? { traceId: spanContext.traceId, spanId: spanContext.spanId }
          : {}),
        timestamp:
          event.timestamp instanceof Date && Number.isFinite(event.timestamp.getTime())
            ? event.timestamp.getTime()
            : Date.now(),
        durationMs: duration,
        sql: redactSql(event.query).slice(0, 20_000),
        databaseSystem,
        ...(operation ? { operation } : {}),
        success: true,
        source: 'prisma',
        attributes: {
          'db.system.name': databaseSystem,
          'db.duration.measured': duration !== null,
          ...(event.target ? { 'db.prisma.target': event.target.slice(0, 200) } : {}),
        },
      }
      transport.enqueueDatabaseQuery(input)
    } catch (error) {
      options.onError?.(error)
    }
  }

  client.$on('query', listener)
  return () => {
    disposed = true
    instrumented.delete(client)
  }
}
