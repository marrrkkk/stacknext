import { describe, expect, it } from 'vitest'
import { legacyRedirect, matchRoute } from '../src/router.js'

const TRACE_ID = '0123456789abcdef0123456789abcdef'

describe('matchRoute', () => {
  it('redirects legacy request URLs to the canonical traces routes', () => {
    expect(matchRoute('/requests')).toEqual({
      page: 'redirect',
      to: '/traces?view=requests',
    })
    expect(matchRoute('/requests/')).toEqual({
      page: 'redirect',
      to: '/traces?view=requests',
    })
    expect(matchRoute(`/requests/${TRACE_ID}`)).toEqual({
      page: 'redirect',
      to: `/traces/${TRACE_ID}`,
    })
  })

  it('keeps the trace list and detail as canonical routes', () => {
    expect(matchRoute('/traces')).toEqual({ page: 'traces' })
    expect(matchRoute(`/traces/${TRACE_ID}`)).toEqual({
      page: 'trace',
      id: TRACE_ID,
    })
  })

  it('resolves the database list and query-shape detail', () => {
    expect(matchRoute('/database')).toEqual({ page: 'database' })
    expect(matchRoute('/database/abc123')).toEqual({
      page: 'database-query',
      id: 'abc123',
    })
    expect(matchRoute('/database/abc123/')).toEqual({
      page: 'database-query',
      id: 'abc123',
    })
  })

  it('ignores deep-link hashes when resolving the page', () => {
    expect(matchRoute('/settings#collector')).toEqual({ page: 'settings' })
    expect(matchRoute('/settings#preferences')).toEqual({ page: 'settings' })
    expect(matchRoute('/mcp#tools')).toEqual({ page: 'mcp' })
    expect(matchRoute('/mcp#safety')).toEqual({ page: 'mcp' })
  })

  it('preserves request filters when redirecting the legacy list', () => {
    expect(legacyRedirect('/requests?slow=1&sort=slowest')).toBe(
      '/traces?view=requests&slow=1&sort=slowest',
    )
    expect(legacyRedirect('/requests')).toBe('/traces?view=requests')
    expect(legacyRedirect(`/requests/${TRACE_ID}`)).toBe(`/traces/${TRACE_ID}`)
    expect(legacyRedirect('/traces')).toBeNull()
  })

  it('does not throw on malformed percent-encoded paths', () => {
    expect(matchRoute('/traces/%')).toEqual({ page: 'trace', id: '%' })
    expect(matchRoute('/snapshots/%')).toEqual({ page: 'snapshot', id: '%' })
    expect(legacyRedirect('/traces/%')).toBeNull()
  })
})
