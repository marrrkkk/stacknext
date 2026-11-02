import { describe, expect, it } from 'vitest'
import {
  CaptureTransportError,
  createTraceparent,
  resolveCaptureConfig,
} from '../src/index.js'

describe('Playwright capture configuration', () => {
  it('is inactive without an explicit test run', () => {
    expect(resolveCaptureConfig({})).toBeNull()
    expect(resolveCaptureConfig({ STACKNEXT_TEST_RUN_ID: '' })).toBeNull()
  })

  it('requires loopback collector settings when capture is active', () => {
    expect(() =>
      resolveCaptureConfig({ STACKNEXT_TEST_RUN_ID: `run-${'1'.repeat(16)}` }),
    ).toThrow(CaptureTransportError)
    expect(() =>
      resolveCaptureConfig({
        STACKNEXT_TEST_RUN_ID: `run-${'1'.repeat(16)}`,
        STACKNEXT_COLLECTOR_URL: 'http://example.com:4400',
        STACKNEXT_TOKEN: 'x'.repeat(32),
      }),
    ).toThrow(/loopback/)
    const config = resolveCaptureConfig({
      STACKNEXT_TEST_RUN_ID: `run-${'1'.repeat(16)}`,
      STACKNEXT_COLLECTOR_URL: 'http://127.0.0.1:4400',
      STACKNEXT_TOKEN: 'x'.repeat(32),
    })
    expect(config).toMatchObject({
      runId: `run-${'1'.repeat(16)}`,
      collectorUrl: 'http://127.0.0.1:4400',
      settleMs: 500,
      timeoutMs: 5_000,
    })
  })

  it('creates unique, non-zero W3C trace context values', () => {
    const first = createTraceparent()
    const second = createTraceparent()
    expect(first.traceparent).toBe(`00-${first.traceId}-${first.spanId}-01`)
    expect(first.traceId).toMatch(/^[0-9a-f]{32}$/)
    expect(first.spanId).toMatch(/^[0-9a-f]{16}$/)
    expect(first.traceId).not.toBe('0'.repeat(32))
    expect(first.spanId).not.toBe('0'.repeat(16))
    expect(first.traceId).not.toBe(second.traceId)
  })
})
