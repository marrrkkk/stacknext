import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  generatedInstrumentation,
  isGeneratedInstrumentation,
  runInit,
} from '../src/commands/init.js'
import { runUninstall } from '../src/commands/uninstall.js'
import { runtimeStatePath, writeRuntimeState } from '../src/runtime.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(
  options: { instrumentation?: string; next?: string; typescript?: boolean } = {},
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'stacknext-init-'))
  roots.push(root)
  await writeFile(
    path.join(root, 'package.json'),
    `${JSON.stringify(
      {
        name: 'fixture-app',
        private: true,
        scripts: { dev: 'next dev' },
        dependencies: {
          next: options.next ?? '16.4.3',
          react: '19.3.1',
          'react-dom': '19.3.1',
        },
      },
      null,
      2,
    )}\n`,
  )
  await mkdir(path.join(root, 'app'))
  if (options.typescript) {
    await writeFile(path.join(root, 'tsconfig.json'), '{}\n')
  }
  if (options.instrumentation !== undefined) {
    await writeFile(path.join(root, 'instrumentation.ts'), options.instrumentation)
  }
  return root
}

describe('stacknext init', () => {
  it('creates a config and JavaScript instrumentation file, then stays idempotent', async () => {
    const root = await project()
    expect(await runInit({}, root)).toBe(0)
    const config = await readFile(path.join(root, 'stacknext.config.json'), 'utf8')
    const instrumentation = await readFile(path.join(root, 'instrumentation.js'), 'utf8')
    expect(JSON.parse(config).projectName).toBe('fixture-app')
    expect(isGeneratedInstrumentation(instrumentation)).toBe(true)
    await expect(readFile(path.join(root, 'instrumentation.ts'), 'utf8')).rejects.toThrow()

    expect(await runInit({}, root)).toBe(0)
    expect(await readFile(path.join(root, 'stacknext.config.json'), 'utf8')).toBe(config)
    expect(await readFile(path.join(root, 'instrumentation.js'), 'utf8')).toBe(instrumentation)
  })

  it('creates TypeScript instrumentation when the project uses TypeScript', async () => {
    const root = await project({ typescript: true })
    expect(await runInit({}, root)).toBe(0)
    const instrumentation = await readFile(path.join(root, 'instrumentation.ts'), 'utf8')
    expect(instrumentation).toBe(generatedInstrumentation(true))
    await expect(readFile(path.join(root, 'instrumentation.js'), 'utf8')).rejects.toThrow()
  })

  it('preserves custom instrumentation and never appends a duplicate hook', async () => {
    const custom = [
      "import { registerStackNext } from '@stacknext/next'",
      '',
      'export async function register() {',
      '  await startExistingMonitoring()',
      '  await registerStackNext()',
      '}',
      '',
    ].join('\n')
    const root = await project({ instrumentation: custom })
    expect(await runInit({}, root)).toBe(0)
    expect(await readFile(path.join(root, 'instrumentation.ts'), 'utf8')).toBe(custom)
  })

  it('preserves unrelated instrumentation without a StackNext import', async () => {
    const custom = 'export async function register() {}\n'
    const root = await project({ instrumentation: custom })
    expect(await runInit({}, root)).toBe(0)
    expect(await readFile(path.join(root, 'instrumentation.ts'), 'utf8')).toBe(custom)
  })

  it('rejects an unsupported Next.js major without writing files', async () => {
    const root = await project({ next: '14.2.0' })
    expect(await runInit({}, root)).toBe(1)
    await expect(readFile(path.join(root, 'instrumentation.js'), 'utf8')).rejects.toThrow()
  })
})

describe('stacknext uninstall', () => {
  it('prints a plan without changing files unless --yes is set', async () => {
    const root = await project()
    await runInit({}, root)
    expect(await runUninstall({}, root)).toBe(0)
    expect(isGeneratedInstrumentation(await readFile(path.join(root, 'instrumentation.js'), 'utf8'))).toBe(true)
    expect(await readFile(path.join(root, 'stacknext.config.json'), 'utf8')).toContain('projectName')
  })

  it('removes generated files, runtime state and only StackNext-owned config', async () => {
    const root = await project()
    await runInit({}, root)
    await mkdir(path.join(root, '.stacknext'), { recursive: true })
    await writeRuntimeState(root, {
      version: 1,
      pid: 999_999,
      startedAt: Date.now(),
      projectDir: root,
      projectName: 'fixture-app',
      dashboardUrl: 'http://127.0.0.1:4400',
      collectorUrl: 'http://127.0.0.1:4400',
      port: 4400,
      token: 'a'.repeat(32),
    })

    expect(await runUninstall({ yes: true }, root)).toBe(0)
    await expect(readFile(path.join(root, 'instrumentation.js'), 'utf8')).rejects.toThrow()
    await expect(readFile(runtimeStatePath(root), 'utf8')).rejects.toThrow()
    await expect(readFile(path.join(root, 'stacknext.config.json'), 'utf8')).rejects.toThrow()
  })

  it('keeps user instrumentation and --keep-config', async () => {
    const custom = 'export async function register() {}\n'
    const root = await project({ instrumentation: custom })
    await runInit({}, root)
    expect(await runUninstall({ yes: true, keepConfig: true }, root)).toBe(0)
    expect(await readFile(path.join(root, 'instrumentation.ts'), 'utf8')).toBe(custom)
    expect(await readFile(path.join(root, 'stacknext.config.json'), 'utf8')).toContain('projectName')
  })

  it('refuses to remove runtime files while the recorded process is alive', async () => {
    const root = await project()
    await mkdir(path.join(root, '.stacknext'), { recursive: true })
    await writeRuntimeState(root, {
      version: 1,
      pid: process.pid,
      startedAt: Date.now(),
      projectDir: root,
      projectName: 'fixture-app',
      dashboardUrl: 'http://127.0.0.1:4400',
      collectorUrl: 'http://127.0.0.1:4400',
      port: 4400,
      token: 'b'.repeat(32),
    })
    expect(await runUninstall({ yes: true }, root)).toBe(1)
    expect(await readFile(runtimeStatePath(root), 'utf8')).toContain('token')
  })
})

describe('generated instrumentation', () => {
  it('detects the TypeScript and JavaScript templates across line endings', () => {
    expect(isGeneratedInstrumentation(generatedInstrumentation(true))).toBe(true)
    expect(isGeneratedInstrumentation(generatedInstrumentation(false).replace(/\n/g, '\r\n'))).toBe(true)
    expect(isGeneratedInstrumentation(`${generatedInstrumentation(false)}\n// local edit`)).toBe(false)
  })
})
