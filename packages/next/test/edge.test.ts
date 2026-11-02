import { describe, expect, it } from 'vitest'
import {
  createRequestErrorHandler,
  getStackNextRegistration,
  onRequestError,
  registerStackNext,
  requestErrorToInput,
  shutdownStackNext,
} from '../src/edge.js'

describe('edge-safe entry point', () => {
  it('keeps instrumentation inert without Node built-ins', async () => {
    expect(await registerStackNext()).toBeNull()
    expect(getStackNextRegistration()).toBeUndefined()
    await expect(shutdownStackNext()).resolves.toBeUndefined()
    expect(() => onRequestError(new Error('edge'), {} as never, {})).not.toThrow()
    expect(createRequestErrorHandler({} as never)(new Error('edge'), {} as never, {})).toBeUndefined()
    expect(() => requestErrorToInput(new Error('edge'), {} as never, {})).toThrow(
      /Node\.js runtime/,
    )
  })
})
