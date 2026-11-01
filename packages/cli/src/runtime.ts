import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

export const RUNTIME_DIR_NAME = '.nextscope'
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
  const override = process.env.NEXTSCOPE_RUNTIME_FILE
  if (override) return path.isAbsolute(override) ? override : path.resolve(projectDir, override)
  return path.join(runtimeDir(projectDir), RUNTIME_FILE_NAME)
}

export function generateToken(): string {
  return randomBytes(32).toString('base64url')
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
    throw new Error(`Cannot parse ${file}. Remove it and restart "nextscope dev".`)
  }
  const result = runtimeStateSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `Invalid runtime state in ${file}. Remove it and restart "nextscope dev".`,
    )
  }
  return result.data
}

export async function writeRuntimeState(
  projectDir: string,
  state: RuntimeState,
): Promise<string> {
  const dir = runtimeDir(projectDir)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await chmod(dir, 0o700).catch(() => undefined)
  await writeFile(path.join(dir, '.gitignore'), '*\n', { mode: 0o600 })
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
