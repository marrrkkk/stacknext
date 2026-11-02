import { describe, expect, it } from 'vitest'
import { SpanKind, SpanStatusCode, type Span } from '@opentelemetry/api'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  BasicTracerProvider,
  type ReadableSpan,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import { StackNextSpanExporter, readableSpanToInput } from '../src/exporter.js'

function captureSpan(build: (span: Span) => void): ReadableSpan {
  const spans: ReadableSpan[] = []
  const processor: SpanProcessor = {
    onStart() {},
    onEnd(span) {
      spans.push(span)
    },
    shutdown: async () => {},
    forceFlush: async () => {},
  }
  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({ 'service.name': 'test-app' }),
    spanProcessors: [processor],
  })
  const tracer = provider.getTracer('test')
  build(tracer.startSpan('GET /users', { kind: SpanKind.SERVER }))
  const span = spans[0]
  if (!span) throw new Error('span was not captured')
  return span
}

describe('readableSpanToInput', () => {
  it('maps a real OTel span and redacts URLs and credentials', () => {
    const readable = captureSpan((span) => {
      span.setAttribute('next.span_type', 'BaseServer.handleRequest')
      span.setAttribute('next.span_name', 'GET /users?token=abc123#private')
      span.setAttribute('next.route', '/users?token=abc123')
      span.setAttribute('next.page', '/users/page.tsx')
      span.setAttribute('next.segment', '/users')
      span.setAttribute('next.rsc', true)
      span.setAttribute('http.method', 'GET')
      span.setAttribute('http.target', '/users?token=abc123#private')
      span.setAttribute('http.url', 'http://localhost:3000/users?token=abc123')
      span.setAttribute('db.password', 'hunter2')
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Bearer abcdefghijklmnop' })
      span.end()
    })

    const input = readableSpanToInput(readable, {
      collectorUrl: 'http://127.0.0.1:4400',
      fallbackServiceName: 'fallback',
    })

    expect(input).not.toBeNull()
    expect(input?.name).toBe('GET /users')
    expect(input?.kind).toBe('server')
    expect(input?.status).toBe('error')
    expect(input?.serviceName).toBe('test-app')
    expect(input?.nextSpanType).toBe('BaseServer.handleRequest')
    expect(input?.nextSpanName).toBe('GET /users')
    expect(input?.nextRoute).toBe('/users')
    expect(input?.nextPage).toBe('/users/page.tsx')
    expect(input?.nextSegment).toBe('/users')
    expect(input?.nextRsc).toBe(true)
    expect(input?.attributes['http.target']).toBe('/users')
    expect(input?.attributes['http.url']).toBe('http://localhost:3000/users')
    expect(input?.attributes['db.password']).toBe('[redacted]')
    expect(input?.statusMessage).not.toContain('abcdefghijklmnop')
    expect(JSON.stringify(input)).not.toContain('abc123')
    expect(input?.traceId).toMatch(/^[0-9a-f]{32}$/)
    expect(input?.spanId).toMatch(/^[0-9a-f]{16}$/)
    expect(input?.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('drops instrumentation and collector self-requests', () => {
    const instrumentation = captureSpan((span) => {
      span.setAttribute('next.span_type', 'Instrumentation.register')
      span.end()
    })
    expect(
      readableSpanToInput(instrumentation, {
        collectorUrl: 'http://127.0.0.1:4400',
        fallbackServiceName: 'app',
      }),
    ).toBeNull()

    const selfRequest = captureSpan((span) => {
      span.setAttribute('http.url', 'http://127.0.0.1:4400/__stacknext/v1/ingest')
      span.end()
    })
    expect(
      readableSpanToInput(selfRequest, {
        collectorUrl: 'http://127.0.0.1:4400',
        fallbackServiceName: 'app',
      }),
    ).toBeNull()
  })
})

describe('StackNextSpanExporter', () => {
  it('enqueues converted spans without throwing', () => {
    const enqueued: unknown[] = []
    const exporter = new StackNextSpanExporter({
      transport: {
        enqueueSpan: (span) => enqueued.push(span),
        forceFlush: async () => {},
      },
      collectorUrl: 'http://127.0.0.1:4400',
      fallbackServiceName: 'app',
    })
    const readable = captureSpan((span) => {
      span.setAttribute('next.span_type', 'AppRender.getBodyResult')
      span.end()
    })

    let code = -1
    exporter.export([readable], (result) => {
      code = result.code
    })

    expect(code).toBe(0)
    expect(enqueued).toHaveLength(1)
  })

  it('drops Next.js fetch spans when captureFetch is false', () => {
    const enqueued: Array<{ nextSpanType?: string }> = []
    const exporter = new StackNextSpanExporter({
      transport: {
        enqueueSpan: (span) => enqueued.push(span),
        forceFlush: async () => {},
      },
      collectorUrl: 'http://127.0.0.1:4400',
      fallbackServiceName: 'app',
      captureFetch: false,
    })
    const fetchSpan = captureSpan((span) => {
      span.setAttribute('next.span_type', 'AppRender.fetch')
      span.end()
    })
    const renderSpan = captureSpan((span) => {
      span.setAttribute('next.span_type', 'AppRender.getBodyResult')
      span.end()
    })

    exporter.export([fetchSpan, renderSpan], () => undefined)

    expect(enqueued).toHaveLength(1)
    expect(enqueued[0]?.nextSpanType).toBe('AppRender.getBodyResult')
  })
})
