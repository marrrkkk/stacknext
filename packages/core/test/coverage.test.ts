import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIG,
  TelemetryStore,
  computeCoverage,
  emptyCoverageEvidence,
  nextOtelVerboseStatus,
  type ConnectionInfo,
  type StackNextConfig,
} from '../src/index.js'
import {
  TRACE_ID,
  databaseQuery,
  envelope,
  errorEvent,
  fetchSpan,
  rootSpan,
} from './fixtures.js'

function connection(overrides: Partial<ConnectionInfo> = {}): ConnectionInfo {
  return {
    instanceId: 'test-instance',
    serviceName: 'test-app',
    projectName: 'test-project',
    sdkVersion: '0.6.0',
    lastSeen: 2_000,
    connected: true,
    ...overrides,
  }
}

function config(overrides: Partial<StackNextConfig['instrumentation']> = {}): StackNextConfig {
  return {
    ...DEFAULT_CONFIG,
    instrumentation: { ...DEFAULT_CONFIG.instrumentation, ...overrides },
  }
}

describe('coverage evidence', () => {
  it('aggregates observed span types, categories and query sources', () => {
    const store = new TelemetryStore({ now: () => 5_000 })
    store.ingest(envelope(), 5_000)
    const evidence = store.getCoverageEvidence()

    expect(evidence.sample.spanCount).toBe(2)
    expect(evidence.sample.requestCount).toBe(1)
    expect(evidence.sample.errorCount).toBe(1)
    expect(evidence.sample.databaseQueryCount).toBe(1)
    expect(evidence.spanTypes['BaseServer.handleRequest']?.count).toBe(1)
    expect(evidence.spanTypes['AppRender.fetch']?.count).toBe(1)
    expect(evidence.requestRootSpans).toBe(1)
    expect(evidence.fetchSpans).toBe(1)
    expect(evidence.databaseSpans).toBe(0)
    expect(evidence.querySources.drizzle).toBe(1)
    expect(evidence.verboseSpanTypes).toEqual([])
    expect(evidence.categoryCounts.framework).toBe(1)
    expect(evidence.categoryCounts.fetch).toBe(1)
  })

  it('tracks custom and Server Action spans separately', () => {
    const store = new TelemetryStore({ now: () => 5_000 })
    store.ingest(
      envelope({
        spans: [
          rootSpan(),
          fetchSpan({
            nextSpanType: undefined,
            attributes: { 'stacknext.manual': true, 'stacknext.span.kind': 'custom' },
            spanId: 'aaaaaaaaaaaaaaaa',
          }),
          fetchSpan({
            nextSpanType: undefined,
            attributes: { 'stacknext.manual': true, 'stacknext.span.kind': 'action' },
            spanId: 'bbbbbbbbbbbbbbbb',
          }),
        ],
        errors: [],
        databaseQueries: [],
      }),
      5_000,
    )
    const evidence = store.getCoverageEvidence()
    expect(evidence.customSpans).toBe(1)
    expect(evidence.actionSpans).toBe(1)
    expect(evidence.categoryCounts.app).toBe(2)
  })

  it('retains non-standard span types as verbose evidence', () => {
    const store = new TelemetryStore({ now: () => 5_000 })
    store.ingest(
      envelope({
        spans: [rootSpan({ nextSpanType: 'NextNodeServer.internalDetail' })],
        errors: [],
        databaseQueries: [],
      }),
      5_000,
    )
    expect(store.getCoverageEvidence().verboseSpanTypes).toEqual([
      'NextNodeServer.internalDetail',
    ])
  })

  it('does not claim AppRender.fetch for client-only fetch spans', () => {
    const store = new TelemetryStore({ now: () => 5_000 })
    store.ingest(
      envelope({
        spans: [
          rootSpan(),
          fetchSpan({
            nextSpanType: undefined,
            kind: 'client',
            attributes: { 'http.url': 'https://example.test/data' },
          }),
        ],
        errors: [],
        databaseQueries: [],
      }),
      5_000,
    )
    const report = computeCoverage({
      projectName: 'test-project',
      collectorVersion: '0.6.0',
      now: 5_000,
      config: config(),
      connections: [connection()],
      verbose: { enabled: false, source: 'disabled' },
      evidence: store.getCoverageEvidence(),
    })
    const fetchItem = report.items.find((item) => item.id === 'next.fetch')
    expect(fetchItem?.status).toBe('observed')
    expect(fetchItem?.evidence.count).toBe(1)
    expect(fetchItem?.evidence.spanTypes).toEqual([])
  })
})

