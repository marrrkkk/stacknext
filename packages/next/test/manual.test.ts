import { SpanKind, SpanStatusCode } from '@opentelemetry/api'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  NodeTracerProvider,
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withNextScopeSpan, withNextScopeSpanSync } from '../src/manual.js'

const spans: ReadableSpan[] = []
let provider: NodeTracerProvider

beforeAll(() => {
  const exporter: SpanExporter = {
    export(readableSpans, callback) {
      spans.push(...readableSpans)
      callback({ code: 0 })
    },
    shutdown: async () => {},
    forceFlush: async () => {},
  }
  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ 'service.name': 'manual-test' }),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  })
  provider.register()
})

afterAll(async () => {
  await provider.shutdown()
})

describe('withNextScopeSpan', () => {
  it('records nested async spans with attributes and parent links', async () => {
    const result = await withNextScopeSpan(
      'users.list',
      async (outer) => {
        outer.setAttribute('app.layer', 'route')
        const innerResult = await withNextScopeSpan(
          'db.select',
          async (inner) => {
            inner.setAttribute('db.system', 'sqlite')
            return 42
          },
          { kind: SpanKind.CLIENT, attributes: { 'db.operation': 'select' } },
        )
        return innerResult
      },
      { attributes: { 'app.users': 3 } },
    )

    expect(result).toBe(42)
    const outer = spans.find((span) => span.name === 'users.list')
    const inner = spans.find((span) => span.name === 'db.select')
    expect(outer).toBeDefined()
    expect(inner).toBeDefined()
    expect(outer?.attributes['app.layer']).toBe('route')
    expect(outer?.attributes['app.users']).toBe(3)
    expect(inner?.kind).toBe(SpanKind.CLIENT)
    expect(inner?.attributes['db.operation']).toBe('select')
    expect(inner?.parentSpanContext?.spanId).toBe(outer?.spanContext().spanId)
  })

  it('marks failed spans and rethrows', async () => {
    await expect(
      withNextScopeSpan('failing', async () => {
        throw new Error('database unavailable')
      }),
    ).rejects.toThrow('database unavailable')

    const span = spans.find((entry) => entry.name === 'failing')
    expect(span?.status.code).toBe(SpanStatusCode.ERROR)
    expect(span?.events.some((event) => event.name === 'exception')).toBe(true)
  })

  it('supports synchronous work', () => {
    const value = withNextScopeSpanSync(
      'hash.password',
      (span) => {
        span.setAttribute('crypto.algorithm', 'scrypt')
        return 'digest'
      },
      { attributes: { 'app.operation': 'hash' } },
    )
    expect(value).toBe('digest')
    const span = spans.find((entry) => entry.name === 'hash.password')
    expect(span?.attributes['crypto.algorithm']).toBe('scrypt')
  })
})
