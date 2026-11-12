import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CLI_VERSION } from '../src/version.js'
import { createProgram } from '../src/program.js'
import {
  resolveSkillDirectory,
  runSkillInstall,
  runSkillPath,
  runSkillUninstall,
} from '../src/commands/skill.js'

const roots: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'stacknext-skill-'))
  roots.push(root)
  return root
}

describe('Agent Skill commands', () => {
  it('registers the skill path and install commands', () => {
    const skill = createProgram('/tmp').commands.find((command) => command.name() === 'skill')
    expect(skill?.commands.map((command) => command.name())).toEqual([
      'path',
      'install',
      'uninstall',
    ])
  })

  it('resolves the source skill and reports its version', async () => {
    const source = await resolveSkillDirectory()
    expect(await readFile(path.join(source, 'SKILL.md'), 'utf8')).toContain(
      'name: stacknext-debugging',
    )

    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await runSkillPath({ json: true })).toBe(0)
    const payload = JSON.parse(String(log.mock.calls[0]?.[0])) as {
      path: string
      version: string | null
    }
    expect(payload.path).toBe(source)
    expect(payload.version).toBe(CLI_VERSION)
  })

  it.each([
    ['opencode', '.opencode/skills/stacknext-debugging'],
    ['codex', '.agents/skills/stacknext-debugging'],
    ['claude-code', '.claude/skills/stacknext-debugging'],
  ] as const)('installs the skill for %s', async (client, relative) => {
    const root = await project()
    vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(await runSkillInstall({ client, dir: root, json: true })).toBe(0)
    const installed = path.join(root, relative)
    expect(await readFile(path.join(installed, 'SKILL.md'), 'utf8')).toContain(
      'name: stacknext-debugging',
    )
    expect(
      await readFile(path.join(installed, 'references', 'setup.md'), 'utf8'),
    ).toContain('Start StackNext')
    expect(
      await readFile(path.join(installed, 'references', 'tools.md'), 'utf8'),
    ).toContain('get_project_summary')
  })

  it('refuses to overwrite an existing skill without --force', async () => {
    const root = await project()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const installed = path.join(root, '.opencode', 'skills', 'stacknext-debugging')
    await mkdir(installed, { recursive: true })
    await writeFile(path.join(installed, 'keep.txt'), 'user content\n')

    expect(await runSkillInstall({ client: 'opencode', dir: root, json: true })).toBe(1)
    expect(await readFile(path.join(installed, 'keep.txt'), 'utf8')).toBe('user content\n')

    expect(
      await runSkillInstall({ client: 'opencode', dir: root, force: true, json: true }),
    ).toBe(0)
    await expect(readFile(path.join(installed, 'keep.txt'), 'utf8')).rejects.toThrow()
    expect(await readFile(path.join(installed, 'SKILL.md'), 'utf8')).toContain(
      'name: stacknext-debugging',
    )
  })

  it('requires a known client', async () => {
    const root = await project()
    await expect(runSkillInstall({ dir: root })).rejects.toThrow('--client')
    await expect(runSkillInstall({ client: 'unknown', dir: root })).rejects.toThrow(
      '--client',
    )
  })

  it('previews and then removes installed skills', async () => {
    const root = await project()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await runSkillInstall({ client: 'opencode', dir: root, json: true })).toBe(0)
    const installed = path.join(root, '.opencode', 'skills', 'stacknext-debugging')

    expect(await runSkillUninstall({ dir: root, json: true })).toBe(0)
    expect(await readFile(path.join(installed, 'SKILL.md'), 'utf8')).toContain(
      'name: stacknext-debugging',
    )

    expect(await runSkillUninstall({ dir: root, yes: true, json: true })).toBe(0)
    await expect(readFile(path.join(installed, 'SKILL.md'), 'utf8')).rejects.toThrow()
  })

  it('reports no skill without failing', async () => {
    const root = await project()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await runSkillUninstall({ dir: root, json: true })).toBe(0)
  })
})
