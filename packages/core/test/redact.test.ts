import { describe, expect, it } from 'vitest'
import {
  fingerprint,
  redactText,
  sanitizeAttributes,
  sanitizeResource,
  stripUrlQuery,
} from '../src/index.js'

describe('redaction', () => {
  it('removes query strings and credentials from URLs', () => {
    expect(stripUrlQuery('http://example.test/path?token=secret#fragment')).toBe(
      'http://example.test/path',
    )
    expect(stripUrlQuery('https://user:pass@example.test/path?x=1')).toBe(
      'https://example.test/path',
    )
    expect(stripUrlQuery('/relative?secret=1')).toBe('/relative')
  })

  it('redacts named secret fields at any depth', () => {
    const result = sanitizeAttributes({
      authorization: 'Bearer live-token',
      nested: {
        password: 'hunter2',
        cookie: 'session=abc',
        apiKey: 'key',
        safe: 'visible',
      },
      headers: { accept: 'text/html' },
      'http.url': 'https://example.test/data?api_key=secret',
    })
    expect(result.authorization).toBe('[redacted]')
    expect(result.nested).toEqual({
      password: '[redacted]',
      cookie: '[redacted]',
      apiKey: '[redacted]',
      safe: 'visible',
    })
    expect(result.headers).toBe('[redacted]')
    expect(result['http.url']).toBe('https://example.test/data')
    expect(JSON.stringify(result)).not.toContain('hunter2')
    expect(JSON.stringify(result)).not.toContain('api_key=secret')
  })

  it('redacts token patterns in free text', () => {
    const text = [
      'Authorization: Bearer abc.def.ghi',
      'token=ghp_abcdefghijklmnopqrstuvwxyz',
      'postgres://admin:password@localhost:5432/app',
      'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturevalue',
    ].join('\n')
    const redacted = redactText(text)
    expect(redacted).not.toContain('abc.def.ghi')
    expect(redacted).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz')
    expect(redacted).not.toContain('admin:password')
    expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiJ9')
    expect(redacted).toContain('[redacted]')
  })

  it('only allows known resource attributes', () => {
    const resource = sanitizeResource({
      'service.name': 'demo',
      'telemetry.sdk.language': 'nodejs',
      'host.name': 'marks-laptop',
      'process.command': '/secret/path',
    })
    expect(resource).toEqual({
      'service.name': 'demo',
      'telemetry.sdk.language': 'nodejs',
    })
  })

  it('caps attribution depth and array size', () => {
    const deep = {
      a: { b: { c: { d: { e: { f: { g: { h: { i: { j: { k: 'too deep' } } } } } } } } } },
    }
    expect(JSON.stringify(sanitizeAttributes(deep))).toContain('[max-depth]')
    expect(sanitizeAttributes({ list: Array.from({ length: 100 }, (_, i) => i) }).list).toHaveLength(50)
  })

  it('produces stable error fingerprints', () => {
    expect(fingerprint(['Error', 'boom', '/api'])).toBe(fingerprint(['Error', 'boom', '/api']))
    expect(fingerprint(['Error', 'boom'])).not.toBe(fingerprint(['Error', 'bang']))
  })
})
