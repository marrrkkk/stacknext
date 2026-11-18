import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CaseView } from '@stacknext/core'
import {
  runCaseAdd,
  runCaseClose,
  runCaseList,
  runCaseNew,
  runCaseNote,
  runCaseShow,
} from '../src/commands/case.js'
import { caseEventPath, casesDir } from '../src/cases-storage.js'

const roots: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'stacknext-cases-'))
  roots.push(dir)
  await writeFile(
    path.join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'case-fixture',
        private: true,
        scripts: { dev: 'next dev' },
        dependencies: { next: '16.4.3', react: '19.3.1', 'react-dom': '19.3.1' },
      },
      null,
      2,
    )}\n`,
  )
  await mkdir(path.join(dir, 'app'))
  return dir
}

function captureJson(): () => unknown {
  let output: string | undefined
  const spy = vi.spyOn(console, 'log').mockImplementation((value?: unknown) => {
    output = typeof value === 'string' ? value : String(value)
  })
  return () => {
    spy.mockRestore()
    return output ? JSON.parse(output) : undefined
  }
}

async function rawLines(dir: string, id: string): Promise<string[]> {
  const raw = await readFile(caseEventPath(dir, id), 'utf8')
  return raw.split('\n').filter((line) => line.trim() !== '')
}

describe('stacknext case commands', () => {
  it('writes an append-only round trip with private permissions', async () => {
    const dir = await project()
    let json = captureJson()
    await runCaseNew(
      {
        title: 'N+1 on /api/projects',
        hypothesis: 'One query per project',
        evidence: [`trace:${'a'.repeat(32)}`],
        session: '44444444-5555-6666-7777-888888888888',
        json: true,
      },
      dir,
    )
    const created = json() as CaseView
    expect(created.id).toMatch(/^case_[0-9a-f-]{36}$/)
    expect(created.status).toBe('open')
    expect(created.evidence).toHaveLength(1)
    expect(created.agentSessionId).toBe('44444444-5555-6666-7777-888888888888')

    expect((await stat(path.join(casesDir(dir), created.id))).mode & 0o777).toBe(0o700)
    expect((await stat(caseEventPath(dir, created.id))).mode & 0o777).toBe(0o600)
    expect(await rawLines(dir, created.id)).toHaveLength(1)

    json = captureJson()
    await runCaseAdd(
      created.id,
      { evidence: `error:error-1`, note: 'checked the trace', json: true },
      dir,
    )
    const added = json() as CaseView
    expect(added.evidence).toHaveLength(2)
    expect(added.events.length).toBe(3)
    expect(await rawLines(dir, added.id)).toHaveLength(3)

    json = captureJson()
    await runCaseNote(created.id, { text: 'one more observation', json: true }, dir)
    expect(((json() as CaseView).events).length).toBe(4)

    json = captureJson()
    await runCaseClose(created.id, { status: 'verified', json: true }, dir)
    const closed = json() as CaseView
    expect(closed.status).toBe('verified')
    expect(closed.updatedAt).toBeGreaterThanOrEqual(closed.createdAt)
    expect(await rawLines(dir, closed.id)).toHaveLength(5)

    json = captureJson()
    await runCaseList({ json: true }, dir)
    const listed = json() as { items: CaseView[]; total: number }
    expect(listed.items.map((item) => item.id)).toContain(created.id)

    json = captureJson()
    await runCaseShow(created.id, { json: true }, dir)
    expect((json() as CaseView).id).toBe(created.id)

    const raw = await readFile(caseEventPath(dir, created.id), 'utf8')
    expect(raw).not.toContain('"version"')
    for (const line of raw.split('\n').filter(Boolean)) {
      expect(JSON.parse(line).kind).toBeDefined()
    }
  })

  it('redacts free text and rejects malformed ids and evidence kinds', async () => {
    const dir = await project()
    const json = captureJson()
    await runCaseNew(
      {
        title: 'Investigate password=hunter2',
        hypothesis: 'password=super-secret-demo-token was passed',
        json: true,
      },
      dir,
    )
    const created = json() as CaseView
    expect(JSON.stringify(created)).not.toContain('hunter2')
    expect(JSON.stringify(created)).not.toContain('super-secret-demo-token')

    await expect(runCaseAdd(created.id, { evidence: 'bogus:error-1' }, dir)).rejects.toThrow(
      /Invalid evidence kind/,
    )
    await expect(runCaseAdd('../escape', { evidence: 'trace:abc' }, dir)).rejects.toThrow(
      /Invalid case id/,
    )
    await expect(runCaseNote(created.id, { text: '   ' }, dir)).rejects.toThrow(/--text/)
    await expect(runCaseClose(created.id, { status: 'proven' }, dir)).rejects.toThrow(/--status/)
    expect(await rawLines(dir, created.id)).toHaveLength(1)
  })
})
