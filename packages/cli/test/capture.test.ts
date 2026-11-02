import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseStackNextConfig } from '@stacknext/core'
import { listRuns, loadRun } from '@stacknext/regression'
import { runCapture } from '../src/commands/capture.js'
import { startCollector } from '../src/collector/server.js'

const TOKEN = 'capture-token-that-is-long-enough-1234'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function waitForFile(file: string, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await exists(file)) return
    await sleep(25)
  }
  throw new Error(`Timed out waiting for ${file}`)
}

describe('capture lifecycle', () => {
  let projectDir: string

  beforeEach(async () => {
    projectDir = await mkdtemp(path.join(tmpdir(), 'stacknext-capture-'))
    await writeFile(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ name: 'capture-test', version: '1.0.0' }),
    )
  })

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  it('preserves the child exit code and treats missing telemetry as exit 3', async () => {
    const failedCode = await runCapture(
      { quiet: true, name: 'child-fails' },
      [process.execPath, '-e', 'process.exit(7)'],
      projectDir,
    )
    expect(failedCode).toBe(7)

    const spawnCode = await runCapture(
      { quiet: true, name: 'child-cannot-start' },
      [path.join(projectDir, 'does-not-exist')],
      projectDir,
    )
    expect(spawnCode).toBe(1)

    const noTelemetryCode = await runCapture(
      { quiet: true, name: 'no-telemetry' },
      [process.execPath, '-e', 'process.exit(0)'],
      projectDir,
    )
    expect(noTelemetryCode).toBe(3)

    const runs = await listRuns(projectDir)
    expect(runs.total).toBe(3)
    const byName = new Map(
      await Promise.all(
        runs.items.map(async (summary) => [summary.name, await loadRun(projectDir, summary.id)] as const),
      ),
    )
    expect(byName.get('child-fails')?.status).toBe('failed')
    expect(byName.get('child-fails')?.command.exitCode).toBe(7)
    expect(byName.get('child-cannot-start')?.status).toBe('failed')
    expect(byName.get('no-telemetry')?.status).toBe('incomplete')
    expect(byName.get('no-telemetry')?.stats.verifiedSamples).toBe(0)
    expect(byName.get('no-telemetry')?.warnings.join(' ')).toContain(
      'No verified telemetry',
    )
  })

  it('marks a run incomplete when the collector disconnects during the child command', async () => {
    const collector = await startCollector({
      port: 0,
      autoPort: false,
      token: TOKEN,
      projectName: 'capture-test',
      dashboardDir: null,
      config: parseStackNextConfig({}),
      log: () => undefined,
    })
    const marker = path.join(projectDir, 'started.marker')
    const child = [
      "require('node:fs').writeFileSync(process.argv[1], 'started')",
      'setTimeout(() => process.exit(0), 1_500)',
    ].join('\n')
    const capture = runCapture(
      {
        quiet: true,
        name: 'disconnect',
        url: collector.url,
        token: TOKEN,
      },
      [process.execPath, '-e', child, marker],
      projectDir,
    )
    await waitForFile(marker)
    await collector.close()
    const code = await capture
    expect(code).toBe(3)

    const runs = await listRuns(projectDir)
    expect(runs.total).toBe(1)
    const run = await loadRun(projectDir, runs.items[0]!.id)
    expect(run.status).toBe('incomplete')
    expect(run.warnings.join(' ')).toContain('Collector finalization failed')
  })

  it('refuses to start when an attached collector is unreachable', async () => {
    const collector = await startCollector({
      port: 0,
      autoPort: false,
      token: TOKEN,
      projectName: 'capture-test',
      dashboardDir: null,
      config: parseStackNextConfig({}),
      log: () => undefined,
    })
    const url = collector.url
    await collector.close()

    await expect(
      runCapture(
        { quiet: true, url, token: TOKEN },
        [process.execPath, '-e', 'process.exit(0)'],
        projectDir,
      ),
    ).rejects.toThrow('Could not reach the StackNext collector')

    const runs = await listRuns(projectDir)
    expect(runs.total).toBe(0)
  })
})
