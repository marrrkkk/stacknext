import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  createSnapshotPayload,
  createSnapshotView,
  importSnapshot,
  listSnapshots,
  loadSnapshotPayload,
  loadSnapshotSummary,
  newSnapshotId,
  removeSnapshot,
  rotateAutomaticSnapshots,
  saveSnapshot,
  snapshotExport,
  snapshotPath,
  snapshotSummaryPath,
  SnapshotStorageError,
} from '../src/snapshots.js'
import { parseStackNextConfig } from '../src/config.js'
import { TelemetryStore } from '../src/store.js'
import type { SnapshotPayload, SnapshotSource } from '../src/types.js'
import { TRACE_ID, envelope } from './fixtures.js'

const CONFIG = parseStackNextConfig({})

function createStore(): TelemetryStore {
  const store = new TelemetryStore({ now: () => 10_000 })
  store.ingest(envelope(), 10_000)
  return store
}

type PayloadOverrides = Partial<
  Pick<
    SnapshotPayload,
    | 'id'
    | 'createdAt'
    | 'source'
    | 'projectName'
    | 'collectorVersion'
    | 'label'
  >
>

function payload(overrides: PayloadOverrides = {}): SnapshotPayload {
  return createSnapshotPayload({
    store: createStore(),
    source: 'manual',
    projectName: 'snapshot-test',
    collectorVersion: '0.6.1',
    config: CONFIG,
    createdAt: 20_000,
    ...overrides,
  })
}

function fixedId(character: string): string {
  return `snap-${character.repeat(16)}`
}

async function temporaryProject(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'stacknext-snapshots-'))
}

