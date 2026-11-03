import { randomBytes } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

export const RUNTIME_DIR_NAME = '.stacknext'
export const RUNTIME_FILE_NAME = 'run.json'

export const runtimeStateSchema = z
  .object({
    version: z.literal(1),
    pid: z.number().int().positive(),
    startedAt: z.number().int().positive(),
    projectDir: z.string().min(1),
    projectName: z.string().min(1),
    dashboardUrl: z.string().url(),
    collectorUrl: z.string().url(),
    port: z.number().int().positive(),
    token: z.string().min(16),
    nextVersion: z.string().optional(),
    command: z.string().optional(),
  })
  .strict()

export type RuntimeState = z.infer<typeof runtimeStateSchema>

export function runtimeDir(projectDir: string): string {
  return path.join(projectDir, RUNTIME_DIR_NAME)
}

export function runtimeStatePath(projectDir: string): string {
  const override = process.env.STACKNEXT_RUNTIME_FILE
  if (override) return path.isAbsolute(override) ? override : path.resolve(projectDir, override)
  return path.join(runtimeDir(projectDir), RUNTIME_FILE_NAME)
}

export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

export interface RuntimeLock {
  file: string
  release: () => Promise<void>
  releaseSync: () => void
}

const LOCK_FILE_NAME = 'dev.lock'
const LOCK_EMPTY_GRACE_MS = 1_000
const LOCK_RETRY_DELAY_MS = 25
const LOCK_MAX_ATTEMPTS = 40

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function lockBelongsTo(file: string, token: string): boolean {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { token?: unknown }
    return parsed.token === token
  } catch {
    return false
  }
}

function lockOwnerPid(contents: string): number | null {
  try {
    const parsed = JSON.parse(contents) as { pid?: unknown }
    return typeof parsed.pid === 'number' &&
      Number.isInteger(parsed.pid) &&
      parsed.pid > 0
      ? parsed.pid
      : null
  } catch {
    return null
  }
}

/**
 * Creates the private runtime directory and its ignore file before any
 * token-bearing file is written, so an interrupted start cannot leave a token
 * exposed to `git add`.
 */
export async function ensureRuntimeDir(projectDir: string): Promise<string> {
  const dir = runtimeDir(projectDir)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await chmod(dir, 0o700).catch(() => undefined)
  const ignoreFile = path.join(dir, '.gitignore')
  try {
    await writeFile(ignoreFile, '*\n', { mode: 0o600, flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  return dir
}

/**
 * Serializes startup for one project. Runtime state is written only after the
 * collector is ready, so without this lock two overlapping starts could both
 * pass the running-state check and leave an orphaned collector behind.
 */
export async function acquireRuntimeLock(
  projectDir: string,
): Promise<RuntimeLock> {
  const dir = await ensureRuntimeDir(projectDir)
  const file = path.join(dir, LOCK_FILE_NAME)
  const token = randomBytes(16).toString('hex')
  const payload = `${JSON.stringify({
    pid: process.pid,
    startedAt: Date.now(),
    token,
  })}\n`
  const emptyGraceDeadline = Date.now() + LOCK_EMPTY_GRACE_MS

  for (let attempt = 0; attempt < LOCK_MAX_ATTEMPTS; attempt += 1) {
    try {
      // Exclusive create-and-write. A reader can still observe the file between
      // create and write, so an empty or truncated lock gets a grace period
      // below before it is treated as stale.
      await writeFile(file, payload, { flag: 'wx', mode: 0o600 })
      return {
        file,
        release: async () => {
          if (!lockBelongsTo(file, token)) return
          try {
            await rm(file, { force: true })
          } catch {
            // Best effort during shutdown; a stale lock is reclaimed on the
            // next start once this process is gone.
          }
        },
        releaseSync: () => {
          if (!lockBelongsTo(file, token)) return
          try {
            rmSync(file, { force: true })
          } catch {
            // Best effort during process exit.
          }
        },
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      let existing: string
      try {
        existing = await readFile(file, 'utf8')
      } catch (readError) {
        if ((readError as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw readError
      }
      const pid = lockOwnerPid(existing)
      if (pid !== null) {
        if (pid === process.pid || isProcessAlive(pid)) {
          throw new Error(
            `StackNext is already starting or running for this project (pid ${pid}). Wait for it to finish or stop it with SIGINT/SIGTERM.`,
          )
        }
        await rm(file, { force: true })
        continue
      }
      if (Date.now() < emptyGraceDeadline) {
        await delay(LOCK_RETRY_DELAY_MS)
        continue
      }
      await rm(file, { force: true })
    }
  }
  throw new Error(
    'Could not acquire the StackNext runtime lock. Remove .stacknext/dev.lock and retry.',
  )
}

export async function readRuntimeState(projectDir: string): Promise<RuntimeState | null> {
  const file = runtimeStatePath(projectDir)
  let contents: string
  try {
    contents = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(contents)
  } catch {
    throw new Error(`Cannot parse ${file}. Remove it and restart "stacknext dev".`)
  }
  const result = runtimeStateSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `Invalid runtime state in ${file}. Remove it and restart "stacknext dev".`,
    )
  }
  return result.data
}

export async function writeRuntimeState(
  projectDir: string,
  state: RuntimeState,
): Promise<string> {
  await ensureRuntimeDir(projectDir)
  const file = runtimeStatePath(projectDir)
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  await chmod(temporary, 0o600).catch(() => undefined)
  await rename(temporary, file)
  return file
}

export async function removeRuntimeState(projectDir: string): Promise<void> {
  await rm(runtimeStatePath(projectDir), { force: true })
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '[::1]' ||
    hostname === '::1'
  )
}
