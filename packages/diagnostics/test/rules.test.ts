import { describe, expect, it } from 'vitest'
import type {
  DiagnosticFinding,
  DiagnosticReport,
  DiagnosticSnapshot,
} from '@stacknext/core'
import {
  countFindings,
  diagnosticOverview,
  generateDiagnosticReport,
  getDiagnosticDetail,
  listDiagnosticFindings,
  type DiagnosticEngineOptions,
} from '../src/engine.js'
import { diagnosticSpanCategory, spanThresholdMs } from '../src/classify.js'
import {
  TRACE_A,
  TRACE_B,
  config,
  error,
  query,
  request,
  snapshot,
  span,
} from './fixtures.js'

function options(
  overrides: Partial<DiagnosticEngineOptions> = {},
): DiagnosticEngineOptions {
  return {
    projectName: 'diagnostics-test',
    collectorVersion: '0.7.0',
    config: config().diagnostics,
    generatedAt: 10_000,
    connected: true,
    connectedInstances: 1,
    ...overrides,
  }
}

function reportFor(
  value: DiagnosticSnapshot,
  overrides: Partial<DiagnosticEngineOptions> = {},
): DiagnosticReport {
  return generateDiagnosticReport(value, options(overrides))
}

function byRule(
  report: DiagnosticReport,
  ruleId: DiagnosticFinding['ruleId'],
): DiagnosticFinding[] {
  return report.findings.filter((finding) => finding.ruleId === ruleId)
}

describe('diagnostic rule classification', () => {
  it('classifies database, fetch, custom, framework and other spans', () => {
    expect(
      diagnosticSpanCategory(span({ attributes: { 'db.system': 'sqlite' } })),
    ).toBe('database')
    expect(
      diagnosticSpanCategory(
        span({
          kind: 'client',
          nextSpanType: 'AppRender.fetch',
          attributes: { 'http.url': 'https://example.test/api' },
        }),
      ),
    ).toBe('http')
    expect(
      diagnosticSpanCategory(
        span({
          attributes: { 'stacknext.span.kind': 'custom' },
          nextSpanType: undefined,
          kind: 'internal',
          parentSpanId: '2222222222222222',
        }),
      ),
    ).toBe('custom')
    expect(diagnosticSpanCategory(span())).toBe('framework')
    expect(
      diagnosticSpanCategory(
        span({
          kind: 'internal',
          parentSpanId: '2222222222222222',
          nextSpanType: undefined,
        }),
      ),
    ).toBe('other')
  })

  it('selects thresholds by category', () => {
    const diagnostics = config({
      diagnostics: {
        slowSpans: {
          databaseMs: 10,
          httpMs: 20,
          customMs: 30,
          otherMs: 40,
        },
      },
    }).diagnostics
    expect(spanThresholdMs('database', diagnostics)).toBe(10)
    expect(spanThresholdMs('http', diagnostics)).toBe(20)
    expect(spanThresholdMs('custom', diagnostics)).toBe(30)
    expect(spanThresholdMs('framework', diagnostics)).toBe(40)
  })
})

