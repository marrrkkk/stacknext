import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { request as httpRequest } from 'node:http'
import {
  parseStackNextConfig,
  type DiagnosticDetailResponse,
  type DiagnosticListResponse,
  type ExportResponse,
  type HealthResponse,
  type OverviewResponse,
} from '@stacknext/core'
import {
  saveBaseline,
  saveComparison,
  saveRun,
} from '@stacknext/regression'
import { startCollector, type CollectorHandle } from '../src/collector/server.js'
import { databaseQuery, envelope, errorEvent, fetchSpan, rootSpan, TRACE } from './fixtures.js'
import {
  baselineRecord,
  comparisonRecord,
  completedRun,
  createRunRequest,
  sampleSubmission,
} from './regression-fixtures.js'

const TOKEN = 'test-token-that-is-long-enough-123456'

async function createDashboardFixture(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'stacknext-dashboard-'))
  await mkdir(path.join(dir, 'assets'), { recursive: true })
  await writeFile(
    path.join(dir, 'index.html'),
    '<!doctype html><html><body><div id="root"></div><script src="/assets/app.js"></script></body></html>',
  )
  await writeFile(path.join(dir, 'assets', 'app.js'), 'console.log("dashboard")\n')
  return dir
}

function authHeaders(token = TOKEN): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

