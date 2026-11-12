import { fork } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { detectRunningNextDev } from '../src/next-dev.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'stacknext-next-dev-'))
  roots.push(root)
  return root
}

describe('Next.js dev preflight', () => {
  it('detects a live dev server from the distDir lock', async () => {
    const projectDir = await project()
    await mkdir(path.join(projectDir, '.next'), { recursive: true })
    await writeFile(
      path.join(projectDir, '.next', 'lock'),
      JSON.stringify({
        pid: process.pid,
        port: 4402,
        hostname: 'localhost',
        appUrl: 'http://localhost:4402',
        startedAt: Date.now(),
      }),
    )
    await expect(detectRunningNextDev(projectDir)).resolves.toMatchObject({
      pid: process.pid,
      port: 4402,
      appUrl: 'http://localhost:4402',
    })
  })

  it('ignores stale, malformed and missing locks', async () => {
    const projectDir = await project()
    await mkdir(path.join(projectDir, '.next'), { recursive: true })
    await writeFile(
      path.join(projectDir, '.next', 'lock'),
      JSON.stringify({ pid: 999_999, port: 4402 }),
    )
    await expect(detectRunningNextDev(projectDir)).resolves.toBeNull()

    await writeFile(path.join(projectDir, '.next', 'lock'), 'not json')
    await expect(detectRunningNextDev(projectDir)).resolves.toBeNull()

    const empty = await project()
    await expect(detectRunningNextDev(empty)).resolves.toBeNull()
  })
})

// These releases have no JSON lock: exercise the upstream worker identity
// fixture as a real process, including its trace descriptor and environment.
it.skipIf(process.platform !== 'linux').each(['15.5.0', '16.0.0'])(
  'detects the lockless Next %s dev worker for this project only',
  async (version) => {
    const dir = await project()
    const other = await project()
    const child = fork(fileURLToPath(new URL('./fixtures/next-legacy-worker.mjs', import.meta.url)), {
      cwd: dir,
      env: { ...process.env, __NEXT_VERSION: version, NEXT_PRIVATE_WORKER: '1', NODE_ENV: 'development' },
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    })
    try {
      await once(child, 'message')
      await expect(detectRunningNextDev(dir, version)).resolves.toEqual({ pid: child.pid })
      await expect(detectRunningNextDev(other, version)).resolves.toBeNull()
      await expect(detectRunningNextDev(dir, '17.0.0')).resolves.toBeNull()
    } finally {
      const exited = once(child, 'exit')
      child.kill()
      await exited
    }
    await expect(detectRunningNextDev(dir, version)).resolves.toBeNull()
  },
)

it.skipIf(process.platform !== 'linux')('ignores a production server with the same version and cwd', async () => {
  const dir = await project()
  const child = fork(fileURLToPath(new URL('./fixtures/next-legacy-worker.mjs', import.meta.url)), {
    cwd: dir,
    env: { ...process.env, __NEXT_VERSION: '16.0.0', NODE_ENV: 'production', NEXT_PRIVATE_WORKER: '' },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  })
  try {
    await once(child, 'message')
    await expect(detectRunningNextDev(dir, '16.0.0')).resolves.toBeNull()
  } finally {
    const exited = once(child, 'exit')
    child.kill()
    await exited
  }
})