describe('possible N+1 queries', () => {
  it('groups repeated SQL shapes per trace and keeps the finding possible', () => {
    const queries = Array.from({ length: 5 }, (_, index) =>
      query({
        id: `query-${index}`,
        sql: `select * from tasks where project_id = ${index + 1}`,
        timestamp: 1_010 + index,
      }),
    )
    queries.push(
      query({
        id: 'other-trace',
        traceId: TRACE_B,
        resolvedTraceId: TRACE_B,
        sql: 'select * from tasks where project_id = 99',
        timestamp: 1_020,
      }),
    )
    const report = reportFor(
      snapshot({
        spans: [span()],
        databaseQueries: queries,
        requests: [request()],
      }),
    )
    const findings = byRule(report, 'n-plus-one-queries')
    expect(findings).toHaveLength(1)
    const finding = findings[0]!
    expect(finding.status).toBe('possible')
    expect(finding.severity).toBe('warning')
    expect(finding.category).toBe('database')
    expect(finding.route).toBe('/api/test')
    expect(finding.traceIds).toEqual([TRACE_A])
    expect(finding.evidence.queries).toHaveLength(5)
    expect(finding.evidence.queries[0]?.sqlFingerprint).toBe(
      'select * from tasks where project_id = ?',
    )
    expect(JSON.stringify(finding)).not.toContain('project_id = 1')
    expect(finding.verification.length).toBeGreaterThan(0)
    expect(finding.detail).toContain('cannot confirm')
    expect(finding.limitations.join(' ')).toContain('intentional')
  })

  it('honors repeatedQueryMin and ignores queries without a resolved trace', () => {
    const below = reportFor(
      snapshot({
        databaseQueries: Array.from({ length: 4 }, (_, index) =>
          query({ id: `q-${index}`, sql: 'select * from tasks where id = ?' }),
        ),
      }),
    )
    expect(byRule(below, 'n-plus-one-queries')).toHaveLength(0)

    const unresolved = reportFor(
      snapshot({
        databaseQueries: Array.from({ length: 8 }, (_, index) =>
          query({
            id: `q-${index}`,
            traceId: undefined,
            resolvedTraceId: null,
            sql: 'select * from tasks where id = ?',
          }),
        ),
      }),
    )
    expect(byRule(unresolved, 'n-plus-one-queries')).toHaveLength(0)
  })

  it('caps query evidence and reports the full matching count', () => {
    const report = reportFor(
      snapshot({
        databaseQueries: Array.from({ length: 15 }, (_, index) =>
          query({
            id: `q-${index}`,
            sql: `select * from tasks where id = ${index}`,
            timestamp: 1_000 + index,
          }),
        ),
      }),
    )
    const finding = byRule(report, 'n-plus-one-queries')[0]!
    expect(finding.evidence.queries).toHaveLength(10)
    expect(finding.evidence.measurements).toContainEqual({
      label: 'matching queries',
      value: 15,
    })
    expect(finding.title).toContain('15 similar')
  })
})

describe('slow spans', () => {
  it('reports observed threshold crossings with category-specific thresholds', () => {
    const report = reportFor(
      snapshot({
        spans: [
          span({
            spanId: 'db-span',
            name: 'db.select tasks',
            attributes: { 'db.system': 'sqlite' },
            durationMs: 260,
          }),
          span({
            spanId: 'http-span',
            name: 'fetch GET https://example.test/api?token=secret',
            kind: 'client',
            nextSpanType: 'AppRender.fetch',
            attributes: {
              'http.url': 'https://example.test/api?token=secret',
            },
            durationMs: 510,
          }),
          span({
            spanId: 'custom-span',
            name: 'custom.work',
            kind: 'internal',
            parentSpanId: '2222222222222222',
            nextSpanType: undefined,
            attributes: { 'stacknext.span.kind': 'custom' },
            durationMs: 310,
          }),
          span({
            spanId: 'fast-span',
            name: 'fast custom',
            kind: 'internal',
            parentSpanId: '2222222222222222',
            nextSpanType: undefined,
            attributes: { 'stacknext.span.kind': 'custom' },
            durationMs: 10,
          }),
        ],
      }),
    )
    const findings = byRule(report, 'slow-span')
    expect(findings).toHaveLength(3)
    expect(findings.map((finding) => finding.status)).toEqual([
      'observed',
      'observed',
      'observed',
    ])
    expect(findings.every((finding) => finding.severity === 'warning')).toBe(true)
    expect(findings.map((finding) => finding.title)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Slow database span'),
        expect.stringContaining('Slow http span'),
        expect.stringContaining('Slow custom span'),
      ]),
    )
    expect(JSON.stringify(findings)).not.toContain('token=secret')
  })

  it('does not treat null or non-positive durations as slow', () => {
    const report = reportFor(
      snapshot({
        spans: [
          span({ spanId: 'zero', durationMs: 0 }),
          span({ spanId: 'negative', durationMs: -1 }),
        ],
      }),
    )
    expect(byRule(report, 'slow-span')).toHaveLength(0)
  })

  it('uses the configured thresholds', () => {
    const value = snapshot({
      spans: [
        span({
          spanId: 'custom-span',
          kind: 'internal',
          parentSpanId: '2222222222222222',
          nextSpanType: undefined,
          attributes: { 'stacknext.span.kind': 'custom' },
          durationMs: 100,
        }),
      ],
    })
    expect(
      byRule(reportFor(value), 'slow-span'),
    ).toHaveLength(0)
    const tuned = config({
      diagnostics: { slowSpans: { customMs: 100 } },
    }).diagnostics
    expect(
      byRule(reportFor(value, { config: tuned }), 'slow-span'),
    ).toHaveLength(1)
  })
})

