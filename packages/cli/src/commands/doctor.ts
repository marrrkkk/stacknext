import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import type { HealthResponse, StackNextConfig } from '@stacknext/core'
import { StackNextConfigError } from '@stacknext/core'
import { loadConfig } from '@stacknext/core/config-file'
import { collectorJson } from '../http.js'
import { printSection, style } from '../output.js'
import { detectProject } from '../project.js'
import { isProcessAlive, readRuntimeState, runtimeStatePath } from '../runtime.js'
import { resolveDashboardDir } from '../collector/server.js'
import { requireRunningState } from '../session.js'
import {
  checkDockerAvailability,
  dockerContainerStatus,
} from '../docker/runtime.js'
import { resolveDockerImage } from '../docker/image.js'
import { dockerRunner } from '../docker/runner.js'
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
  try {
    const project = await detectProject(cwd)
    projectName = project.name
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

    if (config?.runtime.mode === 'docker') {
      try {
        const docker = await checkDockerAvailability()
        add('Docker', 'pass', `Docker ${docker.version}`)
        const image = await resolveDockerImage({ cliVersion: CLI_VERSION })
        const inspected = await dockerRunner.run(['image', 'inspect', image], {
          timeoutMs: 10_000,
        })
        if (inspected.code === 0) {
          add('Docker', 'pass', 'Runtime image is available locally', image)
        } else {
          add(
            'Docker',
            'warn',
            'Runtime image is not present locally',
            `"stacknext dev --docker" will pull ${image}`,
          )
        }
      } catch (error) {
        add(
          'Docker',
          'fail',
          'Docker runtime is not ready',
          error instanceof Error ? error.message : String(error),
        )
      }
    }

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

  if (config?.runtime.mode === 'docker') {
    add(
      'Dashboard',
      'pass',
      'Dashboard is served by the Docker image',
      'a host dashboard build is not required in Docker mode',
    )
  } else {
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
  }

  const runtime = await readRuntimeState(cwd).catch(() => null)
  const dockerState =
    runtime?.runtime?.mode === 'docker' && runtime.runtime.containerId
      ? await dockerContainerStatus(runtime.runtime.containerId)
      : null
  if (!runtime) {
    add('Collector', 'warn', 'StackNext is not running', 'Start it with "stacknext dev"')
  } else if (dockerState === 'stopped') {
    add(
      'Collector',
      'warn',
      'Stale Docker runtime state',
      `Container ${runtime.runtime?.containerId?.slice(0, 12) ?? '(unknown)'} is not running; restart with "stacknext dev --docker"`,
    )
  } else if (dockerState === 'unknown') {
    add(
      'Collector',
      'warn',
      'Could not verify the Docker collector',
      'Check that Docker is running; runtime state was kept',
    )
  } else if (dockerState === null && !isProcessAlive(runtime.pid)) {
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
      add(
        'Collector',
        'pass',
        `Collector healthy on port ${state.port}`,
        state.runtime?.mode === 'docker' ? 'docker container' : 'native process',
      )
      add(
        'Collector',
        health.connected ? 'pass' : 'warn',
        health.connected ? 'Instrumentation connected' : 'No app heartbeat yet',
        health.connected
          ? `${health.connections.filter((entry) => entry.connected).length} instance(s)`
          : 'Make a request after Next.js starts',
      )
      add(
        'Collector',
        'pass',
        `${health.counts.requests} requests, ${health.counts.spans} spans, ${health.counts.errors} errors`,
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
