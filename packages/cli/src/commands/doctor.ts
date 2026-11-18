import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import type { HealthResponse, StackNextConfig } from '@stacknext/core'
import { StackNextConfigError } from '@stacknext/core'
import { loadConfig } from '@stacknext/core/config-file'
import { verifyMcpServer } from '@stacknext/mcp'
import {
  AGENT_RULES_BEGIN,
  AGENT_RULES_END,
  discoverAgentPackages,
} from '../agents.js'
import { collectorJson } from '../http.js'
import { printSection, style } from '../output.js'
import { detectProject } from '../project.js'
import { isProcessAlive, readRuntimeState, runtimeStatePath } from '../runtime.js'
import { resolveDashboardDir } from '../collector/server.js'
import { requireRunningState } from '../session.js'
import { installedSkills } from './skill.js'
import { CLI_VERSION } from '../version.js'

type CheckStatus = 'pass' | 'warn' | 'fail'

interface DoctorCheck {
  group: string
  status: CheckStatus
  label: string
  detail?: string
}

export interface DoctorOptions {
  json?: boolean
}

function nodeSupported(version: string): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number)
  return major > 20 || (major === 20 && minor >= 9)
}

function isIntegrated(source: string): boolean {
  return source.includes('@stacknext/next')
}

async function fileMode(file: string): Promise<number | null> {
  try {
    const info = await stat(file)
    return info.mode & 0o777
  } catch {
    return null
  }
}