describe('repeated external HTTP', () => {
  it('groups repeated endpoints in one trace after removing credentials and IDs', () => {
    const spans = [1, 2, 3].map((id, index) =>
      span({
        spanId: `http-${index}`,
        traceId: TRACE_A,
        name: `fetch GET https://api.example.test/users/${id}?token=secret`,
        kind: 'client',
        nextSpanType: 'AppRender.fetch',
        attributes: {
          'http.url': `https://user:password@api.example.test/users/${id}?token=secret`,
          'http.method': 'GET',
        },
        durationMs: 30,
        startTime: 1_020 + index,
      }),
    )
    const report = reportFor(
      snapshot({
        spans: [span(), ...spans],
        requests: [request()],
      }),
    )
    const findings = byRule(report, 'repeated-external-http')
    expect(findings).toHaveLength(1)
    const finding = findings[0]!
    expect(finding.status).toBe('possible')
    expect(finding.category).toBe('http')
    expect(finding.traceIds).toEqual([TRACE_A])
    expect(finding.evidence.spans).toHaveLength(3)
    expect(finding.evidence.measurements).toContainEqual({
      label: 'endpoint',
      value: 'api.example.test/users/:id',
    })
    expect(JSON.stringify(finding)).not.toContain('password')
    expect(JSON.stringify(finding)).not.toContain('token=secret')
  })

  it('honors repeatedHttpMin and groups separately by trace and method', () => {
    const two = reportFor(
      snapshot({
        spans: [
          span({ spanId: 'a', name: 'fetch GET https://api.example.test/a' }),
          span({ spanId: 'b', name: 'fetch GET https://api.example.test/a' }),
        ],
      }),
    )
    expect(byRule(two, 'repeated-external-http')).toHaveLength(0)

    const mixed = reportFor(
      snapshot({
        spans: [
          span({ spanId: 'a', name: 'fetch GET https://api.example.test/a' }),
          span({ spanId: 'b', name: 'fetch GET https://api.example.test/a' }),
          span({ spanId: 'c', name: 'fetch POST https://api.example.test/a' }),
          span({
            spanId: 'd',
            traceId: TRACE_B,
            name: 'fetch GET https://api.example.test/a',
          }),
        ],
      }),
    )
    expect(byRule(mixed, 'repeated-external-http')).toHaveLength(0)
  })
})

describe('error fingerprint grouping', () => {
  it('groups the same signature across routes and reports observed evidence', () => {
    const report = reportFor(
      snapshot({
        errors: [
          error({ id: 'e1', route: '/api/one', timestamp: 1_010 }),
          error({
            id: 'e2',
            route: '/api/two',
            method: 'POST',
            timestamp: 1_020,
            traceId: TRACE_B,
            resolvedTraceId: TRACE_B,
          }),
        ],
      }),
    )
    const findings = byRule(report, 'error-fingerprint')
    expect(findings).toHaveLength(1)
    const finding = findings[0]!
    expect(finding.status).toBe('observed')
    expect(finding.severity).toBe('error')
    expect(finding.category).toBe('errors')
    expect(finding.route).toBeNull()
    expect(finding.traceIds).toEqual([TRACE_B, TRACE_A])
    expect(finding.evidence.errors).toHaveLength(2)
    expect(finding.evidence.measurements).toContainEqual({
      label: 'occurrences',
      value: 2,
    })
    expect(finding.fingerprint).toMatch(/^[0-9a-f]{8}$/)
  })

  it('can be disabled independently of the engine', () => {
    const value = snapshot({
      errors: [
        error({ id: 'e1' }),
        error({ id: 'e2', timestamp: 1_030 }),
      ],
    })
    const disabled = config({
      diagnostics: { errorGrouping: false },
    }).diagnostics
    expect(byRule(reportFor(value, { config: disabled }), 'error-fingerprint')).toHaveLength(0)
  })

  it('honors errorGroupMin', () => {
    const value = snapshot({ errors: [error({ id: 'e1' })] })
    expect(byRule(reportFor(value), 'error-fingerprint')).toHaveLength(0)
    const minThree = config({ diagnostics: { errorGroupMin: 3 } }).diagnostics
    const two = snapshot({
      errors: [error({ id: 'e1' }), error({ id: 'e2', timestamp: 1_030 })],
    })
    expect(byRule(reportFor(two, { config: minThree }), 'error-fingerprint')).toHaveLength(0)
  })

  it('does not crash on an invalid timestamp in a stored snapshot', () => {
    const report = reportFor(
      snapshot({
        errors: [error({ id: 'e1' }), error({ id: 'e2', timestamp: 1e20 })],
      }),
    )
    const finding = byRule(report, 'error-fingerprint')[0]!
    expect(finding.detail).toContain('unknown time')
  })
})

