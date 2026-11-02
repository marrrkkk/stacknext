import { context, trace } from '@opentelemetry/api'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { StackNextDatabaseQueryInput } from '@stacknext/core'
import { createStackNextDrizzleLogger } from '../src/index.js'

let provider: NodeTracerProvider

beforeAll(() => {
  provider = new NodeTracerProvider()
  provider.register()
})

afterAll(async () => {
  await provider.shutdown()
})

describe('createStackNextDrizzleLogger', () => {
  it('captures SQL, infers the operation and never stores params', () => {
    const queries: StackNextDatabaseQueryInput[] = []
    const logger = createStackNextDrizzleLogger({
      databaseSystem: 'sqlite',
      transport: { enqueueDatabaseQuery: (query) => queries.push(query) },
    })

    logger.logQuery('select * from "users" where "id" = $1', ['super-secret-id'])

    expect(queries).toHaveLength(1)
    const query = queries[0]
    expect(query?.sql).toBe('select * from "users" where "id" = $1')
    expect(query?.databaseSystem).toBe('sqlite')
    expect(query?.operation).toBe('select')
    expect(query?.durationMs).toBeNull()
    expect(query?.success).toBe(true)
    expect(query?.source).toBe('drizzle')
    expect(query?.attributes['db.query.parameter_count']).toBe(1)
    expect(JSON.stringify(query)).not.toContain('super-secret-id')
  })

  it('correlates queries with the active trace', () => {
    const queries: StackNextDatabaseQueryInput[] = []
    const logger = createStackNextDrizzleLogger({
      transport: { enqueueDatabaseQuery: (query) => queries.push(query) },
    })
    const span = trace.getTracer('test').startSpan('GET /users')
    context.with(trace.setSpan(context.active(), span), () => {
      logger.logQuery('update users set name = $1 where id = $2', ['Ada', 1])
    })
    span.end()

    expect(queries[0]?.traceId).toBe(span.spanContext().traceId)
    expect(queries[0]?.spanId).toBe(span.spanContext().spanId)
    expect(queries[0]?.operation).toBe('update')
  })

  it('redacts secrets in SQL text', () => {
    const queries: StackNextDatabaseQueryInput[] = []
    const logger = createStackNextDrizzleLogger({
      transport: { enqueueDatabaseQuery: (query) => queries.push(query) },
    })
    logger.logQuery("select * from users where password = 'hunter2'", [])
    expect(queries[0]?.sql).not.toContain('hunter2')
    expect(queries[0]?.sql).toContain('[redacted]')
  })

  it('is inert without a transport and never throws', () => {
    delete process.env.STACKNEXT_COLLECTOR_URL
    delete process.env.STACKNEXT_TOKEN
    const logger = createStackNextDrizzleLogger()
    expect(() => logger.logQuery('select 1', [])).not.toThrow()
  })

  it('swallows sink failures through onError', () => {
    const errors: unknown[] = []
    const logger = createStackNextDrizzleLogger({
      transport: {
        enqueueDatabaseQuery: () => {
          throw new Error('sink failed')
        },
      },
      onError: (error) => errors.push(error),
    })
    expect(() => logger.logQuery('select 1', [])).not.toThrow()
    expect(errors).toHaveLength(1)
  })
})
