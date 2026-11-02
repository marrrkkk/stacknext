import { spawn, type ChildProcess } from 'node:child_process'
import type { Command } from 'commander'
import type { ConnectionInfo } from '@stacknext/core'
import { loadConfig } from '@stacknext/core/config-file'
import {
  buildEnvironmentSnapshot,
  computeRegressionStats,
  REGRESSION_LIMITATIONS,
  sanitizeCommandArg,
  saveRun,
  type CreateRunRequest,
  type TestRun,
} from '@stacknext/regression'
import { detectProject } from '../project.js'
import { generateToken } from '../runtime.js'
import { requireRunningState } from '../session.js'
import { collectorJson } from '../http.js'
import { printBanner, printCheck, printSection, style } from '../output.js'
import { startCollector, type CollectorHandle } from '../collector/server.js'
import { CLI_VERSION } from '../version.js'
import { playwrightVersion, runLines } from './regression-shared.js'

export interface CaptureOptions {
  name?: string
  project?: string
  attach?: boolean
  url?: string
  token?: string
  json?: boolean
  quiet?: boolean
}

interface ChildResult {
  code: number | null
  signal: NodeJS.Signals | null
}

interface HealthLike {
  version: string
  connections: ConnectionInfo[]
  instrumentation: {
    nextOtelVerbose: {
      enabled: boolean
      source: string
    }
  }
}

function commandSnapshot(
  args: string[],
  result: ChildResult | null,
  durationMs: number,
): TestRun['command'] {
  return {
    executable: sanitizeCommandArg(args[0] ?? 'unknown'),
    args: args.slice(1).map(sanitizeCommandArg),
    exitCode: result?.code ?? null,
    signal: result?.signal ?? null,
    durationMs,
  }
}

async function childResult(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  onSpawn: (child: ChildProcess) => void,
  keepStdoutClean = false,
): Promise<ChildResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: keepStdoutClean ? ['inherit', 'pipe', 'inherit'] : 'inherit',
      shell: process.platform === 'win32',
    })
    if (keepStdoutClean) {
      child.stdout?.on('data', (chunk: Buffer) => {
        process.stderr.write(chunk)
      })
    }
    onSpawn(child)
    child.once('error', (error) => {
      console.error(style.red(`Could not start capture command: ${error.message}`))
      resolve({ code: 1, signal: null })
    })
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
}

async function fallbackRun(
  collectorUrl: string,
  token: string,
  runId: string,
  created: TestRun,
  status: TestRun['status'],
  warnings: string[],
): Promise<TestRun> {
  try {
    const live = await collectorJson<TestRun>(
      collectorUrl,
      `/api/test-runs/${runId}`,
      token,
    )
    return {
      ...live,
      status,
      completedAt: Date.now(),
      warnings: [...new Set([...live.warnings, ...warnings])].slice(-50),
      stats: computeRegressionStats(live.scenarios),
    }
  } catch {
    return {
      ...created,
      id: runId,
      status,
      completedAt: Date.now(),
      warnings: [...new Set([...created.warnings, ...warnings])].slice(-50),
      limitations: [...REGRESSION_LIMITATIONS],
      stats: computeRegressionStats(created.scenarios),
    }
  }
}

