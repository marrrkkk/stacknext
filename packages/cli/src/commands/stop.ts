import { readFile } from 'node:fs/promises'
import type { Command } from 'commander'
import { printCheck, printSection, style } from '../output.js'
import { detectProject } from '../project.js'
import {
  isProcessAlive,
  readRuntimeLockPid,
  readRuntimeState,
  removeRuntimeState,
  runtimeStatePath,
} from '../runtime.js'
import {
  checkDockerAvailability,
  DockerUnavailableError,
  stopDockerCollector,
} from '../docker/runtime.js'
import type { DockerRunner } from '../docker/runner.js'

export interface StopOptions {
  json?: boolean
  /** Injectable for tests; the command always uses the real Docker CLI. */
  runner?: DockerRunner
}

/**
 * Stops only this project's StackNext Docker resources. It never performs a
 * global `docker system prune` or removes a container without the StackNext
 * project label.
 */
export async function runStop(
  options: StopOptions,
  cwd = process.cwd(),
): Promise<number> {
  const project = await detectProject(cwd)
  const state = await readRuntimeState(project.dir).catch(() => null)
  // Runtime state written before the Docker runtime existed has no `runtime`
  // field and must still be treated as a native process.
  const mode = state?.runtime?.mode ?? 'native'
  const statePid = state && isProcessAlive(state.pid) ? state.pid : null
  // `run.json` is written only after the collector is ready, so a second
  // process could otherwise remove a container that is still starting.
  const lockPid = await readRuntimeLockPid(project.dir)
  const liveLockPid =
    lockPid !== null && isProcessAlive(lockPid) ? lockPid : null
  const runningPid = statePid ?? liveLockPid

  if (runningPid !== null) {
    const message =
      statePid === null
        ? `StackNext is starting for this project (pid ${runningPid}). Wait for startup to finish or stop it with SIGINT/SIGTERM.`
        : mode === 'docker'
          ? `A StackNext runtime is running (pid ${runningPid}). Stop it with Ctrl+C (SIGINT/SIGTERM) instead of "stacknext stop".`
          : 'A native StackNext runtime is running. Stop it with Ctrl+C (SIGINT/SIGTERM) instead of "stacknext stop".'
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            removed: [],
            runningPid,
            runtime: mode,
            starting: statePid === null,
            ...(statePid !== null && mode === 'native'
              ? { nativePid: runningPid }
              : {}),
            error: message,
          },
          null,
          2,
        ),
      )
    } else {
      console.error(`${style.red('Error')} ${message}`)
    }
    return 1
  }

  let removed: string[] = []
  let dockerWarning: string | null = null
  if (state && mode === 'docker') {
    try {
      await checkDockerAvailability(options.runner)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (options.json) {
        console.log(JSON.stringify({ removed, error: message }, null, 2))
      } else {
        console.error(`${style.red('Error')} ${message}`)
      }
      return 1
    }
    try {
      const result = await stopDockerCollector(project.dir, {
        containerId: state.runtime?.containerId,
        ...(options.runner ? { runner: options.runner } : {}),
      })
      removed = result.removed
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (options.json) {
        console.log(JSON.stringify({ removed, error: message }, null, 2))
      } else {
        console.error(`${style.red('Error')} ${message}`)
      }
      return 1
    }
  } else {
    // No runtime state can still mean a container was left behind after an
    // abnormal CLI exit. Remove only project-labelled managed containers.
    try {
      await checkDockerAvailability(options.runner)
      const result = await stopDockerCollector(project.dir, {
        ...(options.runner ? { runner: options.runner } : {}),
      })
      removed = result.removed
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (error instanceof DockerUnavailableError) {
        // Native users and projects without Docker installed should still be
        // able to clear stale runtime state; only a recorded Docker runtime
        // requires the daemon.
        dockerWarning = message
      } else {
        if (options.json) {
          console.log(JSON.stringify({ removed, error: message }, null, 2))
        } else {
          console.error(`${style.red('Error')} ${message}`)
        }
        return 1
      }
    }
  }

  const stateExisted = await readFile(runtimeStatePath(project.dir), 'utf8')
    .then(() => true)
    .catch(() => false)
  await removeRuntimeState(project.dir)
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          project: project.dir,
          removed,
          runtimeState: runtimeStatePath(project.dir),
          runtimeStateRemoved: stateExisted,
          ...(dockerWarning ? { warning: dockerWarning } : {}),
        },
        null,
        2,
      ),
    )
    return 0
  }

  printSection(`StackNext stop — ${project.name}`)
  if (dockerWarning) {
    printCheck('warn', 'Docker unavailable; skipped stale container cleanup', dockerWarning)
  } else if (removed.length === 0) {
    printCheck('pass', 'No StackNext-managed Docker containers were running')
  } else {
    for (const id of removed) printCheck('pass', `Removed container ${id}`)
  }
  if (stateExisted) {
    printCheck('pass', 'Runtime state removed', runtimeStatePath(project.dir))
  } else {
    printCheck('pass', 'No runtime state to remove')
  }
  return 0
}

export function registerStopCommand(program: Command, cwd: string): void {
  program
    .command('stop')
    .description('Stop and remove this project’s StackNext Docker resources')
    .option('--json', 'print machine-readable JSON')
    .action(async (options: StopOptions) => {
      const code = await runStop(options, cwd)
      if (code !== 0) process.exitCode = code
    })
}
