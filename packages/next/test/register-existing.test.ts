import { ProxyTracerProvider, trace } from '@opentelemetry/api'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { registerStackNext } from '../src/register.js'

let existing: NodeTracerProvider

beforeAll(() => {
  existing = new NodeTracerProvider({
    resource: resourceFromAttributes({ 'service.name': 'existing-apm' }),
  })
  existing.register()
})

afterAll(async () => {
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
})