describe('report generation', () => {
  it('is deterministic for the same snapshot and options', () => {
    const value = snapshot({
      spans: [
        span({
          spanId: 'slow',
          attributes: { 'db.system': 'sqlite' },
          durationMs: 900,
        }),
      ],
      errors: [error({ id: 'e1' }), error({ id: 'e2', timestamp: 1_030 })],
    })
    const first = reportFor(value)
    const second = reportFor(value)
    expect(second).toEqual(first)
  })

  it('sorts findings by severity, recency and id', () => {
    const report = reportFor(
      snapshot({
        spans: [
          span({
            spanId: 'slow',
            name: 'slow span',
            durationMs: 900,
            startTime: 1_100,
          }),
        ],
        errors: [error({ id: 'e1' }), error({ id: 'e2', timestamp: 1_030 })],
      }),
    )
    expect(report.findings[0]?.severity).toBe('error')
    const warningIds = report.findings
      .filter((finding) => finding.severity === 'warning')
      .map((finding) => finding.id)
    expect(warningIds).toEqual([...warningIds].sort())
  })

  it('reports counts, sample metadata and bounded notes', () => {
    const value = snapshot({
      spans: [span()],
      errors: [error({ id: 'e1' }), error({ id: 'e2', timestamp: 1_030 })],
      databaseQueries: [query({ durationMs: null })],
      requests: [request()],
    })
    const report = reportFor(value)
    expect(report.format).toBe('stacknext-diagnostics')
    expect(report.version).toBe(1)
    expect(report.engineVersion).toBe('0.7.0')
    expect(report.ruleSetVersion).toBe(1)
    expect(report.projectName).toBe('diagnostics-test')
    expect(report.sample).toMatchObject({
      requests: 1,
      spans: 1,
      errors: 2,
      databaseQueries: 1,
      connected: true,
      connectedInstances: 1,
    })
    expect(report.counts).toEqual(countFindings(report.findings))
    expect(report.counts.bySeverity.error).toBe(1)
    expect(report.notes.join(' ')).toContain('no measured duration')
    expect(report.limitations.join(' ')).toContain('not confirmed root causes')
  })

  it('returns explicit notes for an empty sample and disabled diagnostics', () => {
    const empty = reportFor(snapshot())
    expect(empty.findings).toEqual([])
    expect(empty.notes.join(' ')).toContain('No telemetry')
    expect(empty.counts.total).toBe(0)

    const disabled = config({ diagnostics: { enabled: false } }).diagnostics
    const report = reportFor(
      snapshot({
        errors: [error({ id: 'e1' }), error({ id: 'e2', timestamp: 1_030 })],
      }),
      { config: disabled },
    )
    expect(report.findings).toEqual([])
    expect(report.notes).toEqual(['Diagnostics are disabled by configuration.'])
  })

  it('caps findings at maxFindings and explains the cap', () => {
    const spans = Array.from({ length: 12 }, (_, index) =>
      span({
        spanId: `slow-${index}`,
        name: `slow ${index}`,
        durationMs: 900,
        startTime: 1_000 + index,
      }),
    )
    const limited = config({ diagnostics: { maxFindings: 10 } }).diagnostics
    const report = reportFor(snapshot({ spans }), { config: limited })
    expect(report.findings).toHaveLength(10)
    expect(report.notes.join(' ')).toContain('Showing the top 10 of 12 findings')
  })

  it('keeps error messages bounded and sanitizes names and routes', () => {
    const longMessage = 'x'.repeat(2_000)
    const report = reportFor(
      snapshot({
        spans: [
          span({
            spanId: 'slow-span',
            name: 'slow work',
            durationMs: 900,
            route: '/api/test?token=super-secret-demo-token',
          }),
        ],
        databaseQueries: Array.from({ length: 5 }, (_, index) =>
          query({
            id: `q-${index}`,
            route: '/api/test?token=super-secret-demo-token',
            timestamp: 1_010 + index,
          }),
        ),
        errors: [
          error({
            id: 'e1',
            name: 'Boom token=super-secret-demo-token',
            message: longMessage,
            route: '/api/test?token=super-secret-demo-token',
          }),
          error({
            id: 'e2',
            name: 'Boom token=super-secret-demo-token',
            message: longMessage,
            route: '/api/test?token=super-secret-demo-token',
            timestamp: 1_030,
          }),
        ],
      }),
    )
    const finding = report.findings[0]
    expect(finding?.evidence.errors[0]?.message.length).toBeLessThanOrEqual(601)
    expect(finding?.title).not.toContain('super-secret-demo-token')
    expect(finding?.evidence.errors[0]?.name).not.toContain('super-secret-demo-token')
    expect(finding?.evidence.errors[0]?.route).not.toContain('super-secret-demo-token')
    expect(JSON.stringify(report.findings)).not.toContain('super-secret-demo-token')
  })
})

