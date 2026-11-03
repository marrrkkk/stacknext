import { readRuntimeState, isProcessAlive, removeRuntimeState } from './runtime.js'
import type { RuntimeState } from './runtime.js'
import { dockerContainerStatus } from './docker/runtime.js'

export class NotRunningError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotRunningError'
  }
}

/**
 * Returns runtime state only when the recorded process is still alive. Stale
 * state is removed so the next `dev` run can start cleanly.
 */
export async function requireRunningState(projectDir: string): Promise<RuntimeState> {
  const state = await readRuntimeState(projectDir)
  if (!state) {
    throw new NotRunningError(
      'StackNext is not running for this project. Start it with "stacknext dev".',
    )
  }
  if (state.runtime?.mode === 'docker' && state.runtime.containerId) {
    const status = await dockerContainerStatus(state.runtime.containerId)
    if (status === 'stopped') {
      await removeRuntimeState(projectDir)
      throw new NotRunningError(
        'The StackNext Docker collector is no longer running. Start it with "stacknext dev --runtime docker" or clean up with "stacknext stop".',
      )
    }
    if (status === 'unknown') {
      throw new NotRunningError(
        'Could not verify the StackNext Docker collector. Check that Docker is running, then retry. Runtime state was kept so "stacknext stop" can still clean up.',
      )
    }
    return state
  }
  if (!isProcessAlive(state.pid)) {
    await removeRuntimeState(projectDir)
    throw new NotRunningError(
      'The recorded StackNext process is no longer running. Start it with "stacknext dev".',
    )
  }
  return state
}
