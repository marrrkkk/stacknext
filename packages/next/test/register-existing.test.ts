import { ProxyTracerProvider, trace } from '@opentelemetry/api'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  getStackNextTransport,
  resetGlobalTransportForTests,
} from '@stacknext/core/transport'
import { registerStackNext } from '../src/register.js'

let existing: NodeTracerProvider

beforeAll(() => {
  existing = new NodeTracerProvider({
    resource: resourceFromAttributes({ 'service.name': 'existing-apm' }),
  })
  existing.register()
})

afterAll(async () => {
  resetGlobalTransportForTests()
  await existing.shutdown()
})

describe('registerStackNext with an existing provider', () => {
  it('yields to the application provider instead of replacing it', async () => {
    const result = await registerStackNext({
      transport: {
        collectorUrl: 'http://127.0.0.1:9',
        token: 'e'.repeat(32),
        heartbeatIntervalMs: 60_000,
      },
    })
    expect(result).toBeNull()
    const provider = trace.getTracerProvider()
    expect(provider).toBeInstanceOf(ProxyTracerProvider)
    expect(
      (provider as ProxyTracerProvider).getDelegate(),
    ).toBe(existing)
  })

  it('reports the external provider over the heartbeat transport', () => {
    const transport = getStackNextTransport({
      collectorUrl: 'http://127.0.0.1:9',
      token: 'e'.repeat(32),
      heartbeatIntervalMs: 60_000,
      provider: 'external',
    })
    expect(transport?.snapshot().provider).toBe('external')
  })
})
