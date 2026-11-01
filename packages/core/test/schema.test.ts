import { describe, expect, it } from 'vitest'
import {
  normalizeError,
  normalizeSpan,
  parseNextScopeConfig,
  ingestEnvelopeSchema,
} from '../src/index.js'
import { envelope, rootSpan, errorEvent } from './fixtures.js'

describe('schema and normalization', () => {
  it('accepts a valid ingest envelope', () => {
    expect(ingestEnvelopeSchema.safeParse(envelope()).success).toBe(true)
  })

  it('rejects malformed trace ids, oversized arrays and unknown fields', () => {
    const badId = structuredClone(envelope())
    badId.spans[0] = { ...badId.spans[0]!, traceId: 'not-a-trace' }
    expect(ingestEnvelopeSchema.safeParse(badId).success).toBe(false)

    const tooMany = structuredClone(envelope())
    tooMany.spans = Array.from({ length: 501 }, () => rootSpan())
    expect(ingestEnvelopeSchema.safeParse(tooMany).success).toBe(false)

    const extra = { ...envelope(), something: true }
    expect(ingestEnvelopeSchema.safeParse(extra).success).toBe(false)
  })

  it('derives method, route and status from Next.js attributes', () => {
    const span = normalizeSpan(
      rootSpan({
        method: undefined,
        route: undefined,
        statusCode: undefined,
        name: 'GET /fallback',
        attributes: {
          'http.method': 'POST',
          'http.route': '/derived/[id]',
          'http.status_code': '503',
          'http.target': '/derived/1?secret=yes',
        },
      }),
      2_000,
    )
    expect(span.method).toBe('POST')
    expect(span.route).toBe('/derived/[id]')
    expect(span.statusCode).toBe(503)
    expect(span.name).toBe('GET /fallback')
    expect(span.receivedAt).toBe(2_000)
  })

  it('sanitizes span names, attributes and resources', () => {
    const span = normalizeSpan(
      rootSpan({
        name: 'fetch GET http://example.test/x?access_token=no',
        attributes: {
          authorization: 'Bearer secret',
          'http.url': 'http://example.test/x?api_key=no',
        },
      }),
      2_000,
    )
    expect(span.name).toBe('fetch GET http://example.test/x')
    expect(span.attributes.authorization).toBe('[redacted]')
    expect(span.attributes['http.url']).toBe('http://example.test/x')
    expect(span.resource['host.name']).toBeUndefined()
  })

  it('redacts error secrets and fingerprints repeated errors', () => {
    const first = normalizeError(errorEvent(), 2_000)
    const second = normalizeError(errorEvent(), 2_100)
    expect(first.message).not.toContain('hunter2')
    expect(first.requestPath).toBe('/api/test')
    expect(first.stack).not.toContain('hunter2')
    expect(first.attributes.cookie).toBe('[redacted]')
    expect(first.fingerprint).toBe(second.fingerprint)
  })

  it('validates configuration with actionable errors', () => {
    expect(parseNextScopeConfig({}).dashboard.port).toBe(4400)
    expect(() =>
      parseNextScopeConfig({ privacy: { captureRequestBodies: true } }),
    ).toThrow(/request bodies are not captured/)
    expect(() => parseNextScopeConfig({ collector: { maxSpans: 1 } })).toThrow(
      /collector\.maxSpans/,
    )
  })
})
