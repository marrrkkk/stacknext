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
