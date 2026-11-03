import { randomBytes } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
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
    // Optional so runtime state written by StackNext before the Docker
    // runtime existed keeps parsing as native mode.
    runtime: z
      .object({
        mode: z.enum(['native', 'docker']),
        containerId: z.string().min(1).optional(),
        containerName: z.string().min(1).optional(),
        image: z.string().min(1).optional(),
        hostPort: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
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

function lockBelongsTo(file: string, token: string): boolean {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { token?: unknown }
    return parsed.token === token
  } catch {
    return false
  }
}

/**
 * Creates the private runtime directory and its ignore file. The ignore file
 * must exist before any token-bearing file is written, including the Docker
 * config, so an interrupted start cannot leave a token exposed to `git add`.
 */
export async function ensureRuntimeDir(projectDir: string): Promise<string> {
  const dir = runtimeDir(projectDir)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await chmod(dir, 0o700).catch(() => undefined)
  await writeFile(path.join(dir, '.gitignore'), '*\n', { mode: 0o600 })
  return dir
}

/**
 * Serializes startup for one project. A runtime state file is written only
 * after the collector is ready, so without this lock two overlapping starts
 * could remove each other's containers during the startup window.
 */
export async function acquireRuntimeLock(
  projectDir: string,
): Promise<RuntimeLock> {
  const dir = await ensureRuntimeDir(projectDir)
  const file = path.join(dir, 'dev.lock')
  const token = randomBytes(16).toString('hex')
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const handle = await open(file, 'wx', 0o600)
      try {
        await handle.writeFile(
          `${JSON.stringify({ pid: process.pid, startedAt: Date.now(), token })}\n`,
        )
      } finally {
        await handle.close()
      }
      return {
        file,
        release: async () => {
          if (!lockBelongsTo(file, token)) return
          await rm(file, { force: true })
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
      const existing = await readFile(file, 'utf8').catch(() => null)
      let pid: number | null = null
      if (existing) {
        try {
          const parsed = JSON.parse(existing) as { pid?: unknown }
          if (typeof parsed.pid === 'number' && Number.isInteger(parsed.pid)) {
            pid = parsed.pid
          }
        } catch {
          // A truncated lock is stale.
        }
      }
      if (pid !== null && (pid === process.pid || isProcessAlive(pid))) {
        throw new Error(
          `StackNext is already starting or running for this project (pid ${pid}). Wait for it to finish or stop it with SIGINT/SIGTERM.`,
        )
      }
      await rm(file, { force: true })
    }
  }
  throw new Error(
    'Could not acquire the StackNext runtime lock. Remove .stacknext/dev.lock and retry.',
  )
}

export async function readRuntimeLockPid(
  projectDir: string,
): Promise<number | null> {
  const file = path.join(runtimeDir(projectDir), 'dev.lock')
  const contents = await readFile(file, 'utf8').catch(() => null)
  if (!contents) return null
  try {
    const parsed = JSON.parse(contents) as { pid?: unknown }
    return typeof parsed.pid === 'number' && Number.isInteger(parsed.pid)
      ? parsed.pid
      : null
  } catch {
    return null
  }
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
