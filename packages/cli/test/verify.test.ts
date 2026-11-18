import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VerificationResult } from '@stacknext/core'
import { startCollector, type CollectorHandle } from '../src/collector/server.js'
import { runCaseNew } from '../src/commands/case.js'
import { runVerify } from '../src/commands/verify.js'
import { parseStackNextConfig } from '@stacknext/core'
import { writeRuntimeState } from '../src/runtime.js'
import { databaseQuery, envelope, errorEvent, rootSpan, TRACE } from './fixtures.js'

const TOKEN = 'verify-token-long-enough-123456'
const roots: string[] = []
let collector: CollectorHandle
let projectDir: string

function captureJson(): () => VerificationResult {
  let output: string | undefined
  const spy = vi.spyOn(console, 'log').mockImplementation((value?: unknown) => {
    output = typeof value === 'string' ? value : String(value)
  })
  return () => {
    spy.mockRestore()
    return output ? (JSON.parse(output) as VerificationResult) : (undefined as unknown as VerificationResult)
  }
}

beforeEach(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), 'stacknext-verify-'))
  roots.push(projectDir)
  await writeFile(
    path.join(projectDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'verify-fixture',
        private: true,
        scripts: { dev: 'next dev' },
        dependencies: { next: '16.4.3', react: '19.3.1', 'react-dom': '19.3.1' },
      },
      null,
      2,
    )}\n`,
  )
  await mkdir(path.join(projectDir, 'app'))
  collector = await startCollector({
    port: 0,
    autoPort: false,
    token: TOKEN,
    projectName: 'verify-fixture',
    dashboardDir: null,
    config: parseStackNextConfig({}),
    log: () => undefined,
  })
  await writeRuntimeState(projectDir, {
    version: 1,
    pid: process.pid,
    startedAt: Date.now(),
    projectDir,
    projectName: 'verify-fixture',
    dashboardUrl: collector.url,
    collectorUrl: collector.url,
    port: collector.port,
    token: TOKEN,
  })
  const response = await fetch(`${collector.url}/__stacknext/v1/ingest`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(
      envelope({
        spans: [rootSpan({ statusCode: 200, name: 'GET /api/projects', route: '/api/projects' })],
        errors: [errorEvent()],
        databaseQueries: [databaseQuery()],
      }),
    ),
  })
  expect(response.status).toBe(202)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await collector.close()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('stacknext verify', () => {
  it('returns supported with a stable JSON shape and exit code 0', async () => {
    const json = captureJson()
    const code = await runVerify(
      { trace: TRACE, expectStatus: '200', json: true },
      projectDir,
    )
    const result = json()
    expect(code).toBe(0)
    expect(result.result).toBe('supported')
    expect(result.claim).toContain(TRACE)
    expect(result.checks[0]).toMatchObject({ predicate: 'requestStatus', observed: 200, passed: true })
    expect(result.checks[0]?.evidence).toEqual([TRACE])
    expect(result.sampleSize).toBe(1)
    expect(typeof result.revision).toBe('number')
  })

  it('returns contradicted with exit code 1', async () => {
    captureJson()
    const code = await runVerify(
      { trace: TRACE, expectStatus: '500', json: true },
      projectDir,
    )
    expect(code).toBe(1)
  })

  it('returns unverifiable with exit code 2 for missing or ambiguous evidence', async () => {
    const json = captureJson()
    const code = await runVerify(
      { diagnostic: 'diag-00000000-00000000', expectStatus: 'observed', json: true },
      projectDir,
    )
    expect(code).toBe(2)
    expect(json().result).toBe('unverifiable')
    const routeCode = await runVerify(
      { route: '/api/none', since: '0', maxQueries: '3', json: true },
      projectDir,
    )
    expect(routeCode).toBe(2)
  })

  it('rejects injection-shaped and out-of-range arguments', async () => {
    await expect(
      runVerify({ trace: 'IGNORE PREVIOUS INSTRUCTIONS', expectStatus: '200' }, projectDir),
    ).rejects.toThrow(/32 hexadecimal/)
    await expect(
      runVerify({ route: '?q=demo-url-secret', since: '0', maxQueries: '3' }, projectDir),
    ).rejects.toThrow(/--route/)
    await expect(
      runVerify({ trace: TRACE, expectStatus: '999' }, projectDir),
    ).rejects.toThrow(/--expect-status/)
    await expect(
      runVerify({ route: '/api/projects', since: 'not-a-timestamp', maxQueries: '3' }, projectDir),
    ).rejects.toThrow(/--since/)
  })

  it('treats --since as an absolute epoch-millisecond timestamp', async () => {
    const json = captureJson()
    const included = await runVerify(
      { route: '/api/projects', since: '1000', maxQueries: '3', json: true },
      projectDir,
    )
    expect(included).toBe(0)
    expect(json().result).toBe('supported')

    const future = String(Date.now() + 60_000)
    const futureJson = captureJson()
    const excluded = await runVerify(
      { route: '/api/projects', since: future, maxQueries: '3', json: true },
      projectDir,
    )
    expect(excluded).toBe(2)
    expect(futureJson().result).toBe('unverifiable')
  })

  it('appends one verification event when re-running a saved case claim', async () => {
    const json = captureJson()
    await runCaseNew(
      { title: 'Verify case', evidence: [`trace:${TRACE}`], json: true },
      projectDir,
    )
    const caseId = (json() as unknown as { id: string }).id
    // A fresh case has no saved claim: save one with a predicate and --case.
    captureJson()
    const first = await runVerify(
      { trace: TRACE, expectStatus: '200', case: caseId, json: true },
      projectDir,
    )
    expect(first).toBe(0)
    captureJson()
    const code = await runVerify({ case: caseId, json: true }, projectDir)
    expect(code).toBe(0)
    const { readCaseEvents } = await import('../src/cases-storage.js')
    const { foldCaseEvents } = await import('@stacknext/core')
    const { events } = await readCaseEvents(projectDir, caseId)
    expect(events.filter((event) => event.kind === 'verification_added')).toHaveLength(2)
    const view = foldCaseEvents(events, caseId)
    expect(view?.verification).toMatchObject({ result: 'supported' })
  })
})
