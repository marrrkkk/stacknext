import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const SKILL_DIR = path.join(ROOT, 'skills', 'stacknext-debugging')
const SKILL_FILE = path.join(SKILL_DIR, 'SKILL.md')

const TOOL_NAMES = [
  'get_project_summary',
  'list_requests',
  'get_request',
  'list_traces',
  'get_trace',
  'list_errors',
  'get_error',
  'list_database_queries',
  'find_slow_requests',
  'stacknext_list_diagnostics',
  'stacknext_get_diagnostic',
  'stacknext_list_test_runs',
  'stacknext_get_test_run',
  'stacknext_list_baselines',
  'stacknext_get_baseline',
  'stacknext_list_comparisons',
  'stacknext_get_comparison',
]

interface Frontmatter {
  fields: Map<string, string>
  body: string
}

function parseFrontmatter(source: string): Frontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source)
  if (!match) throw new Error('SKILL.md has no YAML frontmatter')
  const fields = new Map<string, string>()
  for (const line of match[1]!.split(/\r?\n/)) {
    const entry = /^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/.exec(line)
    if (entry) fields.set(entry[1]!, entry[2]!.trim())
  }
  return { fields, body: match[2]! }
}

function relativeLinks(markdown: string): string[] {
  return [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1]!)
    .filter((target) => !/^[a-z]+:/i.test(target) && !target.startsWith('#'))
    .map((target) => target.split('#')[0]!)
    .filter((target) => target !== '')
}

describe('stacknext-debugging Agent Skill', () => {
  it('follows the Agent Skills frontmatter rules', async () => {
    const source = await readFile(SKILL_FILE, 'utf8')
    const { fields } = parseFrontmatter(source)
    const name = fields.get('name')
    const description = fields.get('description')

    expect(name).toBe('stacknext-debugging')
    expect(name!.length).toBeLessThanOrEqual(64)
    expect(name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    expect(path.basename(SKILL_DIR)).toBe(name)
    expect(description).toBeTruthy()
    expect(description!.length).toBeLessThanOrEqual(1_024)
    expect(description!.toLowerCase()).toContain('next.js')
    expect(fields.get('license')).toBe('MIT')
    expect(fields.get('compatibility')).toContain('Next.js')
    expect(source).toContain('metadata:')
    expect(source).toContain('version: "0.6.0"')
  })

  it('keeps SKILL.md concise and points to every reference', async () => {
    const source = await readFile(SKILL_FILE, 'utf8')
    const { body } = parseFrontmatter(source)
    expect(body.split(/\r?\n/).length).toBeLessThan(500)

    for (const reference of [
      'references/tools.md',
      'references/workflows.md',
      'references/setup.md',
    ]) {
      expect(body).toContain(reference)
      await expect(stat(path.join(SKILL_DIR, reference))).resolves.toBeTruthy()
    }

    for (const link of relativeLinks(source)) {
      await expect(
        stat(path.resolve(SKILL_DIR, link)),
        `broken link ${link}`,
      ).resolves.toBeTruthy()
    }
  })

  it('documents every MCP tool and all six workflows', async () => {
    const skill = await readFile(SKILL_FILE, 'utf8')
    const tools = await readFile(path.join(SKILL_DIR, 'references', 'tools.md'), 'utf8')
    const workflows = await readFile(
      path.join(SKILL_DIR, 'references', 'workflows.md'),
      'utf8',
    )

    for (const tool of TOOL_NAMES) {
      expect(skill).toContain(tool)
      expect(tools).toContain(tool)
    }
    for (const heading of [
      'Workflow A: runtime error',
      'Workflow B: slow request',
      'Workflow C: database investigation',
      'Workflow D: general runtime investigation',
      'Workflow E: diagnostic findings',
      'Workflow F: runtime regression evidence',
    ]) {
      expect(skill).toContain(heading)
      expect(workflows).toContain(heading)
    }
    for (const prompt of [
      'diagnose-error',
      'investigate-slow-request',
      'inspect-database-activity',
      'investigate-trace',
      'diagnose-runtime-issue',
    ]) {
      expect(skill).toContain(prompt)
    }
    expect(skill).toContain('Mandatory reasoning rules')
    expect(skill).toContain('not confirmed root causes')
    expect(skill).toContain('seventeen')
    expect(tools).toContain('seventeen tools')
    expect(tools).toContain('run-<16 hex>')
    expect(tools).toContain('base-<16 hex>')
    expect(tools).toContain('cmp-<16 hex>')
    expect(skill).toContain('inconclusive')
  })

  it('records the eight-scenario agent test results honestly', async () => {
    const testing = await readFile(
      path.join(ROOT, 'docs', 'agent-testing.md'),
      'utf8',
    )
    expect(testing).toContain('## Eight scenarios')
    for (const scenario of [
      'Discovery and orientation',
      'Runtime error diagnosis',
      'Slow request investigation',
      'Database investigation',
      'Trace and completeness',
      'Collector unavailable',
      'Read-only and redaction boundary',
      'Diagnostic finding verification',
    ]) {
      expect(testing).toContain(scenario)
    }
    expect(testing).toContain('0.3 baseline')
    expect(testing).toContain('Scenario 8 (0.4)')
    expect(testing).toContain('Claude Code')
    expect(testing).toContain('Not run')
    expect(testing).toMatch(/not authenticated/i)
    expect(testing).toContain('## 0.6 protocol-level verification')
    expect(testing).toContain('six read-only regression tools')
    expect(testing).toContain('No model-driven regression scenario')
    for (const link of relativeLinks(testing)) {
      await expect(
        stat(path.resolve(ROOT, 'docs', link)),
        `broken link ${link}`,
      ).resolves.toBeTruthy()
    }
  })

  it('documents safe setup for OpenCode, Codex and Claude Code', async () => {
    const setup = await readFile(
      path.join(SKILL_DIR, 'references', 'setup.md'),
      'utf8',
    )
    expect(setup).toContain('opencode.json')
    expect(setup).toContain('"servers"')
    expect(setup).toContain('"type": "local"')
    expect(setup).toContain('"codemode": false')
    expect(setup).toContain('[mcp_servers.stacknext]')
    expect(setup).toContain('claude mcp add')
    expect(setup).toContain('.agents/skills')
    expect(setup).toContain('.claude/skills')
    expect(setup).toContain('.opencode/skills')
    expect(setup).toMatch(/no cloud account/i)
    expect(setup).toContain('read-only')
    expect(setup).toContain('0600')
    expect(setup).toContain('seventeen tools')
    expect(setup).toContain('baseline save')
    expect(setup).toContain('MCP is read-only')
  })
})