describe('snapshot storage', () => {
  it('freezes a redacted payload from the current sample', () => {
    const frozen = payload()

    expect(frozen.format).toBe('stacknext-snapshot')
    expect(frozen.version).toBe(1)
    expect(frozen.source).toBe('manual')
    expect(frozen.stats).toEqual({
      requests: 1,
      errors: 1,
      databaseQueries: 1,
      spans: 2,
    })
    expect(frozen.sample).toMatchObject({
      firstEventTime: 1_000,
      lastEventTime: 1_050,
      retentionMs: 600_000,
    })
    expect(frozen.limitations.length).toBeGreaterThan(0)
    expect(frozen.limitations.join(' ')).toContain('not live telemetry')
    expect(frozen.spans).toHaveLength(2)

    const serialized = JSON.stringify(frozen)
    expect(serialized).not.toContain('super-secret')
    expect(serialized).not.toContain('hunter2')
    expect(serialized).not.toContain('Bearer abcdefghijklmnop')
    expect(serialized).not.toContain('session=secret')
    expect(serialized).not.toContain('private-host')
  })

  it('saves, lists, loads and removes snapshots with private permissions', async () => {
    const projectDir = await temporaryProject()
    try {
      const first = payload({ id: fixedId('a'), createdAt: 20_000, label: 'first' })
      const second = payload({ id: fixedId('b'), createdAt: 30_000 })
      const firstSummary = await saveSnapshot(projectDir, first)
      const secondSummary = await saveSnapshot(projectDir, second)

      expect(firstSummary.bytes).toBeGreaterThan(0)
      expect(firstSummary.label).toBe('first')
      expect(secondSummary.stats.spans).toBe(2)

      const list = await listSnapshots(projectDir)
      expect(list.total).toBe(2)
      expect(list.invalid).toBe(0)
      expect(list.items.map((item) => item.id)).toEqual([fixedId('b'), fixedId('a')])

      const loaded = await loadSnapshotPayload(projectDir, fixedId('a'))
      expect(loaded.id).toBe(fixedId('a'))
      expect(loaded.label).toBe('first')
      expect(loaded.spans).toHaveLength(2)

      const summary = await loadSnapshotSummary(projectDir, fixedId('a'))
      expect(summary.stats).toEqual(firstSummary.stats)
      expect(summary.bytes).toBe(firstSummary.bytes)

      const file = await stat(snapshotPath(projectDir, fixedId('a')))
      const sidecar = await stat(snapshotSummaryPath(projectDir, fixedId('a')))
      const directory = await stat(path.dirname(snapshotPath(projectDir, fixedId('a'))))
      if (process.platform !== 'win32') {
        expect(file.mode & 0o777).toBe(0o600)
        expect(sidecar.mode & 0o777).toBe(0o600)
        expect(directory.mode & 0o777).toBe(0o700)
      }

      expect(await removeSnapshot(projectDir, fixedId('a'))).toBe(true)
      expect(await removeSnapshot(projectDir, fixedId('a'))).toBe(false)
      const after = await listSnapshots(projectDir)
      expect(after.items.map((item) => item.id)).toEqual([fixedId('b')])
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  it('never overwrites an existing snapshot implicitly', async () => {
    const projectDir = await temporaryProject()
    try {
      const frozen = payload({ id: fixedId('c') })
      await saveSnapshot(projectDir, frozen)
      await expect(saveSnapshot(projectDir, frozen)).rejects.toMatchObject({
        code: 'exists',
      })
      const loaded = await loadSnapshotPayload(projectDir, fixedId('c'))
      expect(loaded.createdAt).toBe(frozen.createdAt)
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  it('fails oversized snapshots without writing partial files', async () => {
    const projectDir = await temporaryProject()
    try {
      await expect(
        saveSnapshot(projectDir, payload({ id: fixedId('d') }), { maxBytes: 32 }),
      ).rejects.toMatchObject({ code: 'too-large' })
      const list = await listSnapshots(projectDir)
      expect(list.total).toBe(0)
      expect(list.invalid).toBe(0)
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  it('rotates automatic snapshots but never manual or imported ones', async () => {
    const projectDir = await temporaryProject()
    try {
      const sources: SnapshotSource[] = ['exit', 'error', 'exit', 'error', 'exit']
      for (let index = 0; index < sources.length; index += 1) {
        await saveSnapshot(
          projectDir,
          payload({
            id: fixedId(String(index + 1)),
            source: sources[index]!,
            createdAt: 10_000 + index,
          }),
        )
      }
      await saveSnapshot(
        projectDir,
        payload({ id: fixedId('e'), source: 'manual', createdAt: 1 }),
      )
      await saveSnapshot(
        projectDir,
        payload({ id: fixedId('f'), source: 'import', createdAt: 2 }),
      )

      const removed = await rotateAutomaticSnapshots(projectDir, 2)
      expect(removed.sort()).toEqual([fixedId('1'), fixedId('2'), fixedId('3')])

      const remaining = await listSnapshots(projectDir)
      expect(remaining.total).toBe(4)
      expect(remaining.items.map((item) => item.id).sort()).toEqual(
        [fixedId('4'), fixedId('5'), fixedId('e'), fixedId('f')].sort(),
      )
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  it('counts unreadable summary records without repairing or deleting them', async () => {
    const projectDir = await temporaryProject()
    try {
      await saveSnapshot(projectDir, payload({ id: fixedId('1') }))
      await writeFile(
        snapshotSummaryPath(projectDir, fixedId('2')),
        '{"format":"broken"}\n',
        'utf8',
      )
      const list = await listSnapshots(projectDir)
      expect(list.total).toBe(1)
      expect(list.invalid).toBe(1)
      expect(await readFile(snapshotSummaryPath(projectDir, fixedId('2')), 'utf8')).toContain(
        'broken',
      )
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  it('imports exports with a fresh id, a label and a second redaction pass', async () => {
    const projectDir = await temporaryProject()
    try {
      const exportFile = {
        format: 'stacknext-export',
        version: 1,
        exportedAt: 5_000,
        projectName: 'imported-app',
        collectorVersion: '0.6.1',
        config: CONFIG,
        spans: [
          {
            traceId: TRACE_ID,
            spanId: '1111111111111111',
            name: 'GET /api/import?token=super-secret',
            kind: 'server',
            startTime: 1_000,
            endTime: 1_100,
            durationMs: 100,
            status: 'ok',
            serviceName: 'imported-app',
            route: '/api/import?token=super-secret',
            method: 'GET',
            statusCode: 200,
            attributes: {
              authorization: 'Bearer supersecret',
              'http.url': 'https://example.test/path?access_token=secret',
            },
            events: [],
            resource: { 'service.name': 'imported-app', 'host.name': 'private-host' },
            receivedAt: 1_100,
          },
        ],
        errors: [
          {
            id: 'import-error',
            fingerprint: 'stale-fingerprint',
            message: 'Failed postgres://user:hunter2@db.test/app?token=secret',
            name: 'Error',
            stack: 'Error: failed\n    at handler (/app/route.ts:1:1)',
            timestamp: 1_050,
            route: '/api/import',
            method: 'GET',
            requestPath: '/api/import?token=super-secret',
            traceId: TRACE_ID,
            spanId: '1111111111111111',
            attributes: { cookie: 'session=secret' },
            receivedAt: 1_050,
          },
        ],
        databaseQueries: [
          {
            id: 'import-query',
            traceId: TRACE_ID,
            spanId: '1111111111111111',
            timestamp: 1_040,
            durationMs: 4,
            sql: "select * from users where email = 'secret@example.test' and password = 'hunter2'",
            databaseSystem: 'sqlite',
            success: true,
            source: 'drizzle',
            attributes: {},
            receivedAt: 1_040,
          },
        ],
        stats: { requests: 1, errors: 1, databaseQueries: 1, spans: 1 },
        limitations: ['Imported from a previous StackNext version.'],
      }

      const summary = await importSnapshot(projectDir, JSON.stringify(exportFile), {
        label: 'imported sample',
        createdAt: 60_000,
      })
      expect(summary.id).not.toBe(exportFile.spans[0]?.traceId)
      expect(summary.source).toBe('import')
      expect(summary.label).toBe('imported sample')
      expect(summary.stats.requests).toBe(1)
      expect(summary.sample.firstEventTime).toBe(1_000)
      expect(summary.sample.lastEventTime).toBe(1_050)

      const loaded = await loadSnapshotPayload(projectDir, summary.id)
      expect(loaded.source).toBe('import')
      expect(loaded.label).toBe('imported sample')
      expect(loaded.limitations.join(' ')).toContain('re-redacted on import')
      expect(loaded.spans[0]?.route).toBe('/api/import')
      expect(loaded.spans[0]?.name).not.toContain('super-secret')
      expect(loaded.errors[0]?.fingerprint).not.toBe('stale-fingerprint')
      expect(loaded.errors[0]?.requestPath).toBe('/api/import')
      expect(loaded.databaseQueries[0]?.sql).not.toContain('hunter2')

      const serialized = await readFile(snapshotPath(projectDir, summary.id), 'utf8')
      expect(serialized).not.toContain('hunter2')
      expect(serialized).not.toContain('super-secret')
      expect(serialized).not.toContain('session=secret')
      expect(serialized).not.toContain('private-host')
      expect(serialized).not.toContain('Bearer supersecret')
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  it('rejects unrecognized or malformed imports', async () => {
    const projectDir = await temporaryProject()
    try {
      await expect(importSnapshot(projectDir, 'not json')).rejects.toMatchObject({
        code: 'invalid',
      })
      await expect(
        importSnapshot(projectDir, JSON.stringify({ format: 'unknown', version: 1 })),
      ).rejects.toMatchObject({ code: 'invalid' })
      await expect(
        importSnapshot(projectDir, JSON.stringify({ format: 'stacknext-export' })),
      ).rejects.toMatchObject({ code: 'invalid' })
      const list = await listSnapshots(projectDir)
      expect(list.total).toBe(0)
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  it('builds a detached view that keeps old records readable', () => {
    const frozen = payload({ createdAt: 10 * 60_000 })
    const view = createSnapshotView(frozen)

    const traces = view.listTraces({}, CONFIG.slowRequestMs)
    expect(traces.total).toBe(1)
    expect(traces.items[0]?.traceId).toBe(TRACE_ID)

    const detail = view.getTrace(TRACE_ID, CONFIG.slowRequestMs)
    expect(detail?.spans).toHaveLength(2)
    expect(detail?.errors).toHaveLength(1)
    expect(detail?.databaseQueries).toHaveLength(1)
    expect(detail?.diagnostics).toBeUndefined()

    const exported = view.exportAll()
    expect(exported.spans).toHaveLength(2)
    expect(exported.errors).toHaveLength(1)
    expect(exported.databaseQueries).toHaveLength(1)
  })

  it('exports a snapshot in the standard export shape without diagnostics', () => {
    const frozen = payload()
    const exported = snapshotExport(frozen)
    expect(exported.format).toBe('stacknext-export')
    expect(exported.version).toBe(1)
    expect(exported.exportedAt).toBe(frozen.createdAt)
    expect(exported.projectName).toBe(frozen.projectName)
    expect(exported.stats).toEqual(frozen.stats)
    expect(exported.limitations[0]).toContain(frozen.id)
    expect(exported).not.toHaveProperty('diagnostics')
    expect(exported.spans).toHaveLength(2)
  })

  it('generates unique snapshot ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newSnapshotId()))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id).toMatch(/^snap-[0-9a-f]{16}$/)
  })
})

describe('snapshot errors', () => {
  it('rejects invalid ids before touching the filesystem', async () => {
    const projectDir = await temporaryProject()
    try {
      await expect(loadSnapshotPayload(projectDir, '../run.json')).rejects.toBeInstanceOf(
        SnapshotStorageError,
      )
      await expect(removeSnapshot(projectDir, 'snap-nope')).rejects.toMatchObject({
        code: 'invalid',
      })
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  it('does not expose local filesystem paths in read errors', async () => {
    const projectDir = await temporaryProject()
    try {
      const error = await loadSnapshotPayload(projectDir, fixedId('a')).catch(
        (caught: unknown) => caught,
      )
      expect(error).toBeInstanceOf(SnapshotStorageError)
      expect((error as SnapshotStorageError).message).not.toContain(projectDir)
      expect((error as SnapshotStorageError).message).not.toContain('.stacknext')
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })
})
