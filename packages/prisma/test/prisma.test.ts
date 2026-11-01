import { context, trace } from '@opentelemetry/api'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { NextScopeDatabaseQueryInput } from '@nextscope/core'
import {
  instrumentPrismaClient,
  type PrismaQueryEventLike,
} from '../src/index.js'

class FakePrismaClient {
  readonly listeners: Array<(event: PrismaQueryEventLike) => void> = []

  $on(_event: 'query', callback: (event: PrismaQueryEventLike) => void): void {
    this.listeners.push(callback)
  }

  emit(event: PrismaQueryEventLike): void {
    for (const listener of this.listeners) listener(event)
  }
}

function event(overrides: Partial<PrismaQueryEventLike> = {}): PrismaQueryEventLike {
  return {
    timestamp: new Date('2026-01-02T03:04:05.000Z'),
    query: 'SELECT * FROM "User" WHERE "id" = $1',
    params: '["secret-param"]',
    duration: 12.5,
    target: 'quaint::connector::metrics',
    ...overrides,
  }
}

let provider: NodeTracerProvider

beforeAll(() => {
  provider = new NodeTracerProvider()
  provider.register()
})

afterAll(async () => {
  await provider.shutdown()
})

describe('instrumentPrismaClient', () => {
  it('captures duration and SQL without params', () => {
    const queries: NextScopeDatabaseQueryInput[] = []
    const client = new FakePrismaClient()
    instrumentPrismaClient(client, {
      databaseSystem: 'sqlite',
      transport: { enqueueDatabaseQuery: (query) => queries.push(query) },
    })
    client.emit(event())

    expect(queries).toHaveLength(1)
    const query = queries[0]
    expect(query?.sql).toContain('SELECT * FROM "User"')
    expect(query?.durationMs).toBe(12.5)
    expect(query?.operation).toBe('select')
    expect(query?.databaseSystem).toBe('sqlite')
    expect(query?.timestamp).toBe(new Date('2026-01-02T03:04:05.000Z').getTime())
    expect(query?.attributes['db.prisma.target']).toBe('quaint::connector::metrics')
    expect(query?.attributes['db.duration.measured']).toBe(true)
    expect(JSON.stringify(query)).not.toContain('secret-param')
  })

  it('is idempotent for the same client', () => {
    const queries: NextScopeDatabaseQueryInput[] = []
    const client = new FakePrismaClient()
    const options = {
      transport: { enqueueDatabaseQuery: (query: NextScopeDatabaseQueryInput) => queries.push(query) },
    }
    instrumentPrismaClient(client, options)
    instrumentPrismaClient(client, options)
    client.emit(event())
    expect(queries).toHaveLength(1)
  })

  it('correlates queries with the active trace', () => {
    const queries: NextScopeDatabaseQueryInput[] = []
    const client = new FakePrismaClient()
    instrumentPrismaClient(client, {
      transport: { enqueueDatabaseQuery: (query) => queries.push(query) },
    })
    const span = trace.getTracer('test').startSpan('GET /api/users')
    context.with(trace.setSpan(context.active(), span), () => {
      client.emit(event())
    })
    span.end()

    expect(queries[0]?.traceId).toBe(span.spanContext().traceId)
    expect(queries[0]?.spanId).toBe(span.spanContext().spanId)
  })

  it('stops recording after cleanup', () => {
    const queries: NextScopeDatabaseQueryInput[] = []
    const client = new FakePrismaClient()
    const cleanup = instrumentPrismaClient(client, {
      transport: { enqueueDatabaseQuery: (query) => queries.push(query) },
    })
    cleanup()
    client.emit(event())
    expect(queries).toHaveLength(0)
  })
})
