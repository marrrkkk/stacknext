import { randomBytes } from 'node:crypto'
import {
  access,
  chmod,
  link,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import type { z } from 'zod'
import { parseStackNextConfig, type StackNextConfig } from './config.js'
import { normalizeDatabaseQuery, normalizeError, normalizeSpan } from './normalize.js'
import {
  snapshotImportSchema,
  snapshotPayloadSchema,
  snapshotSummarySchema,
} from './schema.js'
import { TelemetryStore } from './store.js'
import type {
  ExportResponse,
  SnapshotPayload,
  SnapshotSample,
  SnapshotSource,
  SnapshotStats,
  SnapshotSummary,
  StackNextDatabaseQuery,
  StackNextError,
  StackNextSpan,
} from './types.js'

export const SNAPSHOTS_DIR_NAME = 'snapshots'
export const SNAPSHOT_MAX_BYTES = 64 * 1024 * 1024
const SUMMARY_MAX_BYTES = 1024 * 1024

export const SNAPSHOT_LIMITATIONS = [
  'A snapshot is a frozen, redacted copy of one collector sample. It is not live telemetry.',
  'Diagnostics and coverage are not stored in a snapshot; both describe the live sample only.',
  'Bodies, headers, cookies, URL query values and SQL bind parameters are never captured.',
  'Drizzle query durations remain null because the adapter cannot measure them.',
  'Edge Runtime and production deployments are not supported.',
]

export const AUTOMATIC_SNAPSHOT_SOURCES: readonly SnapshotSource[] = ['exit', 'error']

export class SnapshotStorageError extends Error {
  readonly code: 'exists' | 'invalid' | 'too-large' | 'not-found'

  constructor(code: SnapshotStorageError['code'], message: string) {
    super(message)
    this.name = 'SnapshotStorageError'
    this.code = code
  }
}

export function snapshotsDir(projectDir: string): string {
  return path.join(projectDir, '.stacknext', SNAPSHOTS_DIR_NAME)
}

export function snapshotPath(projectDir: string, id: string): string {
  return path.join(snapshotsDir(projectDir), `${id}.json`)
}

export function snapshotSummaryPath(projectDir: string, id: string): string {
  return path.join(snapshotsDir(projectDir), `${id}.summary.json`)
}

export function isSnapshotId(value: string): boolean {
  return /^snap-[0-9a-f]{16}$/.test(value)
}

export function newSnapshotId(): string {
  return `snap-${randomBytes(8).toString('hex')}`
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

export async function ensureSnapshotDirs(projectDir: string): Promise<void> {
  const root = path.join(projectDir, '.stacknext')
  await mkdir(root, { recursive: true, mode: 0o700 })
  await chmod(root, 0o700).catch(() => undefined)
  const gitignore = path.join(root, '.gitignore')
  try {
    await writeFile(gitignore, '*\n', { mode: 0o600, flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  const directory = snapshotsDir(projectDir)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700).catch(() => undefined)
}

async function writeAtomic(
  file: string,
  body: string,
  maxBytes: number,
  overwrite = false,
): Promise<number> {
  const bytes = Buffer.byteLength(body, 'utf8')
  if (bytes > maxBytes) {
    throw new SnapshotStorageError(
      'too-large',
      `Snapshot is ${bytes} bytes, which exceeds the ${maxBytes} byte limit. Nothing was written. Reduce collector retention or raise snapshots.maxBytes.`,
    )
  }
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await chmod(path.dirname(file), 0o700).catch(() => undefined)
  if (!overwrite && (await exists(file))) {
    throw new SnapshotStorageError(
      'exists',
      'Snapshot record already exists and snapshots are never overwritten implicitly.',
    )
  }
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(temporary, body, { mode: 0o600, flag: 'wx' })
    await chmod(temporary, 0o600).catch(() => undefined)
    if (overwrite) {
      await rename(temporary, file)
      return bytes
    }
    try {
      await link(temporary, file)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EEXIST') {
        throw new SnapshotStorageError(
          'exists',
          'Snapshot record already exists and snapshots are never overwritten implicitly.',
        )
      }
      if (code === 'EPERM' || code === 'ENOSYS' || code === 'EOPNOTSUPP') {
        if (await exists(file)) {
          throw new SnapshotStorageError(
            'exists',
            'Snapshot record already exists and snapshots are never overwritten implicitly.',
          )
        }
        await rename(temporary, file)
        return bytes
      }
      throw error
    } finally {
      await unlink(temporary).catch(() => undefined)
    }
    return bytes
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}

async function readJson<T>(
  file: string,
  schema: z.ZodType<T>,
  maxBytes: number,
  label: string,
): Promise<T> {
  let info
  try {
    info = await stat(file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new SnapshotStorageError('not-found', `${label} record does not exist.`)
    }
    throw error
  }
  if (info.size > maxBytes) {
    throw new SnapshotStorageError(
      'too-large',
      `${label} record is larger than the ${maxBytes} byte limit.`,
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'))
  } catch {
    throw new SnapshotStorageError('invalid', `${label} record is not valid JSON.`)
  }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new SnapshotStorageError(
      'invalid',
      `${label} record failed validation: ${result.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')}`,
    )
  }
  return result.data
}

function latestTime(
  spans: StackNextSpan[],
  errors: StackNextError[],
  queries: StackNextDatabaseQuery[],
): { first: number | null; last: number | null } {
  const times = [
    ...spans.map((span) => span.startTime),
    ...errors.map((error) => error.timestamp),
    ...queries.map((query) => query.timestamp),
  ]
  if (times.length === 0) return { first: null, last: null }
  return { first: Math.min(...times), last: Math.max(...times) }
}

export interface CreateSnapshotOptions {
  store: TelemetryStore
  id?: string
  createdAt?: number
  source: SnapshotSource
  projectName: string
  collectorVersion: string
  config: StackNextConfig
  label?: string
  slowRequestMs?: number
}

/** Builds a redacted snapshot payload from the current in-memory sample. */
export function createSnapshotPayload(options: CreateSnapshotOptions): SnapshotPayload {
  const data = options.store.exportAll()
  const summary = options.store.summary(options.slowRequestMs ?? 500)
  const times = latestTime(data.spans, data.errors, data.databaseQueries)
  return {
    format: 'stacknext-snapshot',
    version: 1,
    id: options.id ?? newSnapshotId(),
    createdAt: options.createdAt ?? Date.now(),
    source: options.source,
    projectName: options.projectName,
    collectorVersion: options.collectorVersion,
    ...(options.label ? { label: options.label.slice(0, 200) } : {}),
    config: options.config,
    sample: {
      firstEventTime: times.first ?? summary.firstEventTime,
      lastEventTime: times.last ?? summary.lastEventTime,
      retentionMs: options.store.retentionMs,
    },
    spans: data.spans,
    errors: data.errors,
    databaseQueries: data.databaseQueries,
    stats: {
      requests: summary.totalRequests,
      errors: data.errors.length,
      databaseQueries: data.databaseQueries.length,
      spans: data.spans.length,
    },
    limitations: [...SNAPSHOT_LIMITATIONS],
  }
}

export function snapshotSummary(payload: SnapshotPayload, bytes: number): SnapshotSummary {
  return {
    id: payload.id,
    createdAt: payload.createdAt,
    source: payload.source,
    projectName: payload.projectName,
    collectorVersion: payload.collectorVersion,
    ...(payload.label ? { label: payload.label } : {}),
    sample: payload.sample,
    stats: payload.stats,
    bytes,
  }
}

export interface SaveSnapshotOptions {
  maxBytes?: number
}

export async function saveSnapshot(
  projectDir: string,
  payload: SnapshotPayload,
  options: SaveSnapshotOptions = {},
): Promise<SnapshotSummary> {
  const parsed = snapshotPayloadSchema.parse(payload)
  await ensureSnapshotDirs(projectDir)
  const body = `${JSON.stringify(parsed)}\n`
  const bytes = await writeAtomic(
    snapshotPath(projectDir, parsed.id),
    body,
    options.maxBytes ?? SNAPSHOT_MAX_BYTES,
  )
  const summary = snapshotSummary(parsed, bytes)
  try {
    await writeAtomic(
      snapshotSummaryPath(projectDir, parsed.id),
      `${JSON.stringify(snapshotSummarySchema.parse(summary))}\n`,
      SUMMARY_MAX_BYTES,
    )
  } catch (error) {
    await rm(snapshotPath(projectDir, parsed.id), { force: true }).catch(() => undefined)
    throw error
  }
  return summary
}

export async function loadSnapshotPayload(
  projectDir: string,
  id: string,
  options: SaveSnapshotOptions = {},
): Promise<SnapshotPayload> {
  if (!isSnapshotId(id)) {
    throw new SnapshotStorageError('invalid', `Invalid snapshot id "${id}".`)
  }
  return readJson(
    snapshotPath(projectDir, id),
    snapshotPayloadSchema,
    options.maxBytes ?? SNAPSHOT_MAX_BYTES,
    'Snapshot',
  )
}

export async function loadSnapshotSummary(
  projectDir: string,
  id: string,
): Promise<SnapshotSummary> {
  if (!isSnapshotId(id)) {
    throw new SnapshotStorageError('invalid', `Invalid snapshot id "${id}".`)
  }
  return readJson(
    snapshotSummaryPath(projectDir, id),
    snapshotSummarySchema,
    SUMMARY_MAX_BYTES,
    'Snapshot summary',
  )
}

async function readSummaries(
  projectDir: string,
): Promise<{ items: SnapshotSummary[]; invalid: number }> {
  let names: string[]
  try {
    names = await readdir(snapshotsDir(projectDir))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { items: [], invalid: 0 }
    }
    throw error
  }
  const items: SnapshotSummary[] = []
  let invalid = 0
  for (const name of names) {
    if (!/^snap-[0-9a-f]{16}\.summary\.json$/.test(name)) continue
    const id = name.slice(0, -'.summary.json'.length)
    try {
      if (!(await exists(snapshotPath(projectDir, id)))) {
        invalid += 1
        continue
      }
      items.push(await loadSnapshotSummary(projectDir, id))
    } catch {
      invalid += 1
    }
  }
  items.sort(
    (left, right) =>
      right.createdAt - left.createdAt ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  )
  return { items, invalid }
}

export interface SnapshotListOptions {
  limit?: number
  offset?: number
}

export async function listSnapshots(
  projectDir: string,
  options: SnapshotListOptions = {},
): Promise<{
  items: SnapshotSummary[]
  total: number
  limit: number
  offset: number
  invalid: number
}> {
  const records = await readSummaries(projectDir)
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  return {
    items: records.items.slice(offset, offset + limit),
    total: records.items.length,
    limit,
    offset,
    invalid: records.invalid,
  }
}

export async function listAllSnapshots(
  projectDir: string,
): Promise<{ items: SnapshotSummary[]; invalid: number }> {
  return readSummaries(projectDir)
}

export async function removeSnapshot(projectDir: string, id: string): Promise<boolean> {
  if (!isSnapshotId(id)) {
    throw new SnapshotStorageError('invalid', `Invalid snapshot id "${id}".`)
  }
  const file = snapshotPath(projectDir, id)
  const present = await exists(file)
  await rm(file, { force: true })
  await rm(snapshotSummaryPath(projectDir, id), { force: true })
  return present
}

/**
 * Deletes only automatic snapshots beyond the newest `keep`. Manual and
 * imported snapshots are never removed by rotation.
 */
export async function rotateAutomaticSnapshots(
  projectDir: string,
  keep: number,
): Promise<string[]> {
  const records = await readSummaries(projectDir)
  const automatic = records.items
    .filter((item) => AUTOMATIC_SNAPSHOT_SOURCES.includes(item.source))
    .sort((left, right) => right.createdAt - left.createdAt)
  const removed: string[] = []
  for (const item of automatic.slice(Math.max(0, keep))) {
    if (await removeSnapshot(projectDir, item.id)) removed.push(item.id)
  }
  return removed
}

/**
 * Creates a detached read-only store for a snapshot. The clock is pinned to
 * the save time and the retention window is widened so imported records never
 * expire while the snapshot is being viewed.
 */
export function createSnapshotView(payload: SnapshotPayload): TelemetryStore {
  const receivedTimes = [
    ...payload.spans.map((span) => span.receivedAt),
    ...payload.errors.map((error) => error.receivedAt),
    ...payload.databaseQueries.map((query) => query.receivedAt),
  ]
  const earliest = receivedTimes.length > 0 ? Math.min(...receivedTimes) : payload.createdAt
  const retentionMs = Math.max(
    payload.config.collector.retentionMs,
    payload.createdAt - earliest + 1,
  )
  const store = new TelemetryStore({
    maxSpans: Math.max(
      payload.config.collector.maxSpans,
      payload.spans.length,
      payload.errors.length * 5,
      payload.databaseQueries.length * 2,
      100,
    ),
    retentionMs,
    now: () => payload.createdAt,
  })
  store.restore({
    spans: payload.spans,
    errors: payload.errors,
    databaseQueries: payload.databaseQueries,
  })
  return store
}

export function snapshotExport(payload: SnapshotPayload): ExportResponse {
  return {
    format: 'stacknext-export',
    version: 1,
    exportedAt: payload.createdAt,
    projectName: payload.projectName,
    collectorVersion: payload.collectorVersion,
    config: payload.config,
    spans: payload.spans,
    errors: payload.errors,
    databaseQueries: payload.databaseQueries,
    stats: payload.stats,
    limitations: [
      `Export generated from ${payload.id} (${payload.source}).`,
      ...payload.limitations,
    ],
  }
}

function recomputePayload(
  source: Omit<SnapshotPayload, 'sample' | 'stats'>,
  config: StackNextConfig,
): { sample: SnapshotSample; stats: SnapshotStats } {
  const view = createSnapshotView({
    ...source,
    config,
    sample: { firstEventTime: null, lastEventTime: null, retentionMs: config.collector.retentionMs },
    stats: { requests: 0, errors: 0, databaseQueries: 0, spans: 0 },
  })
  const summary = view.summary(config.slowRequestMs)
  const times = latestTime(source.spans, source.errors, source.databaseQueries)
  return {
    sample: {
      firstEventTime: times.first,
      lastEventTime: times.last,
      retentionMs: config.collector.retentionMs,
    },
    stats: {
      requests: summary.totalRequests,
      errors: source.errors.length,
      databaseQueries: source.databaseQueries.length,
      spans: source.spans.length,
    },
  }
}

function sanitizeImportedRecords(parsed: {
  spans: StackNextSpan[]
  errors: StackNextError[]
  databaseQueries: StackNextDatabaseQuery[]
}): {
  spans: StackNextSpan[]
  errors: StackNextError[]
  databaseQueries: StackNextDatabaseQuery[]
} {
  return {
    spans: parsed.spans.map((span) => normalizeSpan(span, span.receivedAt)),
    errors: parsed.errors.map((error) => normalizeError(error, error.receivedAt)),
    databaseQueries: parsed.databaseQueries.map((query) =>
      normalizeDatabaseQuery(query, query.receivedAt),
    ),
  }
}

export interface ImportSnapshotOptions {
  maxBytes?: number
  label?: string
  createdAt?: number
}

/**
 * Imports a snapshot payload or a StackNext export. Imported records are
 * normalized and redacted again before being written, and always receive a
 * fresh snapshot id.
 */
export async function importSnapshot(
  projectDir: string,
  contents: string,
  options: ImportSnapshotOptions = {},
): Promise<SnapshotSummary> {
  if (Buffer.byteLength(contents, 'utf8') > (options.maxBytes ?? SNAPSHOT_MAX_BYTES)) {
    throw new SnapshotStorageError(
      'too-large',
      `Import is larger than the ${options.maxBytes ?? SNAPSHOT_MAX_BYTES} byte snapshot limit.`,
    )
  }
  let raw: unknown
  try {
    raw = JSON.parse(contents)
  } catch {
    throw new SnapshotStorageError('invalid', 'Import file is not valid JSON.')
  }
  const format = (raw as { format?: unknown } | null)?.format
  let common: {
    projectName: string
    collectorVersion: string
    label?: string
    config: StackNextConfig
    spans: StackNextSpan[]
    errors: StackNextError[]
    databaseQueries: StackNextDatabaseQuery[]
  }
  if (format === 'stacknext-snapshot') {
    const parsed = snapshotPayloadSchema.safeParse(raw)
    if (!parsed.success) {
      throw new SnapshotStorageError(
        'invalid',
        `Snapshot import failed validation: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; ')}`,
      )
    }
    common = {
      projectName: parsed.data.projectName,
      collectorVersion: parsed.data.collectorVersion,
      ...(parsed.data.label ? { label: parsed.data.label } : {}),
      config: parseStackNextConfig(parsed.data.config),
      spans: parsed.data.spans,
      errors: parsed.data.errors,
      databaseQueries: parsed.data.databaseQueries,
    }
  } else if (format === 'stacknext-export') {
    const parsed = snapshotImportSchema.safeParse(raw)
    if (!parsed.success) {
      throw new SnapshotStorageError(
        'invalid',
        `Export import failed validation: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; ')}`,
      )
    }
    common = {
      projectName: parsed.data.projectName,
      collectorVersion: parsed.data.collectorVersion,
      config: parseStackNextConfig(parsed.data.config),
      spans: parsed.data.spans,
      errors: parsed.data.errors,
      databaseQueries: parsed.data.databaseQueries,
    }
  } else {
    throw new SnapshotStorageError(
      'invalid',
      'Unrecognized import format. Use a stacknext-snapshot or stacknext-export JSON file.',
    )
  }

  const sanitized = sanitizeImportedRecords(common)
  const payload: SnapshotPayload = {
    format: 'stacknext-snapshot',
    version: 1,
    id: newSnapshotId(),
    createdAt: options.createdAt ?? Date.now(),
    source: 'import',
    projectName: common.projectName,
    collectorVersion: common.collectorVersion,
    ...(options.label ?? common.label ? { label: (options.label ?? common.label)?.slice(0, 200) } : {}),
    config: common.config,
    sample: {
      firstEventTime: null,
      lastEventTime: null,
      retentionMs: common.config.collector.retentionMs,
    },
    spans: sanitized.spans,
    errors: sanitized.errors,
    databaseQueries: sanitized.databaseQueries,
    stats: { requests: 0, errors: 0, databaseQueries: 0, spans: 0 },
    limitations: [
      ...SNAPSHOT_LIMITATIONS,
      'This snapshot was imported from a local JSON file and re-redacted on import.',
    ],
  }
  const computed = recomputePayload(payload, common.config)
  payload.sample = computed.sample
  payload.stats = computed.stats
  return saveSnapshot(projectDir, payload, { maxBytes: options.maxBytes })
}
