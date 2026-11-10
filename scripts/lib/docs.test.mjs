import { describe, expect, it } from 'vitest'
import { redirectDestination } from './docs.mjs'

describe('redirect destination parsing', () => {
  it('strips fragments from local destinations', () => {
    expect(redirectDestination('/guides/diagnostics#slow-queries')).toEqual({
      pathname: '/guides/diagnostics',
      dynamic: false,
    })
  })

  it('marks wildcard and parameterized destinations as dynamic', () => {
    expect(redirectDestination('/v2/:slug*')).toEqual({
      pathname: '/v2/:slug*',
      dynamic: true,
    })
    expect(redirectDestination('/new/article-*')).toEqual({
      pathname: '/new/article-*',
      dynamic: true,
    })
  })

  it('does not treat a colon inside a segment as a parameter', () => {
    expect(redirectDestination('/guides/time:now')).toEqual({
      pathname: '/guides/time:now',
      dynamic: false,
    })
  })
})
