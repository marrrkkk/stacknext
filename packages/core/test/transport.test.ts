import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getStackNextTransport,
  isLoopbackUrl,
  resetGlobalTransportForTests,
  StackNextTransport,
  transportOptionsFromEnv,
} from '../src/transport.js'

afterEach(() => {
  resetGlobalTransportForTests()
})

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
          STACKNEXT_COLLECTOR_URL: 'http://127.0.0.1:4400',
          STACKNEXT_TOKEN: 'short',
        }),
    ).toBe(true)
    const result = transportOptionsFromEnv({
      STACKNEXT_COLLECTOR_URL: 'http://127.0.0.1:4400',
      STACKNEXT_TOKEN: 'a'.repeat(32),
      STACKNEXT_PROJECT_NAME: 'demo',
    })
    expect('options' in result && result.options.projectName).toBe('demo')
  })

  it('bounds the in-memory queue', async () => {
    const transport = new StackNextTransport({
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

  it('reuses the external transport for adapter calls without options', () => {
    const previousUrl = process.env.STACKNEXT_COLLECTOR_URL
    const previousToken = process.env.STACKNEXT_TOKEN
    const collectorUrl = 'http://127.0.0.1:9'
    const token = 'a'.repeat(32)
    try {
      process.env.STACKNEXT_COLLECTOR_URL = collectorUrl
      process.env.STACKNEXT_TOKEN = token
      const external = getStackNextTransport({
        collectorUrl,
        token,
        provider: 'external',
      })
      expect(external?.snapshot().provider).toBe('external')
      expect(getStackNextTransport()).toBe(external)
    } finally {
      if (previousUrl === undefined) delete process.env.STACKNEXT_COLLECTOR_URL
      else process.env.STACKNEXT_COLLECTOR_URL = previousUrl
      if (previousToken === undefined) delete process.env.STACKNEXT_TOKEN
      else process.env.STACKNEXT_TOKEN = previousToken
    }
  })

  it('announces the external provider in its heartbeat', async () => {
    let resolveBody!: (body: string) => void
    const bodyReceived = new Promise<string>((resolve) => {
      resolveBody = resolve
    })
    const server = createServer((request, response) => {
      let body = ''
      request.setEncoding('utf8')
      request.on('data', (chunk: string) => {
        body += chunk
      })
      request.on('end', () => {
        response.statusCode = 200
        response.end('{}')
        resolveBody(body)
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    const transport = new StackNextTransport({
      collectorUrl: `http://127.0.0.1:${address.port}`,
      token: 'a'.repeat(32),
      heartbeatIntervalMs: 60_000,
      provider: 'external',
    })
    try {
      transport.announce()
      const envelope = JSON.parse(await bodyReceived) as {
        instance: { provider?: string }
        spans: unknown[]
      }
      expect(envelope.instance.provider).toBe('external')
      expect(envelope.spans).toEqual([])
    } finally {
      await transport.shutdown(100)
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('keeps every batch below the collector body limit', async () => {
    const sizes: number[] = []
    const server = createServer((request, response) => {
      let size = 0
      request.on('data', (chunk: Buffer) => {
        size += chunk.length
      })
      request.on('end', () => {
        sizes.push(size)
        response.statusCode = 200
        response.end('{}')
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    const transport = new StackNextTransport({
      collectorUrl: `http://127.0.0.1:${address.port}`,
      token: 'a'.repeat(32),
      batchSize: 100,
      flushIntervalMs: 60_000,
      heartbeatIntervalMs: 60_000,
      requestTimeoutMs: 2_000,
    })
    for (let index = 0; index < 30; index += 1) {
      transport.enqueueError({
        id: `large-${index}`,
        message: 'x',
        name: 'Error',
        stack: 'x'.repeat(64_000),
        timestamp: 1,
        attributes: {},
      })
    }
    while (transport.snapshot().queuedErrors > 0) {
      expect(await transport.flush()).toBe(true)
    }
    const snapshot = transport.snapshot()
    await transport.shutdown(100)
    await new Promise<void>((resolve) => server.close(() => resolve()))
    expect(sizes.length).toBeGreaterThan(1)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(2 * 1024 * 1024)
    expect(snapshot.exportedEvents).toBe(30)
    expect(snapshot.droppedEvents).toBe(0)
  })

  it('drops a batch rejected with HTTP 413 instead of retrying forever', async () => {
    const server = createServer((request, response) => {
      request.resume()
      request.on('end', () => {
        response.statusCode = 413
        response.end('too large')
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    const transport = new StackNextTransport({
      collectorUrl: `http://127.0.0.1:${address.port}`,
      token: 'a'.repeat(32),
      batchSize: 10,
      flushIntervalMs: 60_000,
      heartbeatIntervalMs: 60_000,
      requestTimeoutMs: 2_000,
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
    expect(await transport.flush()).toBe(true)
    const snapshot = transport.snapshot()
    expect(snapshot.queuedErrors).toBe(0)
    expect(snapshot.exportedEvents).toBe(0)
    expect(snapshot.droppedEvents).toBe(2)
    expect(snapshot.lastError).toContain('413')
    await transport.shutdown(100)
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('does not splice out telemetry queued while a flush is in flight', async () => {
    let releaseResponse!: () => void
    const responseReleased = new Promise<void>((resolve) => {
      releaseResponse = resolve
    })
    let markReceived!: () => void
    const received = new Promise<void>((resolve) => {
      markReceived = resolve
    })
    const server = createServer((request, response) => {
      request.resume()
      request.on('end', () => {
        markReceived()
        void responseReleased.then(() => {
          response.statusCode = 200
          response.end('{}')
        })
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    const transport = new StackNextTransport({
      collectorUrl: `http://127.0.0.1:${address.port}`,
      token: 'a'.repeat(32),
      batchSize: 1,
      maxQueueSize: 1,
      flushIntervalMs: 60_000,
      heartbeatIntervalMs: 60_000,
      requestTimeoutMs: 2_000,
    })
    transport.enqueueError({
      id: 'first',
      message: 'first',
      name: 'Error',
      timestamp: 1,
      attributes: {},
    })
    const inFlight = transport.flush()
    await received
    transport.enqueueError({
      id: 'second',
      message: 'second',
      name: 'Error',
      timestamp: 2,
      attributes: {},
    })
    releaseResponse()
    expect(await inFlight).toBe(true)
    const snapshot = transport.snapshot()
    expect(snapshot.queuedErrors).toBe(1)
    expect(snapshot.exportedEvents).toBe(0)
    expect(snapshot.droppedEvents).toBe(1)
    await transport.shutdown(100)
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })
})
