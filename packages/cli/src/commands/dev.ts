import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { nextOtelVerboseStatus } from '@stacknext/core'
import { loadConfig } from '@stacknext/core/config-file'
import type { Command } from 'commander'
import {
  detectProject,
  packageManagerCommand,
  type ProjectInfo,
} from '../project.js'
import { printBanner, printCheck, printSection, style } from '../output.js'
import {
  acquireRuntimeLock,
  generateToken,
  isProcessAlive,
  readRuntimeState,
  removeRuntimeState,
  runtimeStatePath,
  writeRuntimeState,
  type RuntimeLock,
  type RuntimeState,
} from '../runtime.js'
import { resolveDashboardDir, startCollector } from '../collector/server.js'
import { detectRunningNextDev } from '../next-dev.js'
import { CLI_VERSION } from '../version.js'

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
  const inheritedVerbose = base.NEXT_OTEL_VERBOSE
  const verboseEnv =
    inheritedVerbose !== undefined && inheritedVerbose.trim() !== ''
      ? inheritedVerbose
      : instrumentation?.verbose === true
        ? '1'
        : undefined
  return {
    ...base,
    STACKNEXT_COLLECTOR_URL: collectorUrl,
    STACKNEXT_TOKEN: token,
    STACKNEXT_PROJECT_NAME: projectName,
    STACKNEXT_SERVICE_NAME: projectName,
    STACKNEXT_DEBUG: debug || instrumentation?.verbose === true ? '1' : '0',
    STACKNEXT_CAPTURE_FETCH: instrumentation?.captureFetch === false ? '0' : '1',
    STACKNEXT_CAPTURE_ERRORS: instrumentation?.captureErrors === false ? '0' : '1',
    ...(verboseEnv !== undefined ? { NEXT_OTEL_VERBOSE: verboseEnv } : {}),
    ...(nextVersion ? { STACKNEXT_NEXT_VERSION: nextVersion } : {}),
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
      `StackNext is already running for this project at ${existing.dashboardUrl} (pid ${existing.pid}).`,
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
  const runningNext = await detectRunningNextDev(project.dir)
  if (runningNext) {
    const endpoint = runningNext.appUrl
      ? ` (${runningNext.appUrl})`
      : runningNext.port
        ? ` on port ${runningNext.port}`
        : ''
    throw new Error(
      `A Next.js dev server is already running for this project${endpoint} as pid ${runningNext.pid}. Stop it before starting "stacknext dev" so StackNext instruments the server it starts.`,
    )
  }
  const lock = await acquireRuntimeLock(project.dir)
  try {
    return await runDevLocked(options, nextArgs, project, lock)
  } finally {
    await lock.release()
  }
}