describe('computeCoverage', () => {
  it('marks features observed from real evidence and keeps sample metadata', () => {
    const store = new TelemetryStore({ now: () => 5_000 })
    store.ingest(envelope(), 5_000)
    const report = computeCoverage({
      projectName: 'test-project',
      collectorVersion: '0.6.0',
      now: 5_000,
      config: config(),
      connections: [connection()],
      verbose: { enabled: false, source: 'disabled' },
      evidence: store.getCoverageEvidence(),
    })

    const byId = new Map(report.items.map((item) => [item.id, item]))
    expect(byId.get('next.request-root')?.status).toBe('observed')
    expect(byId.get('next.fetch')?.status).toBe('observed')
    expect(byId.get('next.request-errors')?.status).toBe('observed')
    expect(byId.get('database.drizzle')?.status).toBe('observed')
    expect(byId.get('next.app-render')?.status).toBe('not-observed')
    expect(byId.get('custom.spans')?.status).toBe('unknown')
    expect(byId.get('unsupported.edge-runtime')?.status).toBe('unsupported')
    expect(byId.get('next.verbose-spans')?.status).toBe('not-observed')

    expect(report.sample.requests).toBe(1)
    expect(report.sample.spans).toBe(2)
    expect(report.sample.connected).toBe(true)
    expect(report.sample.connectedInstances).toBe(1)
    expect(report.sample.retentionMs).toBe(600_000)
    expect(report.statusCounts.observed).toBeGreaterThan(0)
    expect(
      Object.values(report.statusCounts).reduce((sum, value) => sum + value, 0),
    ).toBe(report.items.length)
    expect(JSON.stringify(report)).not.toMatch(/"percent(age)?"/)
    expect(report.notes.join(' ')).toContain('Absence is not proof')
  })

  it('reports configured rather than observed when nothing is connected', () => {
    const report = computeCoverage({
      projectName: 'test-project',
      collectorVersion: '0.6.0',
      now: 5_000,
      config: config(),
      connections: [],
      verbose: { enabled: false, source: 'disabled' },
      evidence: emptyCoverageEvidence(),
    })
    const statuses = new Map(report.items.map((item) => [item.id, item.status]))
    expect(statuses.get('next.request-root')).toBe('configured')
    expect(statuses.get('next.fetch')).toBe('configured')
    expect(statuses.get('database.drizzle')).toBe('unknown')
    expect(statuses.get('custom.server-actions')).toBe('unknown')
    expect(report.notes.join(' ')).toContain('No app is currently connected')
  })

  it('distinguishes disabled configuration from missing observation', () => {
    const store = new TelemetryStore({ now: () => 5_000 })
    store.ingest(envelope(), 5_000)
    const report = computeCoverage({
      projectName: 'test-project',
      collectorVersion: '0.6.0',
      now: 5_000,
      config: config({ captureFetch: false, captureErrors: false }),
      connections: [connection()],
      verbose: { enabled: true, source: 'environment' },
      evidence: store.getCoverageEvidence(),
    })
    const byId = new Map(report.items.map((item) => [item.id, item]))
    expect(byId.get('next.fetch')?.configured).toBe(false)
    expect(byId.get('next.fetch')?.status).toBe('observed')
    expect(byId.get('next.fetch')?.limitations.join(' ')).toContain('captureFetch is false')
    expect(byId.get('next.request-errors')?.status).toBe('observed')
    expect(byId.get('next.verbose-spans')?.status).toBe('not-observed')
  })

  it('does not expose sensitive query values in report evidence', () => {
    const store = new TelemetryStore({ now: () => 5_000 })
    store.ingest(
      envelope({
        spans: [
          rootSpan({ name: 'GET /api/test?token=super-secret-demo-token' }),
          fetchSpan(),
        ],
        errors: [errorEvent()],
        databaseQueries: [databaseQuery()],
      }),
      5_000,
    )
    const serialized = JSON.stringify(
      computeCoverage({
        projectName: 'test-project',
        collectorVersion: '0.6.0',
        now: 5_000,
        config: config(),
        connections: [connection()],
        verbose: { enabled: false, source: 'disabled' },
        evidence: store.getCoverageEvidence(),
      }),
    )
    expect(serialized).not.toContain('super-secret-demo-token')
    expect(serialized).not.toContain('hunter2')
    expect(serialized).not.toContain(TRACE_ID)
  })
})

describe('NEXT_OTEL_VERBOSE status', () => {
  it('only treats the literal value 1 as enabled and reports the source', () => {
    expect(nextOtelVerboseStatus(false, '1')).toEqual({
      enabled: true,
      source: 'environment',
    })
    expect(nextOtelVerboseStatus(false, '0')).toEqual({
      enabled: false,
      source: 'environment',
    })
    expect(nextOtelVerboseStatus(false, 'true')).toEqual({
      enabled: false,
      source: 'unknown',
    })
    expect(nextOtelVerboseStatus(false, '')).toEqual({
      enabled: false,
      source: 'disabled',
    })
    expect(nextOtelVerboseStatus(true, undefined)).toEqual({
      enabled: true,
      source: 'config',
    })
    expect(nextOtelVerboseStatus(true, '0')).toEqual({
      enabled: false,
      source: 'environment',
    })
  })

  it('reports verbose spans as not observed when disabled and observed when present', () => {
    const store = new TelemetryStore({ now: () => 5_000 })
    store.ingest(
      envelope({
        spans: [rootSpan({ nextSpanType: 'NextNodeServer.internalDetail' })],
        errors: [],
        databaseQueries: [],
      }),
      5_000,
    )
    const disabled = computeCoverage({
      projectName: 'test-project',
      collectorVersion: '0.6.0',
      now: 5_000,
      config: config(),
      connections: [connection()],
      verbose: { enabled: false, source: 'disabled' },
      evidence: store.getCoverageEvidence(),
    })
    const disabledItem = disabled.items.find((item) => item.id === 'next.verbose-spans')
    expect(disabledItem?.status).toBe('observed')
    expect(disabledItem?.configured).toBe(false)
    expect(disabledItem?.limitations.join(' ')).toContain('Verbose tracing is disabled')

    const enabled = computeCoverage({
      projectName: 'test-project',
      collectorVersion: '0.6.0',
      now: 5_000,
      config: config(),
      connections: [connection()],
      verbose: { enabled: true, source: 'environment' },
      evidence: store.getCoverageEvidence(),
    })
    const enabledItem = enabled.items.find((item) => item.id === 'next.verbose-spans')
    expect(enabledItem?.status).toBe('observed')
    expect(enabledItem?.configured).toBe(true)
    expect(enabledItem?.evidence.spanTypes).toEqual(['NextNodeServer.internalDetail'])
  })
})
