import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { acquireRuntimeLock, runtimeDir } from '../src/runtime.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'stacknext-runtime-'))
  roots.push(root)
  return root
}

describe('runtime lock', () => {
  it('serializes startup and reclaims a stale lock', async () => {
    const projectDir = await project()
    const first = await acquireRuntimeLock(projectDir)
    await expect(acquireRuntimeLock(projectDir)).rejects.toThrow(
      /already starting or running/,
    )
    await first.release()

    const stale = path.join(runtimeDir(projectDir), 'dev.lock')
    await writeFile(
      stale,
      `${JSON.stringify({ pid: 999_999, startedAt: 1, token: 'stale' })}\n`,
    )
    const second = await acquireRuntimeLock(projectDir)
    await second.release()
  })

  it('waits for an empty lock before treating it as stale', async () => {
    const projectDir = await project()
    const dir = runtimeDir(projectDir)
    await mkdir(dir, { recursive: true, mode: 0o700 })
    await writeFile(path.join(dir, 'dev.lock'), '')

    const started = Date.now()
    const lock = await acquireRuntimeLock(projectDir)
    expect(Date.now() - started).toBeGreaterThanOrEqual(500)
    await lock.release()
  })

  it('does not release a lock that was replaced by another process', async () => {
    const projectDir = await project()
    const first = await acquireRuntimeLock(projectDir)
    await rm(first.file, { force: true })
    const second = await acquireRuntimeLock(projectDir)

    await first.release()
    expect(await readFile(second.file, 'utf8')).toContain('"token"')

    await second.release()
  })
})