describe('diagnostic list and detail views', () => {
  function populated(): { snapshot: DiagnosticSnapshot; report: DiagnosticReport } {
    const value = snapshot({
      spans: [
        span({
          spanId: 'slow-db',
          name: 'db.select tasks',
          attributes: { 'db.system': 'sqlite' },
          durationMs: 900,
          startTime: 1_100,
        }),
        span({
          spanId: 'http-1',
          traceId: TRACE_B,
          name: 'fetch GET https://api.example.test/users?token=secret',
          kind: 'client',
          nextSpanType: 'AppRender.fetch',
          attributes: { 'http.url': 'https://api.example.test/users?token=secret' },
          durationMs: 30,
          startTime: 1_200,
        }),
        span({
          spanId: 'http-2',
          traceId: TRACE_B,
          name: 'fetch GET https://api.example.test/users?token=secret',
          kind: 'client',
          nextSpanType: 'AppRender.fetch',
          attributes: { 'http.url': 'https://api.example.test/users?token=secret' },
          durationMs: 30,
          startTime: 1_201,
        }),
        span({
          spanId: 'http-3',
          traceId: TRACE_B,
          name: 'fetch GET https://api.example.test/users?token=secret',
          kind: 'client',
          nextSpanType: 'AppRender.fetch',
          attributes: { 'http.url': 'https://api.example.test/users?token=secret' },
          durationMs: 30,
          startTime: 1_202,
        }),
        span({
          spanId: 'http-root',
          traceId: TRACE_B,
          name: 'GET /api/other',
          route: '/api/other',
          startTime: 1_150,
          endTime: 1_300,
          durationMs: 150,
        }),
      ],
      errors: [error({ id: 'e1' }), error({ id: 'e2', timestamp: 1_030 })],
      requests: [
        request(),
        request({
          id: TRACE_B,
          traceId: TRACE_B,
          route: '/api/other',
          timestamp: 1_150,
          endTime: 1_300,
          durationMs: 150,
        }),
      ],
    })
    return { snapshot: value, report: reportFor(value) }
  }

  it('filters by category, severity, status, rule, route, trace and time', () => {
    const { report } = populated()
    const database = listDiagnosticFindings(report, { category: 'database' })
    expect(database.items.every((finding) => finding.category === 'database')).toBe(true)
    expect(database.total).toBe(database.items.length)

    const errors = listDiagnosticFindings(report, { severity: 'error' })
    expect(errors.items.every((finding) => finding.severity === 'error')).toBe(true)

    const observed = listDiagnosticFindings(report, { status: 'observed' })
    expect(observed.items.every((finding) => finding.status === 'observed')).toBe(true)

    const rule = listDiagnosticFindings(report, { ruleId: 'repeated-external-http' })
    expect(rule.items).toHaveLength(1)

    const route = listDiagnosticFindings(report, { route: '/api/other' })
    expect(route.items.every((finding) => finding.route?.includes('/api/other'))).toBe(
      true,
    )

    const trace = listDiagnosticFindings(report, { traceId: TRACE_B })
    expect(trace.items.every((finding) => finding.traceIds.includes(TRACE_B))).toBe(
      true,
    )

    const recent = listDiagnosticFindings(report, { since: 1_190 })
    expect(recent.items.every((finding) => finding.lastSeen >= 1_190)).toBe(true)

    const old = listDiagnosticFindings(report, { until: 1_040 })
    expect(old.items.every((finding) => finding.firstSeen <= 1_040)).toBe(true)

    const text = listDiagnosticFindings(report, { q: 'repeated' })
    expect(text.items.length).toBeGreaterThan(0)
    expect(text.items.every((finding) =>
      `${finding.title} ${finding.summary} ${finding.detail} ${finding.fingerprint}`
        .toLowerCase()
        .includes('repeated'),
    )).toBe(true)
  })

  it('paginates, clamps limits and counts only the filtered set', () => {
    const { report } = populated()
    const first = listDiagnosticFindings(report, { limit: 1, offset: 0 })
    expect(first.items).toHaveLength(1)
    expect(first.total).toBe(report.findings.length)
    expect(first.counts.total).toBe(report.findings.length)
    expect(first.limit).toBe(1)

    const second = listDiagnosticFindings(report, { limit: 1, offset: 1 })
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id)

    const tooLarge = listDiagnosticFindings(report, { limit: 99_999 })
    expect(tooLarge.limit).toBe(200)

    const tooSmall = listDiagnosticFindings(report, { limit: 0 })
    expect(tooSmall.limit).toBe(1)

    const filtered = listDiagnosticFindings(report, {
      category: 'database',
      limit: 50,
    })
    expect(filtered.counts).toEqual(countFindings(filtered.items))
    expect(filtered.total).toBe(filtered.items.length)
  })

  it('returns a bounded trace context for a finding and null for unknown ids', () => {
    const { snapshot: value, report } = populated()
    const slow = report.findings.find((finding) => finding.ruleId === 'slow-span')!
    const detail = getDiagnosticDetail(report, slow.id, value)
    expect(detail).not.toBeNull()
    expect(detail?.finding.id).toBe(slow.id)
    expect(detail?.trace?.traceId).toBe(TRACE_A)
    expect(detail?.trace?.request?.route).toBe('/api/test')
    expect(detail?.trace?.spans.map((entry) => entry.spanId)).toContain('slow-db')
    expect(getDiagnosticDetail(report, 'diag-00000000-00000000', value)).toBeNull()
  })

  it('detects missing parents in related trace evidence', () => {
    const value = snapshot({
      spans: [
        span({
          spanId: 'slow',
          parentSpanId: 'missing-parent',
          durationMs: 900,
        }),
      ],
    })
    const report = reportFor(value)
    const finding = report.findings.find((entry) => entry.ruleId === 'slow-span')!
    const detail = getDiagnosticDetail(report, finding.id, value)!
    expect(detail.trace?.missingParentSpanIds).toEqual(['missing-parent'])
  })

  it('builds an overview with counts and a bounded top list', () => {
    const { report } = populated()
    const overview = diagnosticOverview(report, 2)
    expect(overview.counts).toEqual(report.counts)
    expect(overview.topFindings).toHaveLength(2)
    expect(overview.limitations).toEqual(report.limitations)
  })
})
