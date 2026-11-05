import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseStackNextConfig } from '@stacknext/core'
import {
  listSnapshots,
  loadSnapshotPayload,
  snapshotExport,
  snapshotPath,
} from '@stacknext/core/snapshots'
import {
  runSnapshotDelete,
  runSnapshotExport,
  runSnapshotImport,
  runSnapshotList,
  runSnapshotSave,
  runSnapshotShow,
} from '../src/commands/snapshot.js'
import { startCollector, type CollectorHandle } from '../src/collector/server.js'
import { writeRuntimeState } from '../src/runtime.js'
import { envelope } from './fixtures.js'

const TOKEN = 'cli-snapshot-token-that-is-long-enough'

async function createProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'stacknext-cli-snapshots-'))
  await writeFile(
    path.join(root, 'package.json'),
    `${JSON.stringify(
      {
        name: 'snapshot-cli-fixture',
        private: true,
        dependencies: { next: '16.4.3', react: '19.3.1', 'react-dom': '19.3.1' },
      },
      null,
      2,
    )}\n`,
  )
  return root
}

describe('stacknext snapshot commands', () => {
  let projectDir: string
  let collector: CollectorHandle

  beforeEach(async () => {
    projectDir = await createProject()
    collector = await startCollector({
      port: 0,
      autoPort: false,
      token: TOKEN,
      projectName: 'snapshot-cli-fixture',
      dashboardDir: null,
      projectDir,
      config: parseStackNextConfig({
        snapshots: { autoOnExit: false, autoOnError: false },
      }),
      log: () => undefined,
    })
    await writeRuntimeState(projectDir, {
      version: 1,
      pid: process.pid,
      startedAt: Date.now(),
      projectDir,
      projectName: 'snapshot-cli-fixture',
      dashboardUrl: collector.url,
      collectorUrl: collector.url,
      port: collector.port,
      token: TOKEN,
    })
  })

  afterEach(async () => {
    await collector.close()
    await rm(projectDir, { recursive: true, force: true })
  })

  it('saves, lists, shows, exports and deletes a snapshot', async () => {
    const ingest = await fetch(`${collector.url}/__stacknext/v1/ingest`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(envelope()),
    })
    expect(ingest.status).toBe(202)

    expect(await runSnapshotSave({ label: 'cli sample', json: true }, projectDir)).toBe(0)
    const list = await listSnapshots(projectDir)
    expect(list.total).toBe(1)
    const snapshot = list.items[0]!
    expect(snapshot.label).toBe('cli sample')
    expect(snapshot.source).toBe('manual')

    expect(await runSnapshotList({ json: true }, projectDir)).toBe(0)
    expect(await runSnapshotShow(snapshot.id, { json: true }, projectDir)).toBe(0)

    const exportFile = path.join(projectDir, 'exported.json')
    expect(
      await runSnapshotExport(snapshot.id, { output: exportFile }, projectDir),
    ).toBe(0)
    const exported = JSON.parse(await readFile(exportFile, 'utf8')) as {
      format: string
      spans: unknown[]
    }
    expect(exported.format).toBe('stacknext-export')
    expect(exported.spans).toHaveLength(1)
    await expect(
      runSnapshotExport(snapshot.id, { output: exportFile }, projectDir),
    ).rejects.toThrow('already exists')
    expect(
      await runSnapshotExport(snapshot.id, { output: exportFile, force: true }, projectDir),
    ).toBe(0)

    await expect(runSnapshotDelete(snapshot.id, {}, projectDir)).rejects.toThrow(
      'without --yes',
    )
    expect(await runSnapshotDelete(snapshot.id, { yes: true, json: true }, projectDir)).toBe(
      0,
    )
    expect((await listSnapshots(projectDir)).total).toBe(0)
    await expect(readFile(snapshotPath(projectDir, snapshot.id), 'utf8')).rejects.toThrow()
  })

  it('imports a StackNext export and keeps the imported snapshot immutable', async () => {
    const frozen = await listSnapshots(projectDir)
    expect(frozen.total).toBe(0)

    const sourcePayload = {
      format: 'stacknext-export',
      version: 1,
      exportedAt: 10_000,
      projectName: 'source-app',
      collectorVersion: '0.6.1',
      config: parseStackNextConfig({}),
      spans: [],
      errors: [],
      databaseQueries: [],
      stats: { requests: 0, errors: 0, databaseQueries: 0, spans: 0 },
      limitations: ['Imported fixture.'],
    }
    const sourceFile = path.join(projectDir, 'import.json')
    await writeFile(sourceFile, `${JSON.stringify(sourcePayload)}\n`)

    expect(
      await runSnapshotImport(sourceFile, { label: 'cli import', json: true }, projectDir),
    ).toBe(0)
    const list = await listSnapshots(projectDir)
    expect(list.total).toBe(1)
    const imported = list.items[0]!
    expect(imported.source).toBe('import')
    expect(imported.label).toBe('cli import')

    const payload = await loadSnapshotPayload(projectDir, imported.id)
    expect(payload.source).toBe('import')
    expect(payload.limitations.join(' ')).toContain('re-redacted on import')

    const exported = snapshotExport(payload)
    expect(exported.format).toBe('stacknext-export')
  })

  it('uses the configured snapshot size cap for imports', async () => {
    await writeFile(
      path.join(projectDir, 'stacknext.config.json'),
      `${JSON.stringify({ snapshots: { maxBytes: 1_048_576 } }, null, 2)}\n`,
    )
    const sourceFile = path.join(projectDir, 'oversized.json')
    await writeFile(sourceFile, 'x'.repeat(1_100_000))
    await expect(runSnapshotImport(sourceFile, { json: true }, projectDir)).rejects.toThrow(
      '1048576 byte snapshot import limit',
    )
  })

  it('refuses to save without a running collector', async () => {
    await rm(path.join(projectDir, '.stacknext'), { recursive: true, force: true })
    await expect(runSnapshotSave({ json: true }, projectDir)).rejects.toThrow(
      'not running',
    )
  })
})
