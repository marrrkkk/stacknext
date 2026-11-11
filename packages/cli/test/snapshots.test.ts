import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  parseStackNextConfig,
  type ExportResponse,
  type SnapshotDetailResponse,
  type SnapshotListResponse,
  type TraceDetail,
  type TraceListResult,
} from '@stacknext/core'
import {
  loadSnapshotPayload,
  snapshotPath,
  snapshotsDir,
} from '@stacknext/core/snapshots'
import { startCollector, type CollectorHandle } from '../src/collector/server.js'
import { databaseQuery, envelope, errorEvent, rootSpan, TRACE } from './fixtures.js'

const TOKEN = 'snapshot-token-that-is-long-enough-123456'

async function createProject(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'stacknext-collector-snapshots-'))
}

function authHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${TOKEN}`,
    'content-type': 'application/json',
  }
}

async function ingest(
  collector: CollectorHandle,
  body = envelope(),
): Promise<void> {
  const response = await fetch(`${collector.url}/__stacknext/v1/ingest`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  expect(response.status).toBe(202)
}

async function waitForSnapshot(
  collector: CollectorHandle,
  predicate: (snapshot: SnapshotListResponse['items'][number]) => boolean,
  timeoutMs = 5_000,
): Promise<SnapshotListResponse['items'][number]> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const response = await fetch(`${collector.url}/api/snapshots`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    const list = (await response.json()) as SnapshotListResponse
    const match = list.items.find(predicate)
    if (match) return match
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('Timed out waiting for an automatic snapshot')
}

async function startSnapshotCollector(
  projectDir: string,
  extra: { snapshotCacheBytes?: number; autoOnExit?: boolean } = {},
): Promise<CollectorHandle> {
  return startCollector({
    port: 0,
    autoPort: false,
    token: TOKEN,
    projectName: 'snapshot-api-test',
    dashboardDir: null,
    projectDir,
    config: parseStackNextConfig({
      slowRequestMs: 100,
      snapshots: {
        autoOnExit: extra.autoOnExit ?? false,
        autoOnError: false,
      },
    }),
    log: () => undefined,
    ...(extra.snapshotCacheBytes === undefined
      ? {}
      : { snapshotCacheBytes: extra.snapshotCacheBytes }),
  })
}

async function saveSnapshot(
  collector: CollectorHandle,
  label: string,
): Promise<SnapshotListResponse['items'][number]> {
  const response = await fetch(`${collector.url}/api/snapshots`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ label }),
  })
  expect(response.status).toBe(201)
  const body = (await response.json()) as {
    snapshot: SnapshotListResponse['items'][number]
  }
  return body.snapshot
}

describe('collector snapshot API', () => {
  let collector: CollectorHandle
  let projectDir: string

  beforeEach(async () => {
    projectDir = await createProject()
    collector = await startSnapshotCollector(projectDir)
  })

  afterEach(async () => {
    await collector.close()
    await rm(projectDir, { recursive: true, force: true })
  })

  it('saves, lists, reads and deletes a manual snapshot', async () => {
    await ingest(collector)

    const saveResponse = await fetch(`${collector.url}/api/snapshots`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ label: 'before index change' }),
    })
    expect(saveResponse.status).toBe(201)
    const saved = (await saveResponse.json()) as {
      snapshot: SnapshotListResponse['items'][number]
    }
    expect(saved.snapshot.source).toBe('manual')
    expect(saved.snapshot.label).toBe('before index change')
    expect(saved.snapshot.stats).toMatchObject({
      requests: 1,
      errors: 1,
      databaseQueries: 1,
      spans: 1,
    })

    const file = await stat(snapshotPath(projectDir, saved.snapshot.id))
    if (process.platform !== 'win32') {
      expect(file.mode & 0o777).toBe(0o600)
      expect((await stat(snapshotsDir(projectDir))).mode & 0o777).toBe(0o700)
    }
    const raw = await readFile(snapshotPath(projectDir, saved.snapshot.id), 'utf8')
    expect(raw).not.toContain('hunter2')
    expect(raw).not.toContain('supersecret')

    const listResponse = await fetch(`${collector.url}/api/snapshots?limit=10`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(listResponse.status).toBe(200)
    const list = (await listResponse.json()) as SnapshotListResponse
    expect(list.total).toBe(1)
    expect(list.items[0]?.id).toBe(saved.snapshot.id)

    // Use an exactly representable mtime so restoring it does not lose precision.
    await utimes(snapshotPath(projectDir, saved.snapshot.id), file.atime, new Date(1_700_000_000_000))
    const detailResponse = await fetch(
      `${collector.url}/api/snapshots/${saved.snapshot.id}`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    )
    expect(detailResponse.status).toBe(200)
    const detail = (await detailResponse.json()) as SnapshotDetailResponse
    expect(detail.snapshot.id).toBe(saved.snapshot.id)
    expect(detail.config.slowRequestMs).toBe(100)
    expect(detail.limitations.length).toBeGreaterThan(0)
    expect(detail.traces).toHaveLength(1)
    expect(detail.errors).toHaveLength(1)
    expect(detail.databaseQueries).toHaveLength(1)
    expect(detail.traces[0]?.traceId).toBe(TRACE)

    const tracesResponse = await fetch(
      `${collector.url}/api/snapshots/${saved.snapshot.id}/traces`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    )
    const traces = (await tracesResponse.json()) as TraceListResult
    expect(traces.total).toBe(1)
    expect(traces.items[0]?.request?.route).toBe('/api/collector-test')

    const traceResponse = await fetch(
      `${collector.url}/api/snapshots/${saved.snapshot.id}/traces/${TRACE}`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    )
    expect(traceResponse.status).toBe(200)
    const trace = (await traceResponse.json()) as TraceDetail
    expect(trace.spans).toHaveLength(1)
    expect(trace.errors).toHaveLength(1)
    expect(trace.databaseQueries).toHaveLength(1)
    expect(trace).not.toHaveProperty('diagnostics')

    const errorsResponse = await fetch(
      `${collector.url}/api/snapshots/${saved.snapshot.id}/errors`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    )
    expect(errorsResponse.status).toBe(200)
    const errors = (await errorsResponse.json()) as {
      items: Array<{ id: string }>
      total: number
    }
    expect(errors.total).toBe(1)
    expect(errors.items[0]?.id).toBe('test-error')

    const databaseResponse = await fetch(
      `${collector.url}/api/snapshots/${saved.snapshot.id}/database`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    )
    expect(databaseResponse.status).toBe(200)
    const database = (await databaseResponse.json()) as {
      items: Array<{ id: string }>
      total: number
    }
    expect(database.total).toBe(1)
    expect(database.items[0]?.id).toBe('test-query')

    const exportResponse = await fetch(
      `${collector.url}/api/snapshots/${saved.snapshot.id}/export`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    )
    expect(exportResponse.status).toBe(200)
    expect(exportResponse.headers.get('content-disposition')).toContain(
      saved.snapshot.id,
    )
    const exported = (await exportResponse.json()) as ExportResponse
    expect(exported.format).toBe('stacknext-export')
    expect(exported.spans).toHaveLength(1)
    expect(exported).not.toHaveProperty('diagnostics')

    // Change the saved threshold while preserving mtime: cache reuse must also
    // require ctime, and every snapshot trace endpoint must use the saved config.
    const snapshotFile = snapshotPath(projectDir, saved.snapshot.id)
    const savedStat = await stat(snapshotFile)
    const payload = await loadSnapshotPayload(projectDir, saved.snapshot.id)
    payload.config.slowRequestMs = 10_000
    await writeFile(snapshotFile, JSON.stringify(payload))
    await utimes(snapshotFile, savedStat.atime, savedStat.mtime)
    expect((await stat(snapshotFile)).mtimeMs).toBe(savedStat.mtimeMs)
    for (const suffix of ['', '/traces', `/traces/${TRACE}`]) {
      const response = await fetch(`${collector.url}/api/snapshots/${saved.snapshot.id}${suffix}`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      })
      expect(response.status).toBe(200)
      const result = await response.json()
      const request = suffix === '' ? (result as SnapshotDetailResponse).traces[0]?.request
        : suffix === '/traces' ? (result as TraceListResult).items[0]?.request : (result as TraceDetail).request
      expect(request?.slow).toBe(false)
    }

    const deleteResponse = await fetch(
      `${collector.url}/api/snapshots/${saved.snapshot.id}/`,
      { method: 'DELETE', headers: { authorization: `Bearer ${TOKEN}` } },
    )
    expect(deleteResponse.status).toBe(200)
    expect(await loadSnapshotPayload(projectDir, saved.snapshot.id).catch((error) => error))
      .toMatchObject({ code: 'not-found' })
    const afterDelete = await fetch(`${collector.url}/api/snapshots`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(((await afterDelete.json()) as SnapshotListResponse).total).toBe(0)
  })

  it('requires authorization for snapshot writes and reads', async () => {
    const save = await fetch(`${collector.url}/api/snapshots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(save.status).toBe(401)

    const list = await fetch(`${collector.url}/api/snapshots`)
    expect(list.status).toBe(401)
  })

  it('rejects cross-origin snapshot writes', async () => {
    const response = await fetch(`${collector.url}/api/snapshots`, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        origin: 'https://evil.example',
      },
      body: '{}',
    })
    expect(response.status).toBe(403)
  })

  it('validates snapshot ids and labels', async () => {
    const invalidId = await fetch(`${collector.url}/api/snapshots/snap-nope`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(invalidId.status).toBe(400)

    const invalidLabel = await fetch(`${collector.url}/api/snapshots`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ label: '' }),
    })
    expect(invalidLabel.status).toBe(422)

    const missing = await fetch(
      `${collector.url}/api/snapshots/snap-0000000000000000`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    )
    expect(missing.status).toBe(404)
  })

  it('imports a snapshot through the collector API', async () => {
    await ingest(collector)

    const saveResponse = await fetch(`${collector.url}/api/snapshots`, {
      method: 'POST',
      headers: authHeaders(),
      body: '{}',
    })
    expect(saveResponse.status).toBe(201)
    const saved = (await saveResponse.json()) as {
      snapshot: SnapshotListResponse['items'][number]
    }

    const exportResponse = await fetch(
      `${collector.url}/api/snapshots/${saved.snapshot.id}/export`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    )
    expect(exportResponse.status).toBe(200)
    const exported = await exportResponse.text()

    const importResponse = await fetch(`${collector.url}/api/snapshots/import`, {
      method: 'POST',
      headers: authHeaders(),
      body: exported,
    })
    expect(importResponse.status).toBe(201)
    const imported = (await importResponse.json()) as {
      snapshot: SnapshotListResponse['items'][number]
    }
    expect(imported.snapshot.id).not.toBe(saved.snapshot.id)
    expect(imported.snapshot.source).toBe('import')

    const detailResponse = await fetch(
      `${collector.url}/api/snapshots/${imported.snapshot.id}`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    )
    expect(detailResponse.status).toBe(200)

    const raw = await readFile(snapshotPath(projectDir, imported.snapshot.id), 'utf8')
    expect(raw).not.toContain('hunter2')
    expect(raw).not.toContain('supersecret')
  })

  it('refuses to save a manual snapshot when the sample is empty', async () => {
    const response = await fetch(`${collector.url}/api/snapshots`, {
      method: 'POST',
      headers: authHeaders(),
      body: '{}',
    })
    expect(response.status).toBe(409)
  })

  it('bounds cached snapshot views by bytes and evicts least recently used', async () => {
    await ingest(collector)
    const first = await saveSnapshot(collector, 'first')
    const second = await saveSnapshot(collector, 'second')
    const firstBytes = (await stat(snapshotPath(projectDir, first.id))).size
    const secondBytes = (await stat(snapshotPath(projectDir, second.id))).size
    expect(firstBytes).toBeGreaterThan(0)

    await collector.close()
    collector = await startSnapshotCollector(projectDir, {
      snapshotCacheBytes: Math.max(firstBytes, secondBytes),
    })

    const read = (id: string) =>
      fetch(`${collector.url}/api/snapshots/${id}`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      })

    expect((await read(first.id)).status).toBe(200)
    expect(collector.snapshotCacheStats()).toEqual({
      entries: 1,
      bytes: firstBytes,
    })

    expect((await read(second.id)).status).toBe(200)
    expect(collector.snapshotCacheStats()).toEqual({
      entries: 1,
      bytes: secondBytes,
    })

    // Touching the first snapshot again evicts the second, proving LRU order.
    expect((await read(first.id)).status).toBe(200)
    expect(collector.snapshotCacheStats()).toEqual({
      entries: 1,
      bytes: firstBytes,
    })
  })

  it('serves snapshots larger than the cache budget without retaining them', async () => {
    await ingest(collector)
    const saved = await saveSnapshot(collector, 'oversized')
    const bytes = (await stat(snapshotPath(projectDir, saved.id))).size

    await collector.close()
    collector = await startSnapshotCollector(projectDir, {
      snapshotCacheBytes: Math.max(0, bytes - 1),
    })

    const response = await fetch(`${collector.url}/api/snapshots/${saved.id}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(response.status).toBe(200)
    expect(collector.snapshotCacheStats()).toEqual({ entries: 0, bytes: 0 })
  })

  it('saves an exit snapshot only when auto-save on exit is enabled', async () => {
    await ingest(collector)
    expect(await collector.saveSnapshotOnExit()).toBeNull()

    await collector.close()
    collector = await startSnapshotCollector(projectDir, { autoOnExit: true })
    await ingest(collector)
    const saved = await collector.saveSnapshotOnExit()
    expect(saved?.source).toBe('exit')
    expect(saved?.stats.spans).toBe(1)
    const loaded = await loadSnapshotPayload(projectDir, saved!.id)
    expect(loaded.source).toBe('exit')
  })
})

describe('collector automatic snapshots', () => {
  let collector: CollectorHandle
  let projectDir: string

  beforeEach(async () => {
    projectDir = await createProject()
    collector = await startCollector({
      port: 0,
      autoPort: false,
      token: TOKEN,
      projectName: 'snapshot-auto-test',
      dashboardDir: null,
      projectDir,
      config: parseStackNextConfig({
        slowRequestMs: 100,
        snapshots: { autoOnExit: false, autoOnError: true, autoKeep: 2 },
      }),
      log: () => undefined,
    })
  })

  afterEach(async () => {
    await collector.close()
    await rm(projectDir, { recursive: true, force: true })
  })

  it('writes one automatic error snapshot for a failing sample', async () => {
    await ingest(
      collector,
      envelope({
        spans: [rootSpan({ status: 'error', statusCode: 500 })],
        errors: [errorEvent()],
        databaseQueries: [databaseQuery()],
      }),
    )
    const snapshot = await waitForSnapshot(collector, (item) => item.source === 'error')
    expect(snapshot.stats.errors).toBe(1)

    const response = await fetch(
      `${collector.url}/api/snapshots/${snapshot.id}/traces/${TRACE}`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    )
    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain('hunter2')
  })

  it('does not save an error snapshot when the sample has no telemetry', async () => {
    await ingest(
      collector,
      envelope({ spans: [], errors: [], databaseQueries: [] }),
    )
    await new Promise((resolve) => setTimeout(resolve, 100))
    const response = await fetch(`${collector.url}/api/snapshots`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    const list = (await response.json()) as SnapshotListResponse
    expect(list.total).toBe(0)
  })
})
