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
import {
  baselineSchema,
  comparisonSchema,
  testRunSchema,
  type Baseline,
  type BaselineSummary,
  type Comparison,
  type ComparisonSummaryItem,
  type RunSummary,
  type TestRun,
} from './schema.js'
import {
  baselineSummary,
  comparisonSummaryItem,
  runSummary,
} from './stats.js'

export const REGRESSION_DIR_NAME = '.stacknext'
export const RUNS_DIR_NAME = 'runs'
export const BASELINES_DIR_NAME = 'baselines'
export const COMPARISONS_DIR_NAME = 'comparisons'
const MAX_RECORD_BYTES = 16 * 1024 * 1024

export class RegressionStorageError extends Error {
  readonly code: 'exists' | 'invalid' | 'too-large' | 'not-found'

  constructor(code: RegressionStorageError['code'], message: string) {
    super(message)
    this.name = 'RegressionStorageError'
    this.code = code
  }
}

export function regressionDir(projectDir: string): string {
  return path.join(projectDir, REGRESSION_DIR_NAME)
}

export function runsDir(projectDir: string): string {
  return path.join(regressionDir(projectDir), RUNS_DIR_NAME)
}

export function baselinesDir(projectDir: string): string {
  return path.join(regressionDir(projectDir), BASELINES_DIR_NAME)
}

export function comparisonsDir(projectDir: string): string {
  return path.join(regressionDir(projectDir), COMPARISONS_DIR_NAME)
}

export function runPath(projectDir: string, id: string): string {
  return path.join(runsDir(projectDir), `${id}.json`)
}

export function baselinePath(projectDir: string, id: string): string {
  return path.join(baselinesDir(projectDir), `${id}.json`)
}

export function comparisonPath(projectDir: string, id: string): string {
  return path.join(comparisonsDir(projectDir), `${id}.json`)
}

export async function ensureRegressionDirs(projectDir: string): Promise<void> {
  const root = regressionDir(projectDir)
  await mkdir(root, { recursive: true, mode: 0o700 })
  await chmod(root, 0o700).catch(() => undefined)
  const gitignore = path.join(root, '.gitignore')
  try {
    await writeFile(gitignore, '*\n', { mode: 0o600, flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  for (const dir of [runsDir(projectDir), baselinesDir(projectDir), comparisonsDir(projectDir)]) {
    await mkdir(dir, { recursive: true, mode: 0o700 })
    await chmod(dir, 0o700).catch(() => undefined)
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function writeJson(
  file: string,
  payload: unknown,
  overwrite: boolean,
): Promise<void> {
  const body = `${JSON.stringify(payload, null, 2)}\n`
  if (Buffer.byteLength(body, 'utf8') > MAX_RECORD_BYTES) {
    throw new RegressionStorageError(
      'too-large',
      `${file} exceeds the ${MAX_RECORD_BYTES} byte regression record limit and was not written.`,
    )
  }
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await chmod(path.dirname(file), 0o700).catch(() => undefined)
  if (!overwrite && (await exists(file))) {
    throw new RegressionStorageError(
      'exists',
      `${file} already exists. Use an explicit overwrite flag after confirming you want to replace it.`,
    )
  }
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(temporary, body, { mode: 0o600, flag: 'wx' })
    await chmod(temporary, 0o600).catch(() => undefined)
    if (overwrite) {
      await rename(temporary, file)
      return
    }
    try {
      await link(temporary, file)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EEXIST') {
        throw new RegressionStorageError(
          'exists',
          `${file} already exists. Use an explicit overwrite flag after confirming you want to replace it.`,
        )
      }
      if (code === 'EPERM' || code === 'ENOSYS' || code === 'EOPNOTSUPP') {
        if (await exists(file)) {
          throw new RegressionStorageError(
            'exists',
            `${file} already exists. Use an explicit overwrite flag after confirming you want to replace it.`,
          )
        }
        await rename(temporary, file)
        return
      }
      throw error
    } finally {
      await unlink(temporary).catch(() => undefined)
    }
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}

async function readJson<T>(
  file: string,
  schema: z.ZodType<T>,
): Promise<T> {
  let info
  try {
    info = await stat(file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new RegressionStorageError('not-found', `${file} does not exist.`)
    }
    throw error
  }
  if (info.size > MAX_RECORD_BYTES) {
    throw new RegressionStorageError(
      'too-large',
      `${file} is larger than the ${MAX_RECORD_BYTES} byte regression record limit.`,
    )
  }
  const contents = await readFile(file, 'utf8')
  let parsed: unknown
  try {
    parsed = JSON.parse(contents)
  } catch {
    throw new RegressionStorageError('invalid', `${file} is not valid JSON.`)
  }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new RegressionStorageError(
      'invalid',
      `${file} failed validation: ${result.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')}`,
    )
  }
  return result.data
}

function idsFrom(names: string[], prefix: 'run' | 'base' | 'cmp'): string[] {
  const pattern = new RegExp(`^${prefix}-[0-9a-f]{16}\\.json$`)
  return names
    .filter((name) => pattern.test(name))
    .map((name) => name.slice(0, -'.json'.length))
    .sort()
}

export interface ListOptions {
  limit?: number
  offset?: number
}

export interface StoredRecords<T> {
  items: T[]
  invalid: number
}

function page<T>(items: T[], options: ListOptions, invalid = 0): {
  items: T[]
  total: number
  limit: number
  offset: number
  invalid: number
} {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    limit,
    offset,
    invalid,
  }
}

function invalidRecord(error: unknown): boolean {
  return error instanceof RegressionStorageError && error.code !== 'not-found'
}

async function readRunSummaries(projectDir: string): Promise<StoredRecords<RunSummary>> {
  let names: string[]
  try {
    names = await readdir(runsDir(projectDir))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { items: [], invalid: 0 }
    }
    throw error
  }
  const items: RunSummary[] = []
  let invalid = 0
  for (const id of idsFrom(names, 'run')) {
    try {
      items.push(runSummary(await loadRun(projectDir, id)))
    } catch (error) {
      if (error instanceof RegressionStorageError) {
        if (invalidRecord(error)) invalid += 1
        continue
      }
      throw error
    }
  }
  items.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1))
  return { items, invalid }
}

