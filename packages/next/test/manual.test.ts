import { SpanKind, SpanStatusCode } from '@opentelemetry/api'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  NodeTracerProvider,
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withStackNextAction, withStackNextSpan, withStackNextSpanSync } from '../src/manual.js'

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

describe('withStackNextSpan', () => {
  it('records nested async spans with attributes and parent links', async () => {
    const result = await withStackNextSpan(
      'users.list',
      async (outer) => {
        outer.setAttribute('app.layer', 'route')
        const innerResult = await withStackNextSpan(
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
      withStackNextSpan('failing', async () => {
        throw new Error('database unavailable')
      }),
    ).rejects.toThrow('database unavailable')

    const span = spans.find((entry) => entry.name === 'failing')
    expect(span?.status.code).toBe(SpanStatusCode.ERROR)
    expect(span?.events.some((event) => event.name === 'exception')).toBe(true)
  })

  it('supports synchronous work', () => {
    const value = withStackNextSpanSync(
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

  it('supports options in the second argument and marks custom spans', async () => {
    const value = await withStackNextSpan(
      'inventory.reserve',
      { attributes: { 'app.sku': 'abc', authorization: 'Bearer top-secret' } },
      async () => 'reserved',
    )
    expect(value).toBe('reserved')
    const span = spans.find((entry) => entry.name === 'inventory.reserve')
    expect(span?.attributes['app.sku']).toBe('abc')
    expect(span?.attributes.authorization).toBe('[redacted]')
    expect(span?.attributes['stacknext.manual']).toBe(true)
    expect(span?.attributes['stacknext.span.kind']).toBe('custom')
  })

  it('keeps concurrent traces isolated', async () => {
    await Promise.all(
      Array.from({ length: 8 }, async (_, index) =>
        withStackNextSpan(`outer.${index}`, async () => {
          await new Promise((resolve) => setTimeout(resolve, index % 3))
          await withStackNextSpan(`inner.${index}`, async () => undefined)
        }),
      ),
    )
    for (let index = 0; index < 8; index += 1) {
      const outer = spans.find((span) => span.name === `outer.${index}`)
      const inner = spans.find((span) => span.name === `inner.${index}`)
      expect(inner?.parentSpanContext?.spanId).toBe(outer?.spanContext().spanId)
      expect(inner?.spanContext().traceId).toBe(outer?.spanContext().traceId)
    }
  })
})

describe('withStackNextAction', () => {
  it('returns values and marks the span as a Server Action', async () => {
    const form = new FormData()
    form.set('email', 'user@example.test')
    const result = await withStackNextAction(
      'action/update-profile',
      { attributes: { 'app.action': 'update-profile' } },
      async (span) => {
        const email = form.get('email')
        span.setAttribute('app.form.email', typeof email === 'string' ? email : '')
        return { ok: true }
      },
    )
    expect(result).toEqual({ ok: true })
    const span = spans.find((entry) => entry.name === 'action/update-profile')
    expect(span?.attributes['stacknext.span.kind']).toBe('action')
    expect(span?.attributes['app.action']).toBe('update-profile')
  })

  it('rethrows failures and marks the span as failed', async () => {
    const failure = new Error('action failed')
    await expect(
      withStackNextAction('action/failing', async () => {
        throw failure
      }),
    ).rejects.toBe(failure)
    const span = spans.find((entry) => entry.name === 'action/failing')
    expect(span?.status.code).toBe(SpanStatusCode.ERROR)
  })

  it('preserves redirect and not-found control flow without marking an error', async () => {
    for (const [name, digest] of [
      ['action/redirect', 'NEXT_REDIRECT;replace;/login;307;'],
      ['action/not-found', 'NEXT_NOT_FOUND'],
    ] as const) {
      const controlFlow = Object.assign(new Error(digest), { digest })
      await expect(
        withStackNextAction(name, async () => {
          throw controlFlow
        }),
      ).rejects.toBe(controlFlow)
      const span = spans.find((entry) => entry.name === name)
      expect(span?.status.code).not.toBe(SpanStatusCode.ERROR)
      expect(span?.attributes['stacknext.span.kind']).toBe('action')
    }
  })

  it('keeps concurrent actions isolated and returns each value', async () => {
    const values = await Promise.all(
      Array.from({ length: 4 }, async (_, index) =>
        withStackNextAction(`action/concurrent-${index}`, async () => {
          await new Promise((resolve) => setTimeout(resolve, (4 - index) * 2))
          return `value-${index}`
        }),
      ),
    )
    expect(values).toEqual(['value-0', 'value-1', 'value-2', 'value-3'])
    const actionSpans = spans.filter((span) => span.name.startsWith('action/concurrent-'))
    expect(actionSpans).toHaveLength(4)
    expect(new Set(actionSpans.map((span) => span.spanContext().traceId)).size).toBe(4)
    for (const span of actionSpans) {
      expect(span.attributes['stacknext.span.kind']).toBe('action')
    }
  })
})