describe('local collector', () => {
  let collector: CollectorHandle
  let dashboardDir: string

  beforeEach(async () => {
    dashboardDir = await createDashboardFixture()
    collector = await startCollector({
      port: 0,
      autoPort: false,
      token: TOKEN,
      projectName: 'collector-test',
      dashboardDir,
      config: parseStackNextConfig({ slowRequestMs: 100 }),
      log: () => undefined,
    })
  })

  afterEach(async () => {
    await collector.close()
    await rm(dashboardDir, { recursive: true, force: true })
  })

  it('ingests authenticated telemetry and serves correlated request data', async () => {
    const response = await fetch(`${collector.url}/__stacknext/v1/ingest`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(envelope()),
    })
    expect(response.status).toBe(202)
    const body = (await response.json()) as { accepted: { spans: number } }
    expect(body.accepted.spans).toBe(1)

    const healthResponse = await fetch(`${collector.url}/api/health`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    const health = (await healthResponse.json()) as HealthResponse
    expect(health.counts.requests).toBe(1)
    expect(health.counts.errors).toBe(1)
    expect(health.counts.databaseQueries).toBe(1)
    expect(health.connected).toBe(true)
    expect(health.connections).toHaveLength(1)
    expect(health.instrumentation.nextOtelVerbose).toEqual({
      enabled: false,
      source: 'disabled',
    })

    const coverageResponse = await fetch(`${collector.url}/api/coverage`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(coverageResponse.status).toBe(200)
    const coverage = (await coverageResponse.json()) as {
      projectName: string
      items: Array<{ id: string; status: string }>
      sample: { requests: number; spans: number }
      statusCounts: Record<string, number>
    }
    expect(coverage.projectName).toBe('collector-test')
    expect(coverage.sample.requests).toBe(1)
    expect(coverage.sample.spans).toBe(1)
    expect(
      coverage.items.find((item) => item.id === 'next.request-root')?.status,
    ).toBe('observed')
    expect(
      Object.values(coverage.statusCounts).reduce((sum, value) => sum + value, 0),
    ).toBe(coverage.items.length)
    expect(coverage).not.toHaveProperty('percentage')
    expect(coverage).not.toHaveProperty('score')
    for (const item of coverage.items) {
      expect(item).not.toHaveProperty('percentage')
      expect(item).not.toHaveProperty('score')
    }
    expect(JSON.stringify(coverage)).not.toContain('hunter2')

    const requestsResponse = await fetch(`${collector.url}/api/requests?status=error&slow=1`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    const requests = (await requestsResponse.json()) as {
      items: Array<{ traceId: string; errorCount: number }>
    }
    expect(requests.items).toHaveLength(1)
    expect(requests.items[0]?.errorCount).toBe(1)

    const detailResponse = await fetch(
      `${collector.url}/api/requests/${requests.items[0]?.traceId}`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    )
    expect(detailResponse.status).toBe(200)
    const detail = (await detailResponse.json()) as {
      spans: unknown[]
      errors: unknown[]
      databaseQueries: unknown[]
    }
    expect(detail.spans).toHaveLength(1)
    expect(detail.errors).toHaveLength(1)
    expect(detail.databaseQueries).toHaveLength(1)

    const summaryResponse = await fetch(`${collector.url}/api/summary`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    const summary = (await summaryResponse.json()) as {
      summary: { totalRequests: number; failedRequests: number }
      coverage: { sample: { requests: number }; items: unknown[] }
    }
    expect(summary.summary).toMatchObject({ totalRequests: 1, failedRequests: 1 })
    expect(summary.coverage.sample.requests).toBe(1)
    expect(summary.coverage.items.length).toBeGreaterThan(0)

    const dbResponse = await fetch(`${collector.url}/api/database`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    const db = (await dbResponse.json()) as {
      items: Array<{ route: string; sql: string }>
    }
    expect(db.items[0]?.route).toBe('/api/collector-test')
    expect(db.items[0]?.sql).toContain('select')
    expect(JSON.stringify(db)).not.toContain('hunter2')

    const errorsResponse = await fetch(`${collector.url}/api/errors`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    const errors = (await errorsResponse.json()) as {
      groups: Array<{ count: number }>
      items: Array<{ message: string; resolvedTraceId: string }>
    }
    expect(errors.groups[0]?.count).toBe(1)
    expect(errors.items[0]?.resolvedTraceId).toMatch(/^[0-9a-f]{32}$/)
    expect(errors.items[0]?.message).not.toContain('hunter2')
  })

  it('reports an explicit NEXT_OTEL_VERBOSE override in health', async () => {
    const verboseCollector = await startCollector({
      port: 0,
      autoPort: false,
      token: TOKEN,
      projectName: 'verbose-test',
      dashboardDir,
      config: parseStackNextConfig({}),
      nextOtelVerbose: { enabled: true, source: 'environment' },
      log: () => undefined,
    })
    try {
      const response = await fetch(`${verboseCollector.url}/api/health`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      })
      const health = (await response.json()) as HealthResponse
      expect(health.instrumentation.nextOtelVerbose).toEqual({
        enabled: true,
        source: 'environment',
      })
      const configResponse = await fetch(`${verboseCollector.url}/api/config`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      })
      const config = (await configResponse.json()) as {
        instrumentation: { nextOtelVerbose: { enabled: boolean; source: string } }
      }
      expect(config.instrumentation.nextOtelVerbose.enabled).toBe(true)
    } finally {
      await verboseCollector.close()
    }
  })

  it('rejects unauthorized, malformed, invalid and oversized ingestion payloads', async () => {
    const unauthorized = await fetch(`${collector.url}/__stacknext/v1/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(unauthorized.status).toBe(401)

    const malformed = await fetch(`${collector.url}/__stacknext/v1/ingest`, {
      method: 'POST',
      headers: authHeaders(),
      body: 'not json',
    })
    expect(malformed.status).toBe(400)

    const invalid = await fetch(`${collector.url}/__stacknext/v1/ingest`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ version: 1, spans: 'nope' }),
    })
    expect(invalid.status).toBe(422)
    expect(await invalid.text()).not.toContain(TOKEN)

    const oversized = await fetch(`${collector.url}/__stacknext/v1/ingest`, {
      method: 'POST',
      headers: authHeaders(),
      body: 'x'.repeat(2 * 1024 * 1024 + 10),
    })
    expect(oversized.status).toBe(413)

    const health = (await (
      await fetch(`${collector.url}/api/health`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      })
    ).json()) as HealthResponse
    expect(health.counts.spans).toBe(0)
    expect(health.server.droppedMalformed).toBe(2)
    expect(health.server.droppedPayload).toBe(1)
  })

  it('requires read authentication and serves a session-bound dashboard', async () => {
    const unauthorized = await fetch(`${collector.url}/api/requests`)
    expect(unauthorized.status).toBe(401)
    expect(unauthorized.headers.get('access-control-allow-origin')).toBeNull()

    const index = await fetch(`${collector.url}/`)
    expect(index.status).toBe(200)
    expect(index.headers.get('content-security-policy')).toContain("default-src 'self'")
    const setCookie = index.headers.getSetCookie()[0]
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Strict')
    const cookie = setCookie?.split(';', 1)[0] ?? ''

    const authenticated = await fetch(`${collector.url}/api/requests`, {
      headers: { cookie },
    })
    expect(authenticated.status).toBe(200)

    const asset = await fetch(`${collector.url}/assets/app.js`)
    expect(asset.status).toBe(200)
    expect(asset.headers.get('cache-control')).toContain('immutable')

    const deepLink = await fetch(`${collector.url}/requests/abc`)
    expect(deepLink.status).toBe(200)
    expect(await deepLink.text()).toContain('id="root"')
  })

  it('rejects cross-origin dashboard and API requests', async () => {
    const origin = await fetch(`${collector.url}/api/requests`, {
      headers: {
        authorization: `Bearer ${TOKEN}`,
        origin: 'https://evil.example',
      },
    })
    expect(origin.status).toBe(403)

    const crossSite = await fetch(`${collector.url}/api/requests`, {
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'sec-fetch-site': 'cross-site',
      },
    })
    expect(crossSite.status).toBe(403)

    const badHost = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: '127.0.0.1',
          port: collector.port,
          path: '/api/ping',
          headers: { host: 'evil.example' },
        },
        (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        },
      )
      req.on('error', reject)
      req.end()
    })
    expect(badHost).toBe(403)
  })

  it('streams live telemetry events over SSE', async () => {
    const controller = new AbortController()
    const response = await fetch(`${collector.url}/api/stream`, {
      headers: { authorization: `Bearer ${TOKEN}` },
      signal: controller.signal,
    })
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const reader = response.body?.getReader()
    expect(reader).toBeDefined()
    if (!reader) return
    const decoder = new TextDecoder()
    const first = await reader.read()
    expect(decoder.decode(first.value)).toContain('event: ready')

    await fetch(`${collector.url}/__stacknext/v1/ingest`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(envelope({ diagnostics: undefined })),
    })

    let output = ''
    const deadline = Date.now() + 3_000
    while (!output.includes('event: telemetry') && Date.now() < deadline) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
      ])
      if (!chunk || chunk.done) break
      output += decoder.decode(chunk.value)
    }
    expect(output).toContain('event: telemetry')
    controller.abort()
    await reader.cancel().catch(() => undefined)
  })

  it('serves deterministic diagnostics, filters and related evidence', async () => {
    const diagnosticsEnvelope = envelope({
      spans: [
        rootSpan({
          startTime: Date.now() - 2_000,
          endTime: Date.now() - 1_100,
          durationMs: 900,
          name: 'GET /api/collector-test',
        }),
        ...[1, 2, 3].map((index) =>
          fetchSpan({
            spanId: `${'2'.repeat(15)}${index}`,
            name: `fetch GET https://api.example.test/users/${index}?token=secret`,
            attributes: {
              'http.url': `https://user:password@api.example.test/users/${index}?token=secret`,
              'http.method': 'GET',
            },
            startTime: Date.now() - 1_900 + index,
            endTime: Date.now() - 1_800 + index,
            durationMs: 30,
          }),
        ),
      ],
      errors: [
        errorEvent({
          id: 'diag-error-1',
          message: 'Failure password=hunter2 token=super-secret-demo-token',
          route: '/api/collector-test',
          timestamp: Date.now() - 1_500,
        }),
        errorEvent({
          id: 'diag-error-2',
          message: 'Failure password=hunter2 token=super-secret-demo-token',
          route: '/api/other',
          timestamp: Date.now() - 1_400,
        }),
      ],
      databaseQueries: Array.from({ length: 5 }, (_, index) =>
        databaseQuery({
          id: `diag-query-${index}`,
          sql: `select * from tasks where project_id = ${index + 1}`,
          timestamp: Date.now() - 1_700 + index,
        }),
      ),
    })
    const ingest = await fetch(`${collector.url}/__stacknext/v1/ingest`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(diagnosticsEnvelope),
    })
    expect(ingest.status).toBe(202)

    const response = await fetch(`${collector.url}/api/diagnostics`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(response.status).toBe(200)
    const list = (await response.json()) as DiagnosticListResponse
    expect(list.engineVersion).toBe('0.7.0')
    expect(list.ruleSetVersion).toBe(1)
    expect(list.sample.spans).toBe(4)
    expect(list.sample.errors).toBe(2)
    expect(list.sample.databaseQueries).toBe(5)
    expect(list.counts.total).toBe(list.items.length)
    expect(list.counts.bySeverity.warning).toBeGreaterThanOrEqual(2)
    expect(list.counts.bySeverity.error).toBeGreaterThanOrEqual(1)
    expect(list.items.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining([
        'slow-span',
        'n-plus-one-queries',
        'repeated-external-http',
        'error-fingerprint',
      ]),
    )
    const serialized = JSON.stringify(list)
    for (const secret of [
      'hunter2',
      'super-secret-demo-token',
      'token=secret',
      'user:password',
      'Bearer supersecret',
    ]) {
      expect(serialized).not.toContain(secret)
    }
    expect(list.limitations.join(' ')).toContain('not confirmed root causes')

    const filtered = await fetch(
      `${collector.url}/api/diagnostics?ruleId=n-plus-one-queries&severity=warning&limit=1`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    )
    expect(filtered.status).toBe(200)
    const filteredList = (await filtered.json()) as DiagnosticListResponse
    expect(filteredList.total).toBe(1)
    expect(filteredList.items).toHaveLength(1)
    expect(filteredList.items[0]?.ruleId).toBe('n-plus-one-queries')
    expect(filteredList.limit).toBe(1)

    const invalid = await fetch(
      `${collector.url}/api/diagnostics?category=not-a-category`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    )
    expect(invalid.status).toBe(400)

    const finding = list.items.find((entry) => entry.ruleId === 'error-fingerprint')
    expect(finding).toBeDefined()
    const detailResponse = await fetch(
      `${collector.url}/api/diagnostics/${finding!.id}`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    )
    expect(detailResponse.status).toBe(200)
    const detail = (await detailResponse.json()) as DiagnosticDetailResponse
    expect(detail.finding.id).toBe(finding!.id)
    expect(detail.trace?.traceId).toBe(TRACE)
    expect(detail.trace?.errors).toHaveLength(2)
    expect(JSON.stringify(detail)).not.toContain('hunter2')
    expect(JSON.stringify(detail)).not.toContain('super-secret-demo-token')

    const unknown = await fetch(
      `${collector.url}/api/diagnostics/diag-00000000-00000000`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    )
    expect(unknown.status).toBe(404)
    const malformed = await fetch(`${collector.url}/api/diagnostics/not-an-id`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(malformed.status).toBe(400)

    const requestDetail = (await (
      await fetch(`${collector.url}/api/requests/${TRACE}`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      })
    ).json()) as { diagnostics?: Array<{ id: string }> }
    expect(requestDetail.diagnostics?.length).toBeGreaterThan(0)
    expect(requestDetail.diagnostics?.map((entry) => entry.id)).toContain(finding!.id)

    const summary = (await (
      await fetch(`${collector.url}/api/summary`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      })
    ).json()) as OverviewResponse
    expect(summary.diagnosticOverview?.counts.total).toBe(list.total)
    expect(summary.diagnosticOverview?.topFindings.length).toBeGreaterThan(0)
    expect(summary.diagnosticOverview?.limitations.length).toBeGreaterThan(0)

    const exported = (await (
      await fetch(`${collector.url}/api/export`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      })
    ).json()) as ExportResponse
    expect(exported.diagnostics?.format).toBe('stacknext-diagnostics')
    expect(exported.diagnostics?.findings.length).toBe(list.total)
    expect(JSON.stringify(exported)).not.toContain('hunter2')
  })

  it('creates runs, verifies injected correlation and downgrades incomplete completions', async () => {
    const injectedSpanId = 'e'.repeat(16)
    const ingest = await fetch(`${collector.url}/__stacknext/v1/ingest`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(
        envelope({
          spans: [rootSpan({ parentSpanId: injectedSpanId })],
          errors: [],
          databaseQueries: [],
        }),
      ),
    })
    expect(ingest.status).toBe(202)

    const createdResponse = await fetch(`${collector.url}/api/test-runs`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(createRunRequest()),
    })
    expect(createdResponse.status).toBe(201)
    const created = (await createdResponse.json()) as {
      run: { id: string; status: string; stats: { samples: number } }
    }
    expect(created.run.status).toBe('running')
    expect(created.run.stats.samples).toBe(0)

    const submission = sampleSubmission(TRACE, injectedSpanId)
    const sampleResponse = await fetch(
      `${collector.url}/api/test-runs/${created.run.id}/samples`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(submission),
      },
    )
    expect(sampleResponse.status).toBe(200)
    const sampleBody = (await sampleResponse.json()) as {
      sample: {
        correlation: { status: string; traces: Array<{ traceId: string }> }
      }
      run: { stats: { samples: number; verifiedSamples: number; traces: number } }
    }
    expect(sampleBody.sample.correlation.status).toBe('verified')
    expect(sampleBody.sample.correlation.traces[0]?.traceId).toBe(TRACE)
    expect(sampleBody.run.stats).toMatchObject({
      samples: 1,
      verifiedSamples: 1,
      traces: 1,
    })

    const duplicate = await fetch(
      `${collector.url}/api/test-runs/${created.run.id}/samples`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(submission),
      },
    )
    expect(duplicate.status).toBe(409)

    const completeResponse = await fetch(
      `${collector.url}/api/test-runs/${created.run.id}/complete`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ status: 'completed' }),
      },
    )
    expect(completeResponse.status).toBe(200)
    const completed = (await completeResponse.json()) as {
      run: { status: string; completedAt: number | null; warnings: string[] }
    }
    expect(completed.run.status).toBe('completed')
    expect(completed.run.completedAt).not.toBeNull()
    expect(completed.run.warnings).toEqual([])

    const listResponse = await fetch(`${collector.url}/api/test-runs`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    const listed = (await listResponse.json()) as {
      total: number
      items: Array<{ id: string; status: string; verifiedSamples: number }>
    }
    expect(listed.total).toBe(1)
    expect(listed.items[0]).toMatchObject({
      id: created.run.id,
      status: 'completed',
      verifiedSamples: 1,
    })

    const detailResponse = await fetch(
      `${collector.url}/api/test-runs/${created.run.id}`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    )
    expect(detailResponse.status).toBe(200)
    const detail = (await detailResponse.json()) as {
      scenarios: Array<{ samples: Array<{ correlation: { status: string } }> }>
    }
    expect(detail.scenarios[0]?.samples[0]?.correlation.status).toBe('verified')

    const incompleteCreated = (await (
      await fetch(`${collector.url}/api/test-runs`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(createRunRequest({ name: 'missing-telemetry' })),
      })
    ).json()) as { run: { id: string } }
    const incompleteSample = await fetch(
      `${collector.url}/api/test-runs/${incompleteCreated.run.id}/samples`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(
          sampleSubmission('f'.repeat(32), 'a'.repeat(16), {
            sample: {
              id: 'smp-7777777777777777',
              status: 'passed',
              expectedStatus: 'passed',
              retry: 0,
              repeatEachIndex: 0,
              durationMs: 100,
              capturedAt: 5_100,
              traces: [{ traceId: 'f'.repeat(32), injectedSpanId: 'a'.repeat(16) }],
            },
          }),
        ),
      },
    )
    const incompleteBody = (await incompleteSample.json()) as {
      sample: { correlation: { status: string; reasons: string[] } }
    }
    expect(incompleteBody.sample.correlation.status).toBe('incomplete')
    expect(incompleteBody.sample.correlation.reasons).toContain('trace-not-found')

    const downgraded = await fetch(
      `${collector.url}/api/test-runs/${incompleteCreated.run.id}/complete`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ status: 'completed' }),
      },
    )
    const downgradedBody = (await downgraded.json()) as {
      run: { status: string; warnings: string[] }
    }
    expect(downgradedBody.run.status).toBe('incomplete')
    expect(downgradedBody.run.warnings.join(' ')).toContain('No verified telemetry')

    const unauthorized = await fetch(`${collector.url}/api/test-runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createRunRequest()),
    })
    expect(unauthorized.status).toBe(401)

    const invalid = await fetch(`${collector.url}/api/test-runs`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: 'missing fields' }),
    })
    expect(invalid.status).toBe(422)
  })

  it('serves saved runs, baselines and comparisons from the project directory', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'stacknext-regression-api-'))
    const run = completedRun()
    const baseline = baselineRecord(run)
    const candidate = completedRun({
      id: 'run-8888888888888888',
      name: 'candidate-run',
      createdAt: 2_500,
      completedAt: 3_500,
    })
    const comparison = comparisonRecord(baseline, candidate)
    await saveRun(projectDir, run)
    await saveRun(projectDir, candidate)
    await saveBaseline(projectDir, baseline)
    await saveComparison(projectDir, comparison)

    const savedCollector = await startCollector({
      port: 0,
      autoPort: false,
      token: TOKEN,
      projectName: 'collector-test',
      dashboardDir,
      projectDir,
      config: parseStackNextConfig({}),
      log: () => undefined,
    })
    try {
      const headers = { authorization: `Bearer ${TOKEN}` }
      const runs = (await (
        await fetch(`${savedCollector.url}/api/test-runs`, { headers })
      ).json()) as { total: number; items: Array<{ id: string }> }
      expect(runs.total).toBe(2)
      expect(runs.items.map((item) => item.id)).toEqual(
        expect.arrayContaining([run.id, candidate.id]),
      )

      const runDetail = await fetch(`${savedCollector.url}/api/test-runs/${run.id}`, {
        headers,
      })
      expect(runDetail.status).toBe(200)
      expect(((await runDetail.json()) as { id: string }).id).toBe(run.id)

      const bulk = Array.from({ length: 201 }, (_, index) =>
        completedRun({
          id: `run-${(0x1000 + index).toString(16).padStart(16, '0')}`,
          name: `bulk-${index}`,
          createdAt: 10_000 + index,
          completedAt: 10_500 + index,
        }),
      )
      for (const record of bulk) await saveRun(projectDir, record)
      const olderRuns = (await (
        await fetch(`${savedCollector.url}/api/test-runs?offset=200&limit=1`, { headers })
      ).json()) as { total: number; items: Array<{ id: string }> }
      expect(olderRuns.total).toBe(203)
      expect(olderRuns.items).toHaveLength(1)
      expect(olderRuns.items[0]?.id).toBe(bulk[0]?.id)

      const baselines = (await (
        await fetch(`${savedCollector.url}/api/baselines`, { headers })
      ).json()) as { total: number; items: Array<{ id: string }> }
      expect(baselines.total).toBe(1)
      expect(baselines.items[0]?.id).toBe(baseline.id)

      const baselineDetail = await fetch(
        `${savedCollector.url}/api/baselines/${baseline.id}`,
        { headers },
      )
      expect(baselineDetail.status).toBe(200)
      expect(((await baselineDetail.json()) as { sourceRunId: string }).sourceRunId).toBe(
        run.id,
      )

      const comparisons = (await (
        await fetch(`${savedCollector.url}/api/comparisons`, { headers })
      ).json()) as { total: number; items: Array<{ id: string }> }
      expect(comparisons.total).toBe(1)
      expect(comparisons.items[0]?.id).toBe(comparison.id)

      const comparisonDetail = await fetch(
        `${savedCollector.url}/api/comparisons/${comparison.id}`,
        { headers },
      )
      expect(comparisonDetail.status).toBe(200)
      expect(
        ((await comparisonDetail.json()) as { candidateId: string }).candidateId,
      ).toBe(candidate.id)

      const missing = await fetch(
        `${savedCollector.url}/api/test-runs/run-0000000000000000`,
        { headers },
      )
      expect(missing.status).toBe(404)
      const malformed = await fetch(`${savedCollector.url}/api/comparisons/nope`, {
        headers,
      })
      expect(malformed.status).toBe(400)
      const unauthenticated = await fetch(`${savedCollector.url}/api/baselines`)
      expect(unauthenticated.status).toBe(401)
    } finally {
      await savedCollector.close()
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  it('exports sanitized JSON and clears memory on shutdown', async () => {
    await fetch(`${collector.url}/__stacknext/v1/ingest`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(envelope()),
    })
    const exported = await fetch(`${collector.url}/api/export`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(exported.headers.get('content-disposition')).toContain('attachment')
    const data = (await exported.json()) as ExportResponse
    expect(data.format).toBe('stacknext-export')
    expect(data.spans).toHaveLength(1)
    expect(JSON.stringify(data)).not.toContain('hunter2')
    expect(JSON.stringify(data)).not.toContain('Bearer supersecret')

    await collector.close()
    expect(collector.store.spanCount).toBe(0)
    await expect(
      fetch(`${collector.url}/api/ping`).then((response) => response.status),
    ).rejects.toThrow()
  })
})
