import {
  TraceFlags,
  context,
  trace,
} from '@opentelemetry/api'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  getStackNextTransport,
  resetGlobalTransportForTests,
} from '@stacknext/core/transport'
import { onRequestError, requestErrorToInput } from '../src/error.js'
import { startIngestSink, type IngestSink } from './sink.js'

const AUTH_TOKEN = 't'.repeat(32)

let sink: IngestSink | undefined
let provider: NodeTracerProvider

function clearEnv(): void {
  delete process.env.STACKNEXT_COLLECTOR_URL
  delete process.env.STACKNEXT_TOKEN
  delete process.env.STACKNEXT_PROJECT_NAME
  delete process.env.NEXT_RUNTIME
  delete process.env.STACKNEXT_CAPTURE_ERRORS
}

beforeAll(() => {
  // Registers the async-hooks context manager so active spans work as they do
  // inside a real instrumented Next.js process.
  provider = new NodeTracerProvider()
  provider.register()
})

afterAll(async () => {
  await provider.shutdown()
})

beforeEach(() => {
  clearEnv()
  resetGlobalTransportForTests()
})

afterEach(async () => {
  const transport = getStackNextTransport()
  if (transport) await transport.shutdown(250)
  resetGlobalTransportForTests()
  clearEnv()
  if (sink) {
    await sink.close()
    sink = undefined
  }
})

describe('requestErrorToInput', () => {
  it('normalizes an Error without touching request headers', () => {
    const input = requestErrorToInput(
      Object.assign(new Error('render failed token=abcdef123456'), {
        digest: 'digest-123',
      }),
      {
        path: '/dashboard?secret=value',
        method: 'get',
        headers: { authorization: 'Bearer abcdefghijklmnop', cookie: 'session=1' },
      },
      {
        routerKind: 'App Router',
        routePath: '/dashboard?tab=1',
        routeType: 'render',
        renderSource: 'react-server-components',
        revalidateReason: 'on-demand',
      },
    )

    expect(input.name).toBe('Error')
    expect(input.message).toContain('token=[redacted]')
    expect(input.message).not.toContain('abcdef123456')
    expect(input.digest).toBe('digest-123')
    expect(input.route).toBe('/dashboard')
    expect(input.requestPath).toBe('/dashboard')
    expect(input.method).toBe('GET')
    expect(input.routerKind).toBe('App Router')
    expect(input.routeType).toBe('render')
    expect(input.renderSource).toBe('react-server-components')
    expect(input.attributes['next.revalidate_reason']).toBe('on-demand')
    expect(JSON.stringify(input)).not.toContain('Bearer abcdefghijklmnop')
    expect(JSON.stringify(input)).not.toContain('session=1')
    expect(input.traceId).toBeUndefined()
  })

  it('handles non-Error values', () => {
    const stringInput = requestErrorToInput('boom', { path: '/', method: 'GET' }, {})
    expect(stringInput.message).toBe('boom')
    expect(stringInput.name).toBe('Error')

    const objectInput = requestErrorToInput(
      { name: 'CustomError', message: 'custom', stack: 'stack line' },
      { path: '/', method: 'POST' },
      {},
    )
    expect(objectInput.name).toBe('CustomError')
    expect(objectInput.stack).toBe('stack line')

    const emptyInput = requestErrorToInput(null, { path: '/', method: 'GET' }, {})
    expect(emptyInput.message).toBe('Unknown error')
  })
})

describe('onRequestError', () => {
  it('is inert when no collector is configured', () => {
    expect(() =>
      onRequestError(new Error('ignored'), { path: '/', method: 'GET' }, {}),
    ).not.toThrow()
  })

  it('does not capture data outside the Node.js runtime', () => {
    process.env.NEXT_RUNTIME = 'edge'
    expect(() =>
      onRequestError(new Error('ignored'), { path: '/', method: 'GET' }, {}),
    ).not.toThrow()
  })

  it('does not capture errors when captureErrors is disabled', async () => {
    sink = await startIngestSink()
    process.env.STACKNEXT_COLLECTOR_URL = sink.url
    process.env.STACKNEXT_TOKEN = AUTH_TOKEN
    process.env.STACKNEXT_CAPTURE_ERRORS = '0'

    onRequestError(new Error('ignored'), { path: '/', method: 'GET' }, {})
    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(sink.envelopes).toHaveLength(0)
  })

  it('links the error to the active trace over the real ingest transport', async () => {
    sink = await startIngestSink()
    process.env.STACKNEXT_COLLECTOR_URL = sink.url
    process.env.STACKNEXT_TOKEN = AUTH_TOKEN
    process.env.STACKNEXT_PROJECT_NAME = 'demo-app'

    const spanContext = {
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
      traceFlags: TraceFlags.SAMPLED,
    }
    const span = trace.wrapSpanContext(spanContext)
    try {
      context.with(trace.setSpan(context.active(), span), () => {
        onRequestError(
          new Error('route failed token=abcdef123456'),
          {
            path: '/api/users?token=secret',
            method: 'get',
            headers: { authorization: 'Bearer should-not-leak' },
          },
          {
            routerKind: 'App Router',
            routePath: '/api/users',
            routeType: 'route',
          },
        )
      })

      await sink.waitForEnvelopes(1)
      const envelope = sink.envelopes[0]
      expect(envelope).toBeDefined()
      expect(envelope?.errors).toHaveLength(1)
      const error = envelope?.errors[0]
      expect(error?.message).toContain('token=[redacted]')
      expect(error?.message).not.toContain('abcdef123456')
      expect(error?.route).toBe('/api/users')
      expect(error?.requestPath).toBe('/api/users')
      expect(error?.method).toBe('GET')
      expect(error?.traceId).toBe(spanContext.traceId)
      expect(error?.spanId).toBe(spanContext.spanId)
      expect(JSON.stringify(envelope)).not.toContain('should-not-leak')
      expect(envelope?.instance.projectName).toBe('demo-app')
    } finally {
      span.end()
    }
  })
})
