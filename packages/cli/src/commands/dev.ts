import { spawn, type ChildProcess } from 'node:child_process'
import { loadConfig } from '@nextscope/core'
import type { Command } from 'commander'
import {
  detectProject,
  packageManagerCommand,
  type ProjectInfo,
} from '../project.js'
import { printBanner, printCheck, printSection, style } from '../output.js'
import {
  generateToken,
  isProcessAlive,
  readRuntimeState,
  removeRuntimeState,
  runtimeStatePath,
  writeRuntimeState,
  type RuntimeState,
} from '../runtime.js'
import { resolveDashboardDir, startCollector } from '../collector/server.js'

export interface DevOptions {
  open?: boolean
  quiet?: boolean
  token?: string
}

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]]
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.unref()
  } catch {
    // Opening a browser is best effort.
  }
}

export function buildDevEnvironment(
  base: NodeJS.ProcessEnv,
  collectorUrl: string,
  token: string,
  projectName: string,
  nextVersion: string | null,
  debug = false,
  instrumentation?: { captureFetch: boolean; captureErrors: boolean; verbose: boolean },
): NodeJS.ProcessEnv {
  return {
    ...base,
    NEXTSCOPE_COLLECTOR_URL: collectorUrl,
    NEXTSCOPE_TOKEN: token,
    NEXTSCOPE_PROJECT_NAME: projectName,
    NEXTSCOPE_SERVICE_NAME: projectName,
    NEXTSCOPE_DEBUG: debug || instrumentation?.verbose === true ? '1' : '0',
    NEXTSCOPE_CAPTURE_FETCH: instrumentation?.captureFetch === false ? '0' : '1',
    NEXTSCOPE_CAPTURE_ERRORS: instrumentation?.captureErrors === false ? '0' : '1',
    ...(nextVersion ? { NEXTSCOPE_NEXT_VERSION: nextVersion } : {}),
  }
}

export function nextDevCommand(
  project: Pick<ProjectInfo, 'packageManager'>,
  nextArgs: string[],
): { command: string; args: string[] } {
  const base = packageManagerCommand(project.packageManager, 'dev')
  if (nextArgs.length === 0) return base
  if (project.packageManager === 'yarn') {
    return { command: base.command, args: [...base.args, ...nextArgs] }
  }
  return { command: base.command, args: [...base.args, '--', ...nextArgs] }
}

async function assertNotAlreadyRunning(projectDir: string): Promise<void> {
  const existing = await readRuntimeState(projectDir)
  if (!existing) return
  if (isProcessAlive(existing.pid)) {
    throw new Error(
      `NextScope is already running for this project at ${existing.dashboardUrl} (pid ${existing.pid}).`,
    )
  }
  await removeRuntimeState(projectDir)
}

export async function runDev(
  options: DevOptions,
  nextArgs: string[],
  cwd = process.cwd(),
): Promise<number> {
  const project = await detectProject(cwd)
  if (!project.scripts.dev) {
    throw new Error(
      `No "dev" script found in ${project.dir}/package.json. Add one that starts Next.js.`,
    )
  }
  if (options.token !== undefined && options.token.length < 16) {
    throw new Error('--token must be at least 16 characters')
  }
  await assertNotAlreadyRunning(project.dir)
  const config = await loadConfig(project.dir)
  const dashboardDir = await resolveDashboardDir()
  const token = options.token ?? generateToken()
  const projectName = config.projectName ?? project.name
  const startedAt = Date.now()

  printBanner('0.1.0')
  printSection(`Starting collector for ${projectName}`)
  const collector = await startCollector({
    port: config.dashboard.port,
    token,
    projectName,
    config,
    dashboardDir,
    autoPort: true,
    log: (message) => console.error(style.dim(message)),
  })

  const collectorUrl = `http://127.0.0.1:${collector.port}`
  const state: RuntimeState = {
    version: 1,
    pid: process.pid,
    startedAt,
    projectDir: project.dir,
    projectName,
    dashboardUrl: collector.url,
    collectorUrl,
    port: collector.port,
    token,
    ...(project.nextVersion ? { nextVersion: project.nextVersion } : {}),
    command: nextDevCommand(project, nextArgs).command,
  }
  await writeRuntimeState(project.dir, state)

  printCheck('pass', `Dashboard ${collector.url}`)
  printCheck(
    'pass',
    `Ingestion ${collectorUrl}/__nextscope/v1/ingest`,
    'bearer token stored in .nextscope/run.json',
  )
  if (project.nextVersion) printCheck('pass', `Next.js ${project.nextVersion}`)
  if (!project.instrumentationExists) {
    printCheck(
      'warn',
      'No instrumentation.ts found',
      'Run "nextscope init" so the app exports spans.',
    )
  } else {
    printCheck('pass', 'instrumentation.ts detected')
  }

  if (options.open) openBrowser(collector.url)

  const devCommand = nextDevCommand(project, nextArgs)
  const env = buildDevEnvironment(
    process.env,
    collectorUrl,
    token,
    projectName,
    project.nextVersion,
    process.env.NEXTSCOPE_DEBUG === '1',
    config.instrumentation,
  )

  let child: ChildProcess | null = null
  let shuttingDown = false
  let resolveExit: ((code: number) => void) | null = null
  const finished = new Promise<number>((resolve) => {
    resolveExit = resolve
  })

  const shutdown = async (exitCode: number): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child?.kill('SIGKILL')
          resolve()
        }, 3_000)
        timer.unref()
        child?.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
      })
    }
    await collector.close()
    await removeRuntimeState(project.dir)
    resolveExit?.(exitCode)
  }

  process.once('SIGINT', () => {
    void shutdown(130)
  })
  process.once('SIGTERM', () => {
    void shutdown(143)
  })

  if (!options.quiet) {
    printSection(`Starting Next.js (${devCommand.command} ${devCommand.args.join(' ')})`)
  }
  child = spawn(devCommand.command, devCommand.args, {
    cwd: project.dir,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  child.once('error', (error) => {
    console.error(style.red(`Could not start Next.js: ${error.message}`))
    void shutdown(1)
  })
  child.once('exit', (code, signal) => {
    void shutdown(signal && !shuttingDown ? 1 : (code ?? 0))
  })

  const exitCode = await finished
  if (!options.quiet) {
    printSection('NextScope stopped')
    console.log(style.dim(`Runtime state removed (${runtimeStatePath(project.dir)})`))
  }
  return exitCode
}

export function registerDevCommand(program: Command, cwd: string): void {
  program
    .command('dev')
    .description('Start the local collector and the project dev server')
    .option('--open', 'open the dashboard in the default browser')
    .option('--quiet', 'reduce startup output')
    .option('--token <token>', 'use an existing collector token (16+ characters)')
    .argument('[nextArgs...]', 'arguments forwarded to the Next.js dev server')
    .action(async (nextArgs: string[], options: DevOptions) => {
      const code = await runDev(options, nextArgs, cwd)
      if (code !== 0) process.exitCode = code
    })
}