export async function runDoctor(
  options: DoctorOptions,
  cwd = process.cwd(),
): Promise<number> {
  const checks: DoctorCheck[] = []
  const add = (
    group: string,
    status: CheckStatus,
    label: string,
    detail?: string,
  ): void => {
    checks.push({ group, status, label, ...(detail ? { detail } : {}) })
  }

  add(
    'Environment',
    nodeSupported(process.versions.node) ? 'pass' : 'fail',
    `Node.js ${process.versions.node}`,
    nodeSupported(process.versions.node) ? '>= 20.9' : 'StackNext requires Node.js 20.9 or newer',
  )

  let config: StackNextConfig | null = null
  let projectName = path.basename(cwd)
  let projectDir: string | null = null
  try {
    const project = await detectProject(cwd)
    projectName = project.name
    projectDir = project.dir
    add('Project', 'pass', `Project ${project.name}`, project.dir)
    if (project.nextVersion === null) {
      add('Project', 'fail', 'Next.js dependency not found')
    } else if (project.nextMajor !== null && project.nextMajor >= 15 && project.nextMajor <= 16) {
      add('Project', 'pass', `Next.js ${project.nextVersion}`)
    } else {
      add(
        'Project',
        'fail',
        `Next.js ${project.nextVersion} is not supported`,
        'Use Next.js 15 or 16 with the App Router',
      )
    }
    if (project.appDir) {
      add('Project', 'pass', `App Router at ${project.appDir}/`)
    } else {
      add('Project', 'fail', 'App Router directory not found', 'StackNext does not support the Pages Router')
    }

    try {
      config = await loadConfig(project.dir)
      add('Project', 'pass', 'stacknext.config.json is valid')
    } catch (error) {
      add(
        'Project',
        'fail',
        'Configuration is invalid',
        error instanceof StackNextConfigError
          ? error.issues.join('; ')
          : error instanceof Error
            ? error.message
            : String(error),
      )
    }

    if (!project.instrumentationExists || !project.instrumentationPath) {
      add(
        'Instrumentation',
        'fail',
        'instrumentation.ts not found',
        'Run "stacknext init" to create it',
      )
    } else {
      const source = await readFile(project.instrumentationPath, 'utf8')
      if (isIntegrated(source)) {
        add(
          'Instrumentation',
          'pass',
          'instrumentation.ts imports @stacknext/next',
          path.relative(project.dir, project.instrumentationPath),
        )
      } else {
        add(
          'Instrumentation',
          'fail',
          'instrumentation.ts does not import @stacknext/next',
          'Add registerStackNext()/onRequestError without removing existing monitoring',
        )
      }
    }

    const declared =
      project.dependencies['@stacknext/next'] ??
      project.devDependencies['@stacknext/next']
    if (declared) add('Instrumentation', 'pass', `@stacknext/next ${declared}`)
    else
      add(
        'Instrumentation',
        'warn',
        '@stacknext/next is not declared',
        'Install it with the package manager command printed by "stacknext init"',
      )

    if (config) {
      if (config.database.drizzle && !project.hasDrizzle) {
        add('Adapters', 'warn', 'Drizzle is enabled but drizzle-orm is not installed')
      }
      if (config.database.prisma && !project.hasPrisma) {
        add('Adapters', 'warn', 'Prisma is enabled but @prisma/client is not installed')
      }
      if (project.hasDrizzle && !config.database.drizzle) {
        add(
          'Adapters',
          'warn',
          'Drizzle detected but database.drizzle is false',
          'Enable it in stacknext.config.json',
        )
      }
      if (project.hasPrisma && !config.database.prisma) {
        add(
          'Adapters',
          'warn',
          'Prisma detected but database.prisma is false',
          'Enable it in stacknext.config.json',
        )
      }
      add(
        'Privacy',
        'pass',
        'Bodies, headers, cookies and SQL parameters are disabled',
      )
      add(
        'Privacy',
        'pass',
        `Retention ${Math.round(config.collector.retentionMs / 1000)}s, ${config.collector.maxSpans} spans`,
      )
    }
  } catch (error) {
    add(
      'Project',
      'fail',
      'Could not inspect the project',
      error instanceof Error ? error.message : String(error),
    )
  }

  try {
    const dashboardDir = await resolveDashboardDir()
    add('Dashboard', 'pass', 'Dashboard build found', dashboardDir)
  } catch (error) {
    add(
      'Dashboard',
      'warn',
      'Dashboard build not found',
      error instanceof Error ? error.message : String(error),
    )
  }

  const runtime = await readRuntimeState(cwd).catch(() => null)
  if (!runtime) {
    add('Collector', 'warn', 'StackNext is not running', 'Start it with "stacknext dev"')
  } else if (!isProcessAlive(runtime.pid)) {
    add(
      'Collector',
      'warn',
      'Stale runtime state',
      `Process ${runtime.pid} is not running; restart with "stacknext dev"`,
    )
  } else {
    const mode = await fileMode(runtimeStatePath(cwd))
    if (mode !== null && (mode & 0o077) !== 0) {
      add(
        'Collector',
        'warn',
        'Runtime token file is readable by other users',
        `${runtimeStatePath(cwd)} mode ${mode.toString(8)}`,
      )
    } else {
      add('Collector', 'pass', 'Runtime token file permissions are private')
    }
    try {
      const state = await requireRunningState(cwd)
      const health = await collectorJson<HealthResponse>(
        state.collectorUrl,
        '/api/health',
        state.token,
      )
      add('Collector', 'pass', `Collector healthy on port ${state.port}`)
      const externalConnections = health.connections.filter(
        (entry) => entry.connected && entry.provider === 'external',
      )
      if (externalConnections.length > 0) {
        add(
          'Instrumentation',
          'fail',
          'An existing OpenTelemetry provider owns tracing',
          'StackNext is yielding to it and is not capturing request spans. Remove the other provider and let @stacknext/next register, then restart "stacknext dev". See https://github.com/marrrkkk/stacknext/blob/main/apps/docs/integrations/nextjs.mdx',
        )
      } else {
        add(
          'Collector',
          health.connected ? 'pass' : 'warn',
          health.connected ? 'Instrumentation connected' : 'No app heartbeat yet',
          health.connected
            ? `${health.connections.filter((entry) => entry.connected).length} instance(s)`
            : 'Make a request after Next.js starts',
        )
      }
      add(
        'Capture',
        health.counts.requests > 0 ? 'pass' : 'warn',
        health.counts.requests > 0
          ? `${health.counts.requests} request(s) captured`
          : 'No request captured yet',
        health.counts.requests > 0
          ? `${health.counts.spans} spans, ${health.counts.errors} errors`
          : 'Open the app and make one real request; the Overview should show it within a few seconds',
      )
      if (health.exporter.lastError) {
        add('Collector', 'warn', 'Exporter reported an error', health.exporter.lastError)
      }
    } catch (error) {
      add(
        'Collector',
        'fail',
        'Collector is unreachable',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  // Agents: optional readiness checks. These stay warnings because agent setup
  // is optional; they never print or require a token beyond the local read.
  {
    if (runtime && isProcessAlive(runtime.pid)) {
      const state = await requireRunningState(cwd).catch(() => null)
      if (state) {
        const mcp = await verifyMcpServer({
          baseUrl: state.collectorUrl,
          token: state.token,
        })
        add(
          'Agents',
          mcp.ok ? 'pass' : 'warn',
          mcp.ok ? 'MCP server responds' : 'MCP server check failed',
          mcp.ok
            ? `${mcp.toolCount ?? 0} tools, ${mcp.promptCount ?? 0} prompts`
            : (mcp.error ?? 'MCP server did not respond'),
        )
      } else {
        add('Agents', 'warn', 'MCP server check skipped', 'Collector runtime is not readable')
      }
    } else {
      add(
        'Agents',
        'warn',
        'MCP server check skipped',
        'Start "stacknext dev" to verify the MCP server',
      )
    }

    const skills = await installedSkills(cwd)
    add(
      'Agents',
      skills.length > 0 ? 'pass' : 'warn',
      skills.length > 0
        ? `Agent Skill installed for ${skills.map((entry) => entry.label).join(', ')}`
        : 'Agent Skill not installed',
      skills.length > 0
        ? undefined
        : 'Run "stacknext skill install --client <client>"',
    )

    if (projectDir) {
      let rulesCurrent = false
      try {
        const source = await readFile(path.join(projectDir, 'AGENTS.md'), 'utf8')
        rulesCurrent =
          source.includes(AGENT_RULES_BEGIN) &&
          source.includes(AGENT_RULES_END) &&
          source.includes(`CLI v${CLI_VERSION}`)
      } catch {
        rulesCurrent = false
      }
      add(
        'Agents',
        rulesCurrent ? 'pass' : 'warn',
        rulesCurrent
          ? 'Managed AGENTS.md block is current'
          : 'Managed AGENTS.md block missing or outdated',
        rulesCurrent ? undefined : 'Run "stacknext init --agents"',
      )

      const packages = await discoverAgentPackages(projectDir)
      add(
        'Agents',
        packages.length > 0 ? 'pass' : 'warn',
        packages.length > 0
          ? `Local package docs resolvable for ${packages.length} package(s)`
          : 'No local StackNext package docs resolvable',
        packages.length > 0
          ? undefined
          : 'Install @stacknext packages, then re-run "stacknext init --agents"',
      )
    } else {
      add('Agents', 'warn', 'Managed AGENTS.md block not checked', 'Project directory is unknown')
      add('Agents', 'warn', 'Local package docs not checked', 'Project directory is unknown')
    }

    const runFileMode = await fileMode(runtimeStatePath(cwd))
    const runFilePrivate = runFileMode === 0o600
    add(
      'Agents',
      runFilePrivate ? 'pass' : 'warn',
      runFilePrivate
        ? 'Runtime token file is private (0600)'
        : 'Runtime token file is missing or not 0600',
      runFilePrivate
        ? undefined
        : 'Start "stacknext dev" so it writes .stacknext/run.json with mode 0600',
    )
  }

  const failures = checks.filter((check) => check.status === 'fail').length
  const warnings = checks.filter((check) => check.status === 'warn').length

  if (options.json) {
    console.log(JSON.stringify({ projectName, checks, failures, warnings }, null, 2))
  } else {
    console.log(`${style.bold('StackNext doctor')} — ${projectName}`)
    let currentGroup = ''
    for (const check of checks) {
      if (check.group !== currentGroup) {
        printSection(check.group)
        currentGroup = check.group
      }
      const marker =
        check.status === 'pass'
          ? style.green('✓')
          : check.status === 'warn'
            ? style.yellow('!')
            : style.red('✗')
      console.log(
        `${marker} ${check.label}${check.detail ? style.dim(` — ${check.detail}`) : ''}`,
      )
    }
    console.log(
      `\n${failures === 0 ? style.green('Ready') : style.red('Not ready')} — ${failures} failure(s), ${warnings} warning(s)`,
    )
  }
  return failures === 0 ? 0 : 1
}

export function registerDoctorCommand(program: Command, cwd: string): void {
  program
    .command('doctor')
    .description('Check the project, instrumentation and collector')
    .option('--json', 'print machine-readable JSON')
    .action(async (options: DoctorOptions) => {
      const code = await runDoctor(options, cwd)
      if (code !== 0) process.exitCode = code
    })
}
