import { readRuntimeState, isProcessAlive, removeRuntimeState } from './runtime.js'
import type { RuntimeState } from './runtime.js'

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
      'NextScope is not running for this project. Start it with "nextscope dev".',
    )
  }
  if (!isProcessAlive(state.pid)) {
    await removeRuntimeState(projectDir)
    throw new NotRunningError(
      'The recorded NextScope process is no longer running. Start it with "nextscope dev".',
    )
  }
  return state
}
