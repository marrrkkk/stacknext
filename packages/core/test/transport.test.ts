import { describe, expect, it } from 'vitest'
import { isLoopbackUrl, NextScopeTransport, transportOptionsFromEnv } from '../src/transport.js'

describe('transport helpers', () => {
  it('only accepts loopback collector URLs', () => {
    expect(isLoopbackUrl('http://127.0.0.1:4400')).toBe(true)
    expect(isLoopbackUrl('http://localhost:4400')).toBe(true)
    expect(isLoopbackUrl('http://[::1]:4400')).toBe(true)
    expect(isLoopbackUrl('http://10.0.0.5:4400')).toBe(false)
    expect(isLoopbackUrl('https://collector.example.com')).toBe(false)
    expect(isLoopbackUrl('http://user:pass@127.0.0.1:4400')).toBe(false)
  })

  it('requires a collector URL and a strong local token', () => {
    expect('error' in transportOptionsFromEnv({})).toBe(true)
    expect(
      'error' in
        transportOptionsFromEnv({
          NEXTSCOPE_COLLECTOR_URL: 'http://127.0.0.1:4400',
          NEXTSCOPE_TOKEN: 'short',
        }),
    ).toBe(true)
    const result = transportOptionsFromEnv({
      NEXTSCOPE_COLLECTOR_URL: 'http://127.0.0.1:4400',
      NEXTSCOPE_TOKEN: 'a'.repeat(32),
      NEXTSCOPE_PROJECT_NAME: 'demo',
    })
    expect('options' in result && result.options.projectName).toBe('demo')
  })

  it('bounds the in-memory queue', async () => {
    const transport = new NextScopeTransport({
      collectorUrl: 'http://127.0.0.1:9',
      token: 'a'.repeat(32),
      maxQueueSize: 2,
      flushIntervalMs: 60_000,
      heartbeatIntervalMs: 60_000,
      requestTimeoutMs: 20,
    })
    transport.enqueueError({
      id: 'e1',
      message: 'one',
      name: 'Error',
      timestamp: 1,
      attributes: {},
    })
    transport.enqueueError({
      id: 'e2',
      message: 'two',
      name: 'Error',
      timestamp: 2,
      attributes: {},
    })
    transport.enqueueError({
      id: 'e3',
      message: 'three',
      name: 'Error',
      timestamp: 3,
      attributes: {},
    })
    const snapshot = transport.snapshot()
    expect(snapshot.queuedErrors).toBe(2)
    expect(snapshot.droppedEvents).toBe(1)
    await transport.shutdown(25)
  })
})
