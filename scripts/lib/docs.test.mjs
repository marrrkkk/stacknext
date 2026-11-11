import { describe, expect, it } from 'vitest'
import { redirectDestination } from './docs.mjs'

describe('redirect destination parsing', () => {
  it('splits fragments from local destinations', () => {
    expect(redirectDestination('/guides/diagnostics#slow-queries')).toEqual({
      pathname: '/guides/diagnostics',
      fragment: 'slow-queries',
      dynamic: false,
    })
  })

  it('marks wildcard and parameterized destinations as dynamic', () => {
    expect(redirectDestination('/v2/:slug*')).toEqual({
      pathname: '/v2/:slug*',
      fragment: '',
      dynamic: true,
    })
    expect(redirectDestination('/new/article-*')).toEqual({
      pathname: '/new/article-*',
      fragment: '',
      dynamic: true,
    })
  })

  it('does not treat a colon inside a segment as a parameter', () => {
    expect(redirectDestination('/guides/time:now')).toEqual({
      pathname: '/guides/time:now',
      fragment: '',
      dynamic: false,
    })
  })

  it('keeps fragments on parameterized destinations', () => {
    expect(redirectDestination('/v2/:slug*#top')).toEqual({
      pathname: '/v2/:slug*',
      fragment: 'top',
      dynamic: true,
    })
  })
})
