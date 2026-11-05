import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import type { SnapshotSummary } from '@stacknext/core'
import { loadConfig } from '@stacknext/core/config-file'
import {
  SNAPSHOT_MAX_BYTES,
  SnapshotStorageError,
  importSnapshot,
  listSnapshots,
  loadSnapshotPayload,
  removeSnapshot,
  snapshotExport,
} from '@stacknext/core/snapshots'
import { collectorJson } from '../http.js'
import {
  formatBytes,
  formatDuration,
  formatRelativeTime,
  printBanner,
  printCheck,
  printSection,
  style,
} from '../output.js'
import { detectProject } from '../project.js'
import { requireRunningState } from '../session.js'
import { CLI_VERSION } from '../version.js'

/** Use the same cap as the collector so imported files stay readable. */
async function snapshotMaxBytes(projectDir: string): Promise<number> {
  try {
    const config = await loadConfig(projectDir)
    return config.snapshots.maxBytes
  } catch {
    return SNAPSHOT_MAX_BYTES
  }
}

export interface SnapshotSaveOptions {
  label?: string
  json?: boolean
}

export interface SnapshotListOptions {
  json?: boolean
  limit?: string
  offset?: string
}

export interface SnapshotShowOptions {
  json?: boolean
}

export interface SnapshotExportOptions {
  output?: string
  stdout?: boolean
  force?: boolean
}

export interface SnapshotImportOptions {
  json?: boolean
  label?: string
}

