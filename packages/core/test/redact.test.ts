import { describe, expect, it } from 'vitest'
import {
  fingerprint,
  redactText,
  sanitizeAttributes,
  sanitizeResource,
  stripUrlQuery,
  stripUrlQueryInText,
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

  it('redacts standard OTel URL, token and flattened-header keys', () => {
    const result = sanitizeAttributes({
      'url.full': 'https://example.test/search?email=alice#bio',
      'url.query': 'email=alice&token=live',
      'url.fragment': 'bio',
      token: 'bare-token-value',
      auth_token: 'auth-token-value',
      'x-auth-token': 'x-auth-token-value',
      'http.request.header.user-agent': 'private-agent',
      'http.request.header.x-custom': 'private-header',
      nested: {
        'url.full': '/relative?secret=1',
        'http.response.header.set-cookie': 'session=abc',
      },
    })
    expect(result['url.full']).toBe('https://example.test/search')
    expect(result['url.query']).toBe('[redacted]')
    expect(result['url.fragment']).toBe('[redacted]')
    expect(result.token).toBe('[redacted]')
    expect(result.auth_token).toBe('[redacted]')
    expect(result['x-auth-token']).toBe('[redacted]')
    expect(result['http.request.header.user-agent']).toBe('[redacted]')
    expect(result['http.request.header.x-custom']).toBe('[redacted]')
    expect(result.nested).toEqual({
      'url.full': '/relative',
      'http.response.header.set-cookie': '[redacted]',
    })
    expect(JSON.stringify(result)).not.toContain('alice')
    expect(JSON.stringify(result)).not.toContain('bare-token-value')
    expect(JSON.stringify(result)).not.toContain('private-agent')
  })

  it('removes URL queries from quoted paths, non-HTTP URLs and userinfo', () => {
    const text = [
      'Error at "/api/users?email=alice"',
      "fetch('/api/users?email=alice')",
      'postgres://host/db?sslmode=require',
      'http://user:pass@example.test/path?x=1',
      'GET /api/users?email=alice#fragment',
    ].join('\n')
    const redacted = stripUrlQueryInText(redactText(text))
    expect(redacted).not.toContain('email=alice')
    expect(redacted).not.toContain('sslmode=require')
    expect(redacted).not.toContain('user:pass')
    expect(redacted).not.toContain('#fragment')
    expect(redacted).toContain('"/api/users"')
    expect(redacted).toContain("fetch('/api/users')")
    expect(redacted).toContain('postgres://host/db')
    expect(redacted).toContain('http://[redacted]@example.test/path')
    expect(redacted).toContain('GET /api/users')
  })

  it('does not let __proto__ attributes mutate object prototypes', () => {
    const result = sanitizeAttributes({
      ['__proto__']: { polluted: true },
      safe: 'visible',
    })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(result)).toBeNull()
    expect(Object.hasOwn(result, '__proto__')).toBe(true)
    expect(result.safe).toBe('visible')
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
