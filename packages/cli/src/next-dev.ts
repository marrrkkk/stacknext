import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { isProcessAlive } from './runtime.js'

export interface RunningNextDev {
  pid: number
  port?: number
  appUrl?: string
  hostname?: string
  startedAt?: number
  lockPath: string
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
 * project. Next writes the lock JSON at `<distDir>/lock`; a stale lock is
 * ignored because the recorded process is no longer alive.
 */
export async function detectRunningNextDev(
  projectDir: string,
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
  return null
}