async function runDevLocked(
  options: DevOptions,
  nextArgs: string[],
  project: ProjectInfo,
  lock: RuntimeLock,
): Promise<number> {
  const config = await loadConfig(project.dir)
  const dashboardDir = await resolveDashboardDir()
  const token = options.token ?? generateToken()
  const projectName = config.projectName ?? project.name
  const startedAt = Date.now()
  const nextOtelVerbose = nextOtelVerboseStatus(
    config.instrumentation.verbose,
    process.env.NEXT_OTEL_VERBOSE,
  )

  printBanner(CLI_VERSION)
  printSection(`Starting collector for ${projectName}`)
  const collector = await startCollector({
    port: config.dashboard.port,
    token,
    projectName,
    config,
    dashboardDir,
    projectDir: project.dir,
    autoPort: true,
    nextOtelVerbose,
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
  try {
    await writeRuntimeState(project.dir, state)
  } catch (error) {
    await collector.close().catch(() => undefined)
    throw error
  }

  printCheck('pass', `Dashboard ${collector.url}`)
  printCheck(
    'pass',
    `Ingestion ${collectorUrl}/__stacknext/v1/ingest`,
    'bearer token stored in .stacknext/run.json',
  )
  if (project.nextVersion) printCheck('pass', `Next.js ${project.nextVersion}`)
  if (nextOtelVerbose.enabled) {
    printCheck(
      'pass',
      `Verbose Next.js spans enabled (${nextOtelVerbose.source})`,
      'NEXT_OTEL_VERBOSE=1 increases span volume and dev-server overhead',
    )
  } else if (nextOtelVerbose.source === 'unknown') {
    printCheck(
      'warn',
      'NEXT_OTEL_VERBOSE has an unrecognized value',
      'Next.js only enables verbose spans for the literal value "1"',
    )
  } else {
    printCheck(
      'pass',
      'Standard Next.js span set',
      'set instrumentation.verbose or NEXT_OTEL_VERBOSE=1 for expanded spans',
    )
  }
  if (!project.instrumentationPath) {
    printCheck(
      'warn',
      'No instrumentation file found',
      'Run "stacknext init" so the app exports spans.',
    )
  } else {
    printCheck('pass', `${path.relative(project.dir, project.instrumentationPath)} detected`)
  }

  if (options.open) openBrowser(collector.url)

  const devCommand = nextDevCommand(project, nextArgs)
  const env = buildDevEnvironment(
    process.env,
    collectorUrl,
    token,
    projectName,
    project.nextVersion,
    process.env.STACKNEXT_DEBUG === '1',
    config.instrumentation,
  )

  let child: ChildProcess | null = null
  let shuttingDown = false
  let resolveExit: ((code: number) => void) | null = null
  const finished = new Promise<number>((resolve) => {
    resolveExit = resolve
  })

  let cleanupFailed = false
  let detachHandlers: (() => void) | null = null
  const shutdown = async (exitCode: number): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    try {
      await terminateChild(child)
    } catch (error) {
      cleanupFailed = true
      console.error(
        style.red('Next.js cleanup failed:'),
        error instanceof Error ? error.message : String(error),
      )
    }
    try {
      await collector.saveSnapshotOnExit()
    } catch (error) {
      cleanupFailed = true
      console.error(
        style.red('Snapshot save failed:'),
        error instanceof Error ? error.message : String(error),
      )
    }
    try {
      await collector.close()
    } catch (error) {
      cleanupFailed = true
      console.error(
        style.red('Collector cleanup failed:'),
        error instanceof Error ? error.message : String(error),
      )
    }
    if (!cleanupFailed) {
      try {
        await removeRuntimeState(project.dir)
      } catch (error) {
        cleanupFailed = true
        console.error(
          style.red('Could not remove runtime state:'),
          error instanceof Error ? error.message : String(error),
        )
      }
    }
    if (cleanupFailed) {
      console.error(
        style.yellow(
          `Runtime state was kept at ${runtimeStatePath(project.dir)}; remove it after confirming no StackNext process is running.`,
        ),
      )
    }
    // Remove listeners so a later run in the same process does not inherit
    // this run's child or lock cleanup closures.
    detachHandlers?.()
    // An IPC channel created by a programmatic launcher keeps the event loop
    // alive after cleanup; close it before reporting the exit.
    try {
      if (process.connected) process.disconnect()
    } catch {
      // The launcher may have closed the channel first.
    }
    resolveExit?.(exitCode)
  }

  const onSigint = (): void => {
    void shutdown(130)
  }
  const onSigterm = (): void => {
    void shutdown(143)
  }
  // Windows cannot deliver SIGINT/SIGTERM to another console process, so a
  // programmatic launcher can request the same graceful shutdown over the IPC
  // channel it created. Parent processes are always trusted; no network API.
  const onMessage = (message: unknown): void => {
    if ((message as { type?: unknown } | null)?.type === 'shutdown') {
      void shutdown(0)
    }
  }
  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)
  process.on('message', onMessage)

  if (!options.quiet) {
    printSection(`Starting Next.js (${devCommand.command} ${devCommand.args.join(' ')})`)
  }
  child = spawn(devCommand.command, devCommand.args, {
    cwd: project.dir,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    // On Unix, put the app in its own process group so shutdown also stops
    // Next.js worker processes. Windows uses taskkill /T below.
    detached: process.platform !== 'win32',
  })

  const activeChild = child
  const onExit = (): void => {
    // Last-resort synchronous cleanup for unexpected exits. SIGKILL cannot be
    // intercepted; the next `stacknext dev` removes stale runtime state.
    if (activeChild.pid && processGroupAlive(activeChild.pid)) {
      terminateChildSync(activeChild)
    }
    if (!cleanupFailed) {
      try {
        rmSync(runtimeStatePath(project.dir), { force: true })
      } catch {
        // Best effort during process exit.
      }
    }
    lock.releaseSync()
  }
  process.once('exit', onExit)
  detachHandlers = () => {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
    process.off('message', onMessage)
    process.off('exit', onExit)
  }

  child.once('error', (error) => {
    console.error(style.red(`Could not start Next.js: ${error.message}`))
    void shutdown(1)
  })
  child.once('exit', (code, signal) => {
    void shutdown(signal && !shuttingDown ? 1 : (code ?? 0))
  })

  const exitCode = await finished
  if (!options.quiet) {
    printSection('StackNext stopped')
    if (cleanupFailed) {
      console.log(
        style.yellow(
          `Runtime state kept at ${runtimeStatePath(project.dir)}; remove it after confirming no StackNext process is running.`,
        ),
      )
    } else {
      console.log(style.dim(`Runtime state removed (${runtimeStatePath(project.dir)})`))
    }
  }
  return exitCode
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function processGroupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function terminateChild(child: ChildProcess | null): Promise<void> {
  if (!child) return
  if (process.platform === 'win32') {
    if (child.pid) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
    }
    return
  }
  const pid = child.pid
  if (!pid) {
    child.kill('SIGTERM')
    return
  }
  const signalGroup = (signal: NodeJS.Signals): boolean => {
    try {
      process.kill(-pid, signal)
      return true
    } catch {
      return false
    }
  }
  if (!signalGroup('SIGTERM') && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM')
  }
  const stillRunning = (): boolean =>
    processGroupAlive(pid) || (child.exitCode === null && child.signalCode === null)
  const deadline = Date.now() + 3_000
  while (stillRunning() && Date.now() < deadline) {
    await delay(50)
  }
  if (stillRunning()) {
    signalGroup('SIGKILL')
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    const killDeadline = Date.now() + 500
    while (stillRunning() && Date.now() < killDeadline) {
      await delay(25)
    }
  }
}

function terminateChildSync(child: ChildProcess): void {
  if (!child.pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    return
  }
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
    }
  }
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
