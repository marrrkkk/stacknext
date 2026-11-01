import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { request as httpRequest } from 'node:http'
import { parseNextScopeConfig, type ExportResponse, type HealthResponse } from '@nextscope/core'
import { startCollector, type CollectorHandle } from '../src/collector/server.js'
import { envelope } from './fixtures.js'

const TOKEN = 'test-token-that-is-long-enough-123456'

async function createDashboardFixture(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'nextscope-dashboard-'))
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
      config: parseNextScopeConfig({ slowRequestMs: 100 }),
      log: () => undefined,
    })
  })

  afterEach(async () => {
    await collector.close()
    await rm(dashboardDir, { recursive: true, force: true })
  })

  it('ingests authenticated telemetry and serves correlated request data', async () => {
    const response = await fetch(`${collector.url}/__nextscope/v1/ingest`, {
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
    }
    expect(summary.summary).toMatchObject({ totalRequests: 1, failedRequests: 1 })

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

  it('rejects unauthorized, malformed, invalid and oversized ingestion payloads', async () => {
    const unauthorized = await fetch(`${collector.url}/__nextscope/v1/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(unauthorized.status).toBe(401)

    const malformed = await fetch(`${collector.url}/__nextscope/v1/ingest`, {
      method: 'POST',
      headers: authHeaders(),
      body: 'not json',
    })
    expect(malformed.status).toBe(400)

    const invalid = await fetch(`${collector.url}/__nextscope/v1/ingest`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ version: 1, spans: 'nope' }),
    })
    expect(invalid.status).toBe(422)
    expect(await invalid.text()).not.toContain(TOKEN)

    const oversized = await fetch(`${collector.url}/__nextscope/v1/ingest`, {
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

    await fetch(`${collector.url}/__nextscope/v1/ingest`, {
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

  it('exports sanitized JSON and clears memory on shutdown', async () => {
    await fetch(`${collector.url}/__nextscope/v1/ingest`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(envelope()),
    })
    const exported = await fetch(`${collector.url}/api/export`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(exported.headers.get('content-disposition')).toContain('attachment')
    const data = (await exported.json()) as ExportResponse
    expect(data.format).toBe('nextscope-export')
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