export async function runCapture(
  options: CaptureOptions,
  commandArgs: string[],
  cwd = process.cwd(),
): Promise<number> {
  if (commandArgs.length === 0) {
    throw new Error(
      'Provide the test command to capture after "--", for example: stacknext capture --name main -- pnpm exec playwright test',
    )
  }
  const project = await detectProject(cwd)
  const config = await loadConfig(project.dir)
  const projectName = options.project ?? config.projectName ?? project.name
  const token = options.token ?? process.env.STACKNEXT_TOKEN
  let collector: CollectorHandle | null = null
  let attached = false
  let collectorUrl: string
  let collectorToken: string

  if (options.url) {
    collectorUrl = options.url
    if (!token || token.length < 16) {
      throw new Error('--url requires --token (or STACKNEXT_TOKEN) with at least 16 characters')
    }
    collectorToken = token
  } else {
    try {
      const state = await requireRunningState(project.dir)
      attached = true
      collectorUrl = state.collectorUrl
      collectorToken = state.token
    } catch (error) {
      if (options.attach) throw error
      collector = await startCollector({
        port: 0,
        autoPort: false,
        token: generateToken(),
        projectName,
        config,
        dashboardDir: null,
        projectDir: project.dir,
        version: CLI_VERSION,
        log: options.quiet ? undefined : (message) => console.error(style.dim(message)),
      })
      collectorUrl = `http://127.0.0.1:${collector.port}`
      collectorToken = collector.token
      attached = false
    }
  }

  const startedAt = Date.now()
  let run: TestRun
  try {
    let health: HealthLike | null = null
    try {
      health = await collectorJson<HealthLike>(collectorUrl, '/api/health', collectorToken)
    } catch (error) {
      throw new Error(
        `Could not reach the StackNext collector at ${collectorUrl}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
    const environment = buildEnvironmentSnapshot({
      config,
      connections: health?.connections ?? [],
      verbose: health?.instrumentation.nextOtelVerbose
        ? {
            enabled: health.instrumentation.nextOtelVerbose.enabled,
            source: health.instrumentation.nextOtelVerbose.source as
              | 'config'
              | 'environment'
              | 'disabled'
              | 'unknown',
          }
        : undefined,
      playwrightVersion: await playwrightVersion(project.dir),
    })
    const request: CreateRunRequest = {
      name: options.name?.trim() || `capture ${new Date(startedAt).toISOString()}`,
      projectName,
      environment,
      collectorVersion: health?.version ?? CLI_VERSION,
      command: commandSnapshot(commandArgs, null, 0),
    }
    const created = await collectorJson<{ run: TestRun }>(
      collectorUrl,
      '/api/test-runs',
      collectorToken,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      },
    )
    run = created.run
  } catch (error) {
    await collector?.close()
    throw error
  }

  if (!options.quiet) {
    printBanner(CLI_VERSION)
    printSection(`Capturing ${run.name}`)
    printCheck('pass', `Collector ${collectorUrl}`, attached ? 'attached to stacknext dev' : 'ephemeral')
    printCheck('pass', `Run ${run.id}`)
    printSection(`Running ${commandArgs.join(' ')}`)
  }

  let child: ChildProcess | null = null
  let interruptedBy: NodeJS.Signals | null = null
  const forward = (signal: NodeJS.Signals): void => {
    interruptedBy = signal
    try {
      child?.kill(signal)
    } catch {
      // The child may have exited between the signal and this handler.
    }
  }
  const onSigint = (): void => forward('SIGINT')
  const onSigterm = (): void => forward('SIGTERM')
  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    STACKNEXT_TEST_RUN_ID: run.id,
    STACKNEXT_COLLECTOR_URL: collectorUrl,
    STACKNEXT_TOKEN: collectorToken,
    STACKNEXT_CAPTURE: '1',
    STACKNEXT_PROJECT_NAME: projectName,
  }

  let result: ChildResult
  try {
    result = await childResult(
      commandArgs[0] ?? '',
      commandArgs.slice(1),
      env,
      project.dir,
      (spawned) => {
        child = spawned
      },
      options.json === true,
    )
  } finally {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
  }

  const durationMs = Date.now() - startedAt
  run.command = commandSnapshot(commandArgs, result, durationMs)
  const interrupted = interruptedBy !== null
  const requestedStatus: TestRun['status'] = interrupted
    ? 'interrupted'
    : result.code === 0
      ? 'completed'
      : 'failed'
  const warnings: string[] = []
  if (interruptedBy) {
    warnings.push(`Capture command was interrupted by ${interruptedBy}.`)
  }
  if (result.signal) {
    warnings.push(`Capture command exited with signal ${result.signal}.`)
  }

  try {
    const completed = await collectorJson<{ run: TestRun }>(
      collectorUrl,
      `/api/test-runs/${run.id}/complete`,
      collectorToken,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: requestedStatus,
          warnings,
          command: commandSnapshot(commandArgs, result, durationMs),
        }),
      },
    )
    run = completed.run
  } catch (error) {
    warnings.push(
      `Collector finalization failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    run = await fallbackRun(
      collectorUrl,
      collectorToken,
      run.id,
      run,
      'incomplete',
      warnings,
    )
  }
  run = {
    ...run,
    command: commandSnapshot(commandArgs, result, durationMs),
  }

  let savedPath: string
  try {
    savedPath = await saveRun(project.dir, run)
  } finally {
    await collector?.close()
  }

  let exitCode = result.code ?? 1
  if (interruptedBy === 'SIGINT') exitCode = 130
  else if (interruptedBy === 'SIGTERM') exitCode = 143
  if (exitCode === 0 && run.status !== 'completed') exitCode = 3

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          run,
          path: savedPath,
          exitCode,
          telemetryComplete: run.status === 'completed',
        },
        null,
        2,
      ),
    )
    return exitCode
  }

  printSection('Capture result')
  console.log(runLines(run))
  console.log('')
  printCheck(
    run.status === 'completed' ? 'pass' : 'warn',
    `Saved ${savedPath}`,
    `${run.stats.verifiedSamples}/${run.stats.samples} verified samples`,
  )
  if (run.status !== 'completed') {
    printCheck(
      'warn',
      'Telemetry is incomplete',
      'exit code 3; no regression verdict can be inferred from this run',
    )
  } else {
    printCheck(
      'pass',
      'Next: stacknext baseline save ' + run.id + ' --name <name>',
    )
  }
  return exitCode
}

export function registerCaptureCommand(program: Command, cwd: string): void {
  program
    .command('capture')
    .description('Run a Playwright command and save correlated runtime telemetry as a test run')
    .option('--name <name>', 'human-readable run name')
    .option('--project <name>', 'StackNext project name override')
    .option('--attach', 'require an existing stacknext dev collector')
    .option('--url <url>', 'attach to a specific loopback collector URL')
    .option('--token <token>', 'collector bearer token for --url')
    .option('--json', 'print machine-readable JSON')
    .option('--quiet', 'reduce capture output')
    .argument('[command...]', 'test command to run (pass after --)')
    .action(async (commandArgs: string[], options: CaptureOptions) => {
      const code = await runCapture(options, commandArgs, cwd)
      if (code !== 0) process.exitCode = code
    })
}
