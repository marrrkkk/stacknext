import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  AGENT_RULES_BEGIN,
  AGENT_RULES_END,
  discoverAgentPackages,
  installAgentRules,
  renderAgentRules,
} from '../src/agents.js'
import { runInit } from '../src/commands/init.js'

const roots: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function root(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'stacknext-agents-'))
  roots.push(dir)
  return dir
}

async function fakePackage(
  projectDir: string,
  slug: string,
  version = '0.7.0',
): Promise<void> {
  const packageDir = path.join(projectDir, 'node_modules', '@stacknext', slug)
  await mkdir(path.join(packageDir, 'docs'), { recursive: true })
  await writeFile(
    path.join(packageDir, 'package.json'),
    `${JSON.stringify({ name: `@stacknext/${slug}`, version }, null, 2)}\n`,
  )
  await writeFile(path.join(packageDir, 'docs', 'index.md'), '# docs\n')
}

async function appProject(): Promise<string> {
  const dir = await root()
  await writeFile(
    path.join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'fixture-app',
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

describe('managed StackNext agent rules', () => {
  it('renders only installed package documentation paths', async () => {
    const dir = await root()
    await fakePackage(dir, 'cli')
    await fakePackage(dir, 'next')
    const packages = await discoverAgentPackages(dir)
    expect(packages.map((entry) => entry.name)).toEqual([
      '@stacknext/cli',
      '@stacknext/next',
    ])

    const block = renderAgentRules({ version: '0.7.0', packages })
    expect(block).toContain(AGENT_RULES_BEGIN)
    expect(block).toContain(AGENT_RULES_END)
    expect(block).toContain('node_modules/@stacknext/next/docs/index.md')
    expect(block).not.toContain('node_modules/@stacknext/prisma/docs/index.md')
    expect(block).toContain('v0.7.0')
    expect(block.split('\n').filter((line) => /^\d+\. /.test(line))).toHaveLength(9)
  })

  it('finds packages hoisted above the app directory', async () => {
    const workspace = await root()
    const app = path.join(workspace, 'apps', 'web')
    await mkdir(app, { recursive: true })
    await fakePackage(workspace, 'cli')
    await fakePackage(workspace, 'next')

    const packages = await discoverAgentPackages(app)
    expect(packages.map((entry) => entry.name)).toEqual([
      '@stacknext/cli',
      '@stacknext/next',
    ])
    expect(packages[1]?.docsPath).toBe(
      '../../node_modules/@stacknext/next/docs/index.md',
    )
  })

  it('says when no package docs are installed instead of inventing paths', async () => {
    const dir = await root()
    const packages = await discoverAgentPackages(dir)
    const block = renderAgentRules({ version: '0.7.0', packages })
    expect(packages).toEqual([])
    expect(block).toContain('No StackNext package docs were found')
    expect(block).not.toContain('node_modules/@stacknext/')
    expect(block.split('\n').filter((line) => /^\d+\. /.test(line))).toHaveLength(7)
  })

  it('creates AGENTS.md without touching any other file', async () => {
    const dir = await root()
    await fakePackage(dir, 'cli')
    const result = await installAgentRules(dir, {
      version: '0.7.0',
      packages: await discoverAgentPackages(dir),
    })
    expect(result.status).toBe('created')
    const contents = await readFile(path.join(dir, 'AGENTS.md'), 'utf8')
    expect(contents).toContain(AGENT_RULES_BEGIN)
    expect(contents.endsWith('\n')).toBe(true)
  })

  it('appends the block while preserving user content exactly', async () => {
    const dir = await root()
    const original = '# House rules\n\n- Keep responses short.\n'
    await writeFile(path.join(dir, 'AGENTS.md'), original)
    const result = await installAgentRules(dir, { version: '0.7.0', packages: [] })
    expect(result.status).toBe('appended')
    const contents = await readFile(path.join(dir, 'AGENTS.md'), 'utf8')
    expect(contents.startsWith(original)).toBe(true)
    expect(contents).toContain(AGENT_RULES_BEGIN)
  })

  it('updates only the managed block and is idempotent', async () => {
    const dir = await root()
    const file = path.join(dir, 'AGENTS.md')
    await writeFile(file, '# Before\n\nkeep this\n')
    const first = await installAgentRules(dir, { version: '0.6.0', packages: [] })
    expect(first.status).toBe('appended')
    const afterFirst = await readFile(file, 'utf8')

    const second = await installAgentRules(dir, { version: '0.7.0', packages: [] })
    expect(second.status).toBe('updated')
    const afterSecond = await readFile(file, 'utf8')
    expect(afterSecond.startsWith('# Before\n\nkeep this\n')).toBe(true)
    expect(afterSecond).toContain('v0.7.0')
    expect(afterSecond.split(AGENT_RULES_BEGIN)).toHaveLength(2)

    const third = await installAgentRules(dir, { version: '0.7.0', packages: [] })
    expect(third.status).toBe('unchanged')
    expect(await readFile(file, 'utf8')).toBe(afterSecond)
    expect(afterSecond.endsWith(afterFirst)).toBe(false)
  })

  it('preserves CRLF line endings and content outside the block', async () => {
    const dir = await root()
    const file = path.join(dir, 'AGENTS.md')
    const original = '# Rules\r\n\r\n- one\r\n- two\r\n'
    await writeFile(file, original)
    await installAgentRules(dir, { version: '0.7.0', packages: [] })
    const contents = await readFile(file, 'utf8')
    expect(contents.startsWith(original)).toBe(true)
    expect(contents).toContain(`${AGENT_RULES_BEGIN}\r\n`)
    expect(contents).not.toMatch(/[^\r]\n/)
  })

  it('refuses duplicate or partial managed blocks without changing the file', async () => {
    const dir = await root()
    const file = path.join(dir, 'AGENTS.md')
    const duplicate = `${AGENT_RULES_BEGIN}\na\n${AGENT_RULES_END}\n${AGENT_RULES_BEGIN}\nb\n${AGENT_RULES_END}\n`
    await writeFile(file, duplicate)
    await expect(
      installAgentRules(dir, { version: '0.7.0', packages: [] }),
    ).rejects.toThrow('more than one')
    expect(await readFile(file, 'utf8')).toBe(duplicate)

    const partial = `# Rules\n${AGENT_RULES_BEGIN}\nold\n`
    await writeFile(file, partial)
    await expect(
      installAgentRules(dir, { version: '0.7.0', packages: [] }),
    ).rejects.toThrow('incomplete')
    expect(await readFile(file, 'utf8')).toBe(partial)
  })

  it('installs only when init --agents is requested and skips with --skip-agents', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const dir = await appProject()
    expect(await runInit({}, dir)).toBe(0)
    await expect(readFile(path.join(dir, 'AGENTS.md'), 'utf8')).rejects.toThrow()

    expect(await runInit({ agents: true, skipAgents: true }, dir)).toBe(0)
    await expect(readFile(path.join(dir, 'AGENTS.md'), 'utf8')).rejects.toThrow()

    expect(await runInit({ agents: true }, dir)).toBe(0)
    const contents = await readFile(path.join(dir, 'AGENTS.md'), 'utf8')
    expect(contents).toContain(AGENT_RULES_BEGIN)
    expect(contents).toContain('No StackNext package docs were found')
  })
})
