import { readFile, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { isProcessAlive } from './runtime.js'

export interface RunningNextDev {
  pid: number
  port?: number
  appUrl?: string
  hostname?: string
  startedAt?: number
  lockPath?: string
}

const LOCK_CANDIDATES = [
  path.join('.next', 'lock'),
  path.join('.next', 'dev', 'lock'),
]

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : undefined
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/**
 * Best-effort preflight for a Next.js dev server that is already serving this
 * project. Versions with a JSON lock record are checked first; a stale lock is
 * ignored because the recorded process is no longer alive.
 */
export async function detectRunningNextDev(
  projectDir: string,
  nextVersion?: string | null,
): Promise<RunningNextDev | null> {
  for (const relative of LOCK_CANDIDATES) {
    const lockPath = path.join(projectDir, relative)
    let raw: string
    try {
      raw = await readFile(lockPath, 'utf8')
    } catch {
      continue
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      continue
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      continue
    }
    const record = parsed as Record<string, unknown>
    const pid = positiveInteger(record.pid)
    if (!pid || !isProcessAlive(pid)) continue
    return {
      pid,
      ...(positiveInteger(record.port) ? { port: positiveInteger(record.port) } : {}),
      ...(optionalString(record.appUrl) ? { appUrl: optionalString(record.appUrl) } : {}),
      ...(optionalString(record.hostname)
        ? { hostname: optionalString(record.hostname) }
        : {}),
      ...(positiveInteger(record.startedAt)
        ? { startedAt: positiveInteger(record.startedAt) }
        : {}),
      lockPath,
    }
  }
  return detectLegacyNextDev(projectDir, nextVersion)
}

/**
 * For supported Next 15/16 releases without a JSON lock (including 16.0.0),
 * on Linux identify the
 * dev worker by its upstream process title, worker environment and open trace.
 * /proc access is best effort; unavailable or inaccessible entries are ignored.
 * Do not infer a server from a build artifact or a port that another app owns.
 */
async function detectLegacyNextDev(
  projectDir: string,
  nextVersion: string | null | undefined,
): Promise<RunningNextDev | null> {
  if (!nextVersion || !/^(15|16)\.\d+\.\d+$/.test(nextVersion)) return null
  if (process.platform !== 'linux') return null
  try {
    const projectPath = await realpath(projectDir)
    for (const entry of await readdir('/proc')) {
      if (!/^\d+$/.test(entry)) continue
      try {
        const procDir = path.join('/proc', entry)
        const title = (await readFile(path.join(procDir, 'cmdline'), 'utf8'))
          .split('\0')[0]
        if (title !== `next-server (v${nextVersion})`) continue
        const environment = (await readFile(path.join(procDir, 'environ'), 'utf8')).split('\0')
        if (
          !environment.includes('NEXT_PRIVATE_WORKER=1') ||
          !environment.includes('NODE_ENV=development')
        ) continue
        // The worker inherits the launcher's cwd even with `next dev <dir>`.
        // Its open trace identifies the served project rather than that cwd.
        const tracePaths = [
          path.join(projectPath, '.next', 'trace'),
          path.join(projectPath, '.next', 'dev', 'trace'),
        ]
        let ownsTrace = false
        for (const fd of await readdir(path.join(procDir, 'fd'))) {
          try {
            if (tracePaths.includes(await realpath(path.join(procDir, 'fd', fd)))) {
              ownsTrace = true
              break
            }
          } catch { /* A descriptor may close during discovery. */ }
        }
        if (!ownsTrace) continue
        const pid = Number(entry)
        if (isProcessAlive(pid)) return { pid }
      } catch {
        // Processes can exit during discovery, and other users' entries may be private.
      }
    }
  } catch {
    // procfs is not available in every Linux environment.
  }
  return null
}
