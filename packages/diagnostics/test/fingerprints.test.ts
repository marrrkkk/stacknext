import { describe, expect, it } from 'vitest'
import {
  diagnosticErrorFingerprint,
  diagnosticFindingId,
  httpEndpoint,
  normalizeErrorMessage,
  sqlFingerprint,
  sqlPreview,
} from '../src/fingerprints.js'
import { error } from './fixtures.js'

describe('diagnostic fingerprints', () => {
  it('normalizes SQL literals, bind parameters and comments into one shape', () => {
    const first = sqlFingerprint(
      "select id, name from users where id = $1 and email = 'alice@example.test' and age > 42 -- trace",
    )
    const second = sqlFingerprint(
      'SELECT id, name FROM users WHERE id = :id AND email = ? AND age > 99 /* request */',
    )
    expect(first).toBe(second)
    expect(first).toBe('select id, name from users where id = ? and email = ? and age > ?')
  })

  it('removes dollar-quoted values, UUIDs and long identifiers from SQL', () => {
    const shape = sqlFingerprint(
      "select * from sessions where token = $$super-secret$$ and id = '01234567-89ab-cdef-0123-456789abcdef' and owner = 0123456789abcdef",
    )
    expect(shape).not.toContain('super-secret')
    expect(shape).not.toContain('01234567')
    expect(shape).not.toContain('0123456789abcdef')
    expect(shape).toContain('token = ?')
    expect(shape).toContain('id = ?')
  })

  it('bounds SQL previews without exposing raw bind values', () => {
    const preview = sqlPreview(
      "select * from users where password = 'hunter2' and api_key = 'super-secret-demo-token'",
      30,
    )
    expect(preview.length).toBeLessThanOrEqual(30)
    expect(preview).toContain('[truncated]')
    expect(preview).not.toContain('hunter2')
    expect(preview).not.toContain('super-secret-demo-token')
  })

  it('reduces HTTP URLs to credential-free endpoint shapes', () => {
    expect(
      httpEndpoint(
        'https://user:password@api.example.test/v1/users/123/orders/550e8400-e29b-41d4-a716-446655440000?token=secret#fragment',
      ),
    ).toBe('api.example.test/v1/users/:id/orders/:id')
    expect(httpEndpoint('/api/projects/42/tasks?token=secret')).toBe(
      '/api/projects/:id/tasks',
    )
    expect(httpEndpoint('/api/items/0123456789abcdef')).toBe('/api/items/:id')
    expect(httpEndpoint('/api/items/abcdefghijklmnopqrstuvwxyz123456')).toBe(
      '/api/items/:id',
    )
    expect(httpEndpoint('ftp://example.test/file')).toBeNull()
    expect(httpEndpoint(undefined)).toBeNull()
  })

  it('keeps error signatures stable across routes and variable values', () => {
    const first = error({
      id: 'first',
      route: '/api/one',
      method: 'GET',
      message: 'Failed for order 123 at https://example.test/a?token=secret',
    })
    const second = error({
      id: 'second',
      route: '/api/two',
      method: 'POST',
      message: 'Failed for order 456 at https://example.test/b?token=other',
    })
    expect(diagnosticErrorFingerprint(first)).toBe(
      diagnosticErrorFingerprint(second),
    )
    expect(normalizeErrorMessage(first.message)).toContain('<n>')
    expect(normalizeErrorMessage(first.message)).toContain('<url>')
    expect(normalizeErrorMessage(first.message)).not.toContain('secret')
  })

  it('changes the error signature when the stack shape changes', () => {
    const first = error({ id: 'first' })
    const second = error({
      id: 'second',
      stack: 'Error: failed\n    at otherHandler (/app/other.ts:90:4)',
    })
    expect(diagnosticErrorFingerprint(first)).not.toBe(
      diagnosticErrorFingerprint(second),
    )
  })

  it('produces deterministic finding ids scoped by trace or span', () => {
    const one = diagnosticFindingId('slow-span', 'fingerprint', 'trace:span')
    const two = diagnosticFindingId('slow-span', 'fingerprint', 'trace:span')
    const otherScope = diagnosticFindingId(
      'slow-span',
      'fingerprint',
      'trace:other',
    )
    expect(one).toBe(two)
    expect(one).toMatch(/^diag-[0-9a-f]{8}-[0-9a-f]{8}$/)
    expect(otherScope).not.toBe(one)
  })
})