export interface SnapshotDeleteOptions {
  yes?: boolean
  json?: boolean
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid number "${value}"`)
  }
  return parsed
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

function sourceLabel(source: SnapshotSummary['source']): string {
  if (source === 'exit') return 'automatic · exit'
  if (source === 'error') return 'automatic · error'
  if (source === 'import') return 'imported'
  return 'manual'
}

export function snapshotLines(snapshot: SnapshotSummary, now = Date.now()): string[] {
  const window =
    snapshot.sample.firstEventTime !== null && snapshot.sample.lastEventTime !== null
      ? `${formatDuration(snapshot.sample.lastEventTime - snapshot.sample.firstEventTime)} sample window`
      : 'no timestamped events'
  return [
    `${style.bold(snapshot.label ?? snapshot.id)} ${style.dim(snapshot.id)}`,
    `  ${sourceLabel(snapshot.source)} · ${formatRelativeTime(snapshot.createdAt, now)} · ${formatBytes(snapshot.bytes)}`,
    `  ${snapshot.stats.requests} requests · ${snapshot.stats.spans} spans · ${snapshot.stats.errors} errors · ${snapshot.stats.databaseQueries} queries`,
    `  ${window} · ${formatDuration(snapshot.sample.retentionMs)} retention at capture`,
  ]
}

export async function runSnapshotSave(
  options: SnapshotSaveOptions,
  cwd = process.cwd(),
): Promise<number> {
  const project = await detectProject(cwd)
  const state = await requireRunningState(project.dir)
  const payload = await collectorJson<{ snapshot: SnapshotSummary }>(
    state.collectorUrl,
    '/api/snapshots',
    state.token,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(options.label ? { label: options.label } : {}),
    },
  )
  if (options.json) {
    console.log(JSON.stringify(payload.snapshot, null, 2))
    return 0
  }
  printBanner(CLI_VERSION)
  printCheck('pass', `Saved ${payload.snapshot.id}`)
  for (const line of snapshotLines(payload.snapshot)) console.log(line)
  console.log(style.dim('\nStored under .stacknext/snapshots. Snapshots are frozen and redacted.'))
  return 0
}

export async function runSnapshotList(
  options: SnapshotListOptions,
  cwd = process.cwd(),
): Promise<number> {
  const project = await detectProject(cwd)
  const result = await listSnapshots(project.dir, {
    limit: parseInteger(options.limit, 50),
    offset: parseInteger(options.offset, 0),
  })
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
    return 0
  }
  printBanner(CLI_VERSION)
  if (result.items.length === 0) {
    console.log('No saved snapshots. Run "stacknext snapshot save" while the collector is running.')
    if (result.invalid > 0) {
      console.log(style.yellow(`${result.invalid} invalid snapshot record(s) were ignored.`))
    }
    return 0
  }
  const now = Date.now()
  for (const snapshot of result.items) {
    console.log(snapshotLines(snapshot, now).join('\n'))
  }
  console.log(
    style.dim(
      `\nShowing ${result.items.length} of ${result.total} snapshot(s). Stored under .stacknext/snapshots.`,
    ),
  )
  if (result.invalid > 0) {
    console.log(style.yellow(`${result.invalid} invalid snapshot record(s) were ignored.`))
  }
  return 0
}

export async function runSnapshotShow(
  id: string,
  options: SnapshotShowOptions,
  cwd = process.cwd(),
): Promise<number> {
  const project = await detectProject(cwd)
  const maxBytes = await snapshotMaxBytes(project.dir)
  const payload = await loadSnapshotPayload(project.dir, id, { maxBytes })
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2))
    return 0
  }
  printBanner(CLI_VERSION)
  printSection('Snapshot')
  for (const line of snapshotLines({
    id: payload.id,
    createdAt: payload.createdAt,
    source: payload.source,
    projectName: payload.projectName,
    collectorVersion: payload.collectorVersion,
    ...(payload.label ? { label: payload.label } : {}),
    sample: payload.sample,
    stats: payload.stats,
    bytes: Buffer.byteLength(JSON.stringify(payload), 'utf8'),
  })) {
    console.log(line)
  }
  console.log(`\n${style.bold('Captured configuration')}`)
  console.log(
    `  retention ${formatDuration(payload.config.collector.retentionMs)} · max spans ${payload.config.collector.maxSpans} · slow threshold ${formatDuration(payload.config.slowRequestMs)}`,
  )
  console.log(`\n${style.bold('Limitations')}`)
  for (const limitation of payload.limitations) console.log(`  · ${limitation}`)
  console.log(
    style.dim(`\nUse "stacknext snapshot export ${id} --stdout" for the full redacted payload.`),
  )
  return 0
}

export async function runSnapshotExport(
  id: string,
  options: SnapshotExportOptions,
  cwd = process.cwd(),
): Promise<number> {
  if (options.output && options.stdout) {
    throw new Error('Use either --output or --stdout, not both')
  }
  const project = await detectProject(cwd)
  const maxBytes = await snapshotMaxBytes(project.dir)
  const payload = await loadSnapshotPayload(project.dir, id, { maxBytes })
  const exported = snapshotExport(payload)
  const json = `${JSON.stringify(exported, null, 2)}\n`
  if (options.stdout) {
    process.stdout.write(json)
    return 0
  }
  const file = path.resolve(
    cwd,
    options.output ?? `stacknext-snapshot-${id}-${timestamp()}.json`,
  )
  if (!options.force && (await exists(file))) {
    throw new Error(`${file} already exists. Choose another --output or pass --force.`)
  }
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, json, { mode: 0o600 })
  printSection('StackNext snapshot export')
  printCheck('pass', `Wrote ${file}`)
  printCheck(
    'pass',
    `${exported.stats.requests} requests, ${exported.stats.spans} spans, ${exported.stats.errors} errors, ${exported.stats.databaseQueries} database queries`,
  )
  console.log(
    style.dim('Snapshot exports contain redacted telemetry only and no live diagnostics.'),
  )
  return 0
}

export async function runSnapshotImport(
  file: string,
  options: SnapshotImportOptions,
  cwd = process.cwd(),
): Promise<number> {
  const project = await detectProject(cwd)
  const maxBytes = await snapshotMaxBytes(project.dir)
  const resolved = path.resolve(cwd, file)
  let info
  try {
    info = await stat(resolved)
  } catch {
    throw new Error(`${resolved} does not exist.`)
  }
  if (info.size > maxBytes) {
    throw new Error(`${resolved} is larger than the ${maxBytes} byte snapshot import limit.`)
  }
  const contents = await readFile(resolved, 'utf8')
  const snapshot = await importSnapshot(project.dir, contents, {
    maxBytes,
    ...(options.label ? { label: options.label } : {}),
  })
  if (options.json) {
    console.log(JSON.stringify(snapshot, null, 2))
    return 0
  }
  printBanner(CLI_VERSION)
  printCheck('pass', `Imported ${snapshot.id}`)
  for (const line of snapshotLines(snapshot)) console.log(line)
  console.log(
    style.dim(
      '\nImported records were normalized and redacted again before storage. Manual and imported snapshots are never auto-deleted.',
    ),
  )
  return 0
}

export async function runSnapshotDelete(
  id: string,
  options: SnapshotDeleteOptions,
  cwd = process.cwd(),
): Promise<number> {
  if (!options.yes) {
    throw new Error(`Refusing to delete ${id} without --yes.`)
  }
  const project = await detectProject(cwd)
  const removed = await removeSnapshot(project.dir, id)
  if (!removed) throw new SnapshotStorageError('not-found', `Snapshot ${id} was not found.`)
  if (options.json) {
    console.log(JSON.stringify({ deleted: true, id }, null, 2))
    return 0
  }
  printBanner(CLI_VERSION)
  printCheck('pass', `Deleted ${id}`)
  return 0
}

export function registerSnapshotCommand(program: Command, cwd: string): void {
  const snapshots = program
    .command('snapshot')
    .alias('snapshots')
    .description('Save, inspect and import frozen local telemetry snapshots')

  snapshots
    .command('save')
    .description('Save the current collector sample as a snapshot')
    .option('--label <label>', 'human-readable snapshot label (1-200 characters)')
    .option('--json', 'print machine-readable JSON')
    .action(async (options: SnapshotSaveOptions) => {
      const code = await runSnapshotSave(options, cwd)
      if (code !== 0) process.exitCode = code
    })

  snapshots
    .command('list')
    .description('List saved snapshots')
    .option('--limit <number>', 'maximum snapshots to return (1-200)')
    .option('--offset <number>', 'pagination offset')
    .option('--json', 'print machine-readable JSON')
    .action(async (options: SnapshotListOptions) => {
      const code = await runSnapshotList(options, cwd)
      if (code !== 0) process.exitCode = code
    })

  snapshots
    .command('show')
    .description('Show one snapshot summary or its full payload with --json')
    .argument('<snapshot-id>', 'snapshot id (snap-...)')
    .option('--json', 'print the full snapshot payload')
    .action(async (id: string, options: SnapshotShowOptions) => {
      const code = await runSnapshotShow(id, options, cwd)
      if (code !== 0) process.exitCode = code
    })

  snapshots
    .command('export')
    .description('Export a saved snapshot as redacted JSON')
    .argument('<snapshot-id>', 'snapshot id (snap-...)')
    .option('-o, --output <file>', 'output file path')
    .option('--stdout', 'write JSON to stdout')
    .option('--force', 'overwrite an existing output file')
    .action(async (id: string, options: SnapshotExportOptions) => {
      const code = await runSnapshotExport(id, options, cwd)
      if (code !== 0) process.exitCode = code
    })

  snapshots
    .command('import')
    .description('Import a snapshot or StackNext export JSON file')
    .argument('<file>', 'snapshot or export JSON file')
    .option('--label <label>', 'label for the imported snapshot')
    .option('--json', 'print machine-readable JSON')
    .action(async (file: string, options: SnapshotImportOptions) => {
      const code = await runSnapshotImport(file, options, cwd)
      if (code !== 0) process.exitCode = code
    })

  snapshots
    .command('delete')
    .description('Delete one saved snapshot')
    .argument('<snapshot-id>', 'snapshot id (snap-...)')
    .option('--yes', 'confirm deletion')
    .option('--json', 'print machine-readable JSON')
    .action(async (id: string, options: SnapshotDeleteOptions) => {
      const code = await runSnapshotDelete(id, options, cwd)
      if (code !== 0) process.exitCode = code
    })

  snapshots.action(async () => {
    const code = await runSnapshotList({}, cwd)
    if (code !== 0) process.exitCode = code
  })
}
