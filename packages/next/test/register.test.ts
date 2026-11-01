import { trace } from '@opentelemetry/api'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetGlobalTransportForTests } from '@nextscope/core/transport'
import {
  getNextScopeRegistration,
  registerNextScope,
  shutdownNextScope,
} from '../src/register.js'
import { startIngestSink, type IngestSink } from './sink.js'

const TOKEN = 'r'.repeat(32)
let sink: IngestSink | undefined

function clearEnv(): void {
  delete process.env.NEXTSCOPE_COLLECTOR_URL
  delete process.env.NEXTSCOPE_TOKEN
  delete process.env.NEXTSCOPE_PROJECT_NAME
  delete process.env.NEXTSCOPE_NEXT_VERSION
  delete process.env.NEXT_RUNTIME
  delete process.env.NEXTSCOPE_DEBUG
}

beforeEach(() => {
  clearEnv()
  resetGlobalTransportForTests()
})

afterEach(async () => {
  await shutdownNextScope()
  resetGlobalTransportForTests()
  clearEnv()
  if (sink) {
    await sink.close()
    sink = undefined
  }
})

describe('registerNextScope', () => {
  it('stays inert without collector configuration', async () => {
    expect(await registerNextScope()).toBeNull()
    expect(getNextScopeRegistration()).toBeUndefined()
  })

  it('does nothing on the Edge runtime', async () => {
    process.env.NEXT_RUNTIME = 'edge'
    expect(
      await registerNextScope({
        transport: {
          collectorUrl: 'http://127.0.0.1:4400',
          token: TOKEN,
        },
      }),
    ).toBeNull()
  })

  it('registers a provider once and flushes spans to the collector', async () => {
    sink = await startIngestSink()
    const options = {
      transport: {
        collectorUrl: sink.url,
        token: TOKEN,
        serviceName: 'demo-service',
        projectName: 'demo-project',
        heartbeatIntervalMs: 60_000,
        flushIntervalMs: 50,
      },
      nextVersion: '16.4.3',
    }
    const first = await registerNextScope(options)
    const second = await registerNextScope(options)

    expect(first).not.toBeNull()
    expect(second).toBe(first)
    expect(getNextScopeRegistration()).toBe(first)

    const span = trace.getTracer('register-test').startSpan('GET /register')
    span.end()
    await first?.provider.forceFlush()
    await sink.waitForEnvelopes(1)

    const envelope = sink.envelopes[0]
    expect(envelope?.spans).toHaveLength(1)
    expect(envelope?.spans[0]?.serviceName).toBe('demo-service')
    expect(envelope?.instance.nextVersion).toBe('16.4.3')
    expect(envelope?.spans[0]?.resource['service.name']).toBe('demo-service')

    await shutdownNextScope()
    expect(getNextScopeRegistration()).toBeUndefined()
  })
})
