import { describe, expect, it } from 'vitest'
import type { DiagnosticFinding, RequestSummary, TraceDetail } from '../src/index.js'
import {
  VERIFY_SAMPLE_LIMIT,
  verifyDiagnosticStatus,
  verifyMaxDatabaseQueries,
  verifyMaxRequestDuration,
  verifyRequestStatus,
} from '../src/index.js'

function trace(overrides: Partial<TraceDetail> = {}): TraceDetail {
  return {
    traceId: 'a'.repeat(32),
    request: null,
    spans: [
      {
        traceId: 'a'.repeat(32),
        spanId: 'root',
        name: 'GET /api/projects',
        kind: 'server',
        startTime: 1,
        endTime: 2,
        durationMs: 1,
        status: 'ok',
        serviceName: 'verify-test',
        statusCode: 200,
        attributes: {},
        events: [],
        resource: {},
        receivedAt: 2,
      },
    ],
    errors: [],
    databaseQueries: [],
    startTime: 1,
    endTime: 2,
    durationMs: 1,
    missingParentSpanIds: [],
    warnings: [],
    ...overrides,
  }
}

function request(index: number, overrides: Partial<RequestSummary> = {}): RequestSummary {
  return {
    id: `${index}`.padStart(32, 'a'),
    traceId: `${index}`.padStart(32, 'a'),
    name: 'GET /api/projects',
    method: 'GET',
    route: '/api/projects',
    statusCode: 200,
    statusClass: '2xx',
    durationMs: 10,
    timestamp: 1_000 + index,
    endTime: 1_010 + index,
    spanCount: 1,
    errorCount: 0,
    databaseQueryCount: 0,
    fetchCount: 0,
    failed: false,
    slow: false,
    serviceName: 'verify-test',
    ...overrides,
  }
}

const finding = {
  id: 'diag-1234abcd-5678ef90',
  status: 'observed',
} as DiagnosticFinding

describe('deterministic verification', () => {
  it('checks request status against the root server span', () => {
    const supported = verifyRequestStatus({
      traceId: 'a'.repeat(32),
      expectedStatus: 200,
      trace: trace(),
      revision: 7,
    })
    expect(supported.result).toBe('supported')
    expect(supported.checks[0]).toMatchObject({ expected: 200, observed: 200, passed: true })
    expect(supported.revision).toBe(7)

    const contradicted = verifyRequestStatus({
      traceId: 'a'.repeat(32),
      expectedStatus: 500,
      trace: trace(),
    })
    expect(contradicted.result).toBe('contradicted')
    const missing = verifyRequestStatus({
      traceId: 'a'.repeat(32),
      expectedStatus: 200,
      trace: null,
    })
    expect(missing.result).toBe('unverifiable')
    expect(missing.checks[0]?.reason).toBeTruthy()
  })

  it('checks database query counts with bounded sampling', () => {
    const requests = Array.from({ length: VERIFY_SAMPLE_LIMIT + 5 }, (_, index) => request(index))
    const traces = requests.map((item) =>
      trace({ traceId: item.traceId, databaseQueries: [] }),
    )
    const result = verifyMaxDatabaseQueries({
      route: '/api/projects',
      maxQueries: 0,
      since: 0,
      requests,
      traces,
    })
    expect(result.result).toBe('supported')
    expect(result.sampleSize).toBe(VERIFY_SAMPLE_LIMIT)
    expect(result.checks).toHaveLength(VERIFY_SAMPLE_LIMIT)

    const over = verifyMaxDatabaseQueries({
      route: '/api/projects',
      maxQueries: 0,
      since: 0,
      requests: [request(1)],
      traces: [
        trace({
          traceId: request(1).traceId,
          databaseQueries: [
            {
              id: 'q1',
              traceId: request(1).traceId,
              timestamp: 1,
              durationMs: 1,
              sql: 'select 1',
              databaseSystem: 'sqlite',
              success: true,
              source: 'drizzle',
              attributes: {},
              receivedAt: 1,
            },
          ],
        }),
      ],
    })
    expect(over.result).toBe('contradicted')
    expect(over.checks[0]?.observed).toBe(1)
  })

  it('is unverifiable for null durations, missing traces and empty samples', () => {
    const base = {
      route: '/api/projects',
      maxQueries: 3,
      since: 0,
      requests: [request(1)],
    }
    expect(
      verifyMaxDatabaseQueries({ ...base, traces: [] }).result,
    ).toBe('unverifiable')
    const nullDuration = trace({ traceId: request(1).traceId })
    nullDuration.databaseQueries = [
      {
        id: 'q1',
        traceId: nullDuration.traceId,
        timestamp: 1,
        durationMs: null,
        sql: 'select 1',
        databaseSystem: 'sqlite',
        success: true,
        source: 'drizzle',
        attributes: {},
        receivedAt: 1,
      },
    ]
    expect(
      verifyMaxDatabaseQueries({ ...base, traces: [nullDuration] }).result,
    ).toBe('unverifiable')
    expect(
      verifyMaxDatabaseQueries({ ...base, requests: [], traces: [] }).result,
    ).toBe('unverifiable')
  })

  it('checks request duration and diagnostic status', () => {
    const durations = verifyMaxRequestDuration({
      route: '/api/projects',
      maxDurationMs: 50,
      since: 0,
      requests: [request(1)],
    })
    expect(durations.result).toBe('supported')
    expect(
      verifyMaxRequestDuration({
        route: '/api/projects',
        maxDurationMs: 5,
        since: 0,
        requests: [request(1)],
      }).result,
    ).toBe('contradicted')
    expect(
      verifyDiagnosticStatus({
        diagnosticId: finding.id,
        expectedStatus: 'observed',
        diagnostic: finding,
      }).result,
    ).toBe('supported')
    expect(
      verifyDiagnosticStatus({
        diagnosticId: finding.id,
        expectedStatus: 'possible',
        diagnostic: finding,
      }).result,
    ).toBe('contradicted')
    expect(
      verifyDiagnosticStatus({
        diagnosticId: finding.id,
        expectedStatus: 'observed',
        diagnostic: null,
      }).result,
    ).toBe('unverifiable')
  })
})
