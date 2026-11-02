import { describe, expect, it } from 'vitest'
import {
  classifySpanCategory,
  frameworkSpanFields,
  isStandardNextSpanType,
} from '../src/index.js'

describe('framework span metadata', () => {
  it('extracts documented Next.js attributes and strips query strings', () => {
    const fields = frameworkSpanFields({
      'next.span_name': 'render /products?sort=price#reviews',
      'next.route': '/products/[id]?token=secret',
      'next.page': '/products/[id]/page',
      'next.segment': '/products/[id]',
      'next.rsc': 'true',
    })
    expect(fields).toEqual({
      nextSpanName: 'render /products',
      nextRoute: '/products/[id]',
      nextPage: '/products/[id]/page',
      nextSegment: '/products/[id]',
      nextRsc: true,
    })
  })

  it('redacts sensitive values in framework metadata', () => {
    const fields = frameworkSpanFields({
      'next.route': '/api/check?token=super-secret-demo-token&redirect=/home',
    })
    expect(fields.nextRoute).toBe('/api/check')
    expect(JSON.stringify(fields)).not.toContain('super-secret-demo-token')
  })

  it('distinguishes standard and verbose Next.js span types', () => {
    expect(isStandardNextSpanType('BaseServer.handleRequest')).toBe(true)
    expect(isStandardNextSpanType('NextNodeServer.findPageComponents')).toBe(true)
    expect(isStandardNextSpanType('NextNodeServer.someInternalDetail')).toBe(false)
    expect(isStandardNextSpanType(undefined)).toBe(false)
  })

  it('classifies framework, fetch, database and app spans without overlap', () => {
    const base = {
      kind: 'internal',
      attributes: {},
    }
    expect(
      classifySpanCategory({
        ...base,
        nextSpanType: 'BaseServer.handleRequest',
      }),
    ).toBe('framework')
    expect(
      classifySpanCategory({
        ...base,
        nextSpanType: 'AppRender.fetch',
      }),
    ).toBe('fetch')
    expect(
      classifySpanCategory({
        ...base,
        attributes: { 'db.system': 'postgresql', 'db.statement': 'select 1' },
      }),
    ).toBe('database')
    expect(
      classifySpanCategory({
        ...base,
        attributes: { 'stacknext.span.kind': 'action' },
      }),
    ).toBe('app')
    expect(
      classifySpanCategory({
        ...base,
        attributes: { 'stacknext.manual': true },
      }),
    ).toBe('app')
  })
})
