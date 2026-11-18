import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_RULES_BEGIN,
  installAgentRules,
  renderAgentRules,
} from '../src/agents.js'
import { runDoctor } from '../src/commands/doctor.js'
import { CLI_VERSION } from '../src/version.js'

const mcpCheck = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true, toolCount: 21, promptCount: 5 })),
)
vi.mock('@stacknext/mcp', () => ({ verifyMcpServer: mcpCheck }))

interface DoctorJson {
  projectName: string
  checks: Array<{
    group: string
    status: 'pass' | 'warn' | 'fail'
    label: string
    detail?: string
  }>
  failures: number
  warnings: number
}

const roots: string[] = []

afterEach(async () => {
  mcpCheck.mockClear()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'stacknext-doctor-'))
  roots.push(dir)
  await writeFile(
    path.join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'doctor-fixture',
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

async function doctorJson(dir: string): Promise<DoctorJson> {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  try {
    await runDoctor({ json: true }, dir)
    const output = spy.mock.calls.map((call) => call.join(' ')).join('\n')
    return JSON.parse(output) as DoctorJson
  } finally {
    spy.mockRestore()
  }
}

function agentsOf(result: DoctorJson): DoctorJson['checks'] {
  return result.checks.filter((check) => check.group === 'Agents')
}

describe('doctor agent-readiness group', () => {
  it('reports every agent check as an optional warning when nothing is set up', async () => {
    const dir = await project()
    const result = await doctorJson(dir)
    const agents = agentsOf(result)

    expect(result.projectName).toBe('doctor-fixture')
    expect(typeof result.failures).toBe('number')
    expect(typeof result.warnings).toBe('number')
    expect(agents).toHaveLength(5)
    expect(agents.map((check) => check.label)).toEqual([
      'MCP server check skipped',
      'Agent Skill not installed',
      'Managed AGENTS.md block missing or outdated',
      'No local StackNext package docs resolvable',
      'Runtime token file is missing or not 0600',
    ])
    expect(agents.every((check) => check.status === 'warn')).toBe(true)
    expect(mcpCheck).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('"token"')
  })

  it('passes the MCP check through verifyMcpServer when a runtime exists', async () => {
    const dir = await project()
    await mkdir(path.join(dir, '.stacknext'), { recursive: true })
    await writeFile(
      path.join(dir, '.stacknext', 'run.json'),
      `${JSON.stringify({
        version: 1,
        pid: process.pid,
        startedAt: Date.now(),
        projectDir: dir,
        projectName: 'doctor-fixture',
        dashboardUrl: 'http://127.0.0.1:4400',
        collectorUrl: 'http://127.0.0.1:4400',
        port: 4400,
        token: 'x'.repeat(32),
      })}\n`,
      { mode: 0o600 },
    )
    const result = await doctorJson(dir)
    const mcp = agentsOf(result).find((check) => check.label.startsWith('MCP server'))
    expect(mcp?.status).toBe('pass')
    expect(mcp?.detail).toContain('21 tools')
    expect(mcpCheck).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:4400',
      token: 'x'.repeat(32),
    })
    expect(JSON.stringify(result)).not.toContain('x'.repeat(32))
    expect(
      agentsOf(result).find((check) => check.label.includes('Runtime token file'))?.status,
    ).toBe('pass')
  })

  it('passes skill, AGENTS.md and package-doc checks when agent setup is present', async () => {
    const dir = await project()
    await mkdir(path.join(dir, '.opencode', 'skills', 'stacknext-debugging'), {
      recursive: true,
    })
    const packageDir = path.join(dir, 'node_modules', '@stacknext', 'cli')
    await mkdir(path.join(packageDir, 'docs'), { recursive: true })
    await writeFile(
      path.join(packageDir, 'package.json'),
      `${JSON.stringify({ name: '@stacknext/cli', version: CLI_VERSION })}\n`,
    )
    await writeFile(path.join(packageDir, 'docs', 'index.md'), '# docs\n')
    await installAgentRules(dir, {
      version: CLI_VERSION,
      packages: [
        {
          name: '@stacknext/cli',
          version: CLI_VERSION,
          docsPath: 'node_modules/@stacknext/cli/docs/index.md',
          visibility: 'public',
          role: 'CLI',
        },
      ],
    })

    const result = await doctorJson(dir)
    const agents = agentsOf(result)
    expect(agents.find((check) => check.label.startsWith('Agent Skill'))?.status).toBe('pass')
    expect(agents.find((check) => check.label.startsWith('Managed AGENTS.md'))?.status).toBe(
      'pass',
    )
    expect(agents.find((check) => check.label.startsWith('Local package docs'))?.status).toBe(
      'pass',
    )
    expect(renderAgentRules({ version: CLI_VERSION, packages: [] })).toContain(AGENT_RULES_BEGIN)
  })

  it('warns when the runtime token file is group- or world-readable', async () => {
    const dir = await project()
    await mkdir(path.join(dir, '.stacknext'), { recursive: true })
    await writeFile(
      path.join(dir, '.stacknext', 'run.json'),
      `${JSON.stringify({ pid: 1 })}\n`,
      { mode: 0o644 },
    )
    const result = await doctorJson(dir)
    const runCheck = agentsOf(result).find((check) => check.label.includes('Runtime token file'))
    expect(runCheck?.status).toBe('warn')
  })
})