export async function saveRun(
  projectDir: string,
  run: TestRun,
  options: { overwrite?: boolean } = {},
): Promise<string> {
  await ensureRegressionDirs(projectDir)
  testRunSchema.parse(run)
  const file = runPath(projectDir, run.id)
  await writeJson(file, run, options.overwrite ?? false)
  return file
}

export async function loadRun(projectDir: string, id: string): Promise<TestRun> {
  return readJson(runPath(projectDir, id), testRunSchema)
}

export async function listAllRuns(projectDir: string): Promise<StoredRecords<RunSummary>> {
  return readRunSummaries(projectDir)
}

export async function listRuns(
  projectDir: string,
  options: ListOptions = {},
): Promise<{
  items: RunSummary[]
  total: number
  limit: number
  offset: number
  invalid: number
}> {
  const records = await readRunSummaries(projectDir)
  return page(records.items, options, records.invalid)
}

export async function saveBaseline(
  projectDir: string,
  baseline: Baseline,
  options: { overwrite?: boolean } = {},
): Promise<string> {
  await ensureRegressionDirs(projectDir)
  baselineSchema.parse(baseline)
  const file = baselinePath(projectDir, baseline.id)
  await writeJson(file, baseline, options.overwrite ?? false)
  return file
}

export async function loadBaseline(
  projectDir: string,
  id: string,
): Promise<Baseline> {
  return readJson(baselinePath(projectDir, id), baselineSchema)
}

async function readBaselineSummaries(
  projectDir: string,
): Promise<StoredRecords<BaselineSummary>> {
  let names: string[]
  try {
    names = await readdir(baselinesDir(projectDir))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { items: [], invalid: 0 }
    }
    throw error
  }
  const items: BaselineSummary[] = []
  let invalid = 0
  for (const id of idsFrom(names, 'base')) {
    try {
      items.push(baselineSummary(await loadBaseline(projectDir, id)))
    } catch (error) {
      if (error instanceof RegressionStorageError) {
        if (invalidRecord(error)) invalid += 1
        continue
      }
      throw error
    }
  }
  items.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1))
  return { items, invalid }
}

export async function listAllBaselines(
  projectDir: string,
): Promise<StoredRecords<BaselineSummary>> {
  return readBaselineSummaries(projectDir)
}

export async function listBaselines(
  projectDir: string,
  options: ListOptions = {},
): Promise<{
  items: BaselineSummary[]
  total: number
  limit: number
  offset: number
  invalid: number
}> {
  const records = await readBaselineSummaries(projectDir)
  return page(records.items, options, records.invalid)
}

export async function removeBaseline(
  projectDir: string,
  id: string,
): Promise<boolean> {
  const file = baselinePath(projectDir, id)
  if (!(await exists(file))) return false
  await rm(file)
  return true
}

export async function saveComparison(
  projectDir: string,
  comparison: Comparison,
  options: { overwrite?: boolean } = {},
): Promise<string> {
  await ensureRegressionDirs(projectDir)
  comparisonSchema.parse(comparison)
  const file = comparisonPath(projectDir, comparison.id)
  await writeJson(file, comparison, options.overwrite ?? false)
  return file
}

export async function loadComparison(
  projectDir: string,
  id: string,
): Promise<Comparison> {
  return readJson(comparisonPath(projectDir, id), comparisonSchema)
}

async function readComparisonSummaries(
  projectDir: string,
): Promise<StoredRecords<ComparisonSummaryItem>> {
  let names: string[]
  try {
    names = await readdir(comparisonsDir(projectDir))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { items: [], invalid: 0 }
    }
    throw error
  }
  const items: ComparisonSummaryItem[] = []
  let invalid = 0
  for (const id of idsFrom(names, 'cmp')) {
    try {
      items.push(comparisonSummaryItem(await loadComparison(projectDir, id)))
    } catch (error) {
      if (error instanceof RegressionStorageError) {
        if (invalidRecord(error)) invalid += 1
        continue
      }
      throw error
    }
  }
  items.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1))
  return { items, invalid }
}

export async function listAllComparisons(
  projectDir: string,
): Promise<StoredRecords<ComparisonSummaryItem>> {
  return readComparisonSummaries(projectDir)
}

export async function listComparisons(
  projectDir: string,
  options: ListOptions = {},
): Promise<{
  items: ComparisonSummaryItem[]
  total: number
  limit: number
  offset: number
  invalid: number
}> {
  const records = await readComparisonSummaries(projectDir)
  return page(records.items, options, records.invalid)
}
