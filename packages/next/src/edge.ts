/**
 * Edge-safe entry point. Next.js compiles `instrumentation.ts` for the Edge
 * runtime even when the project has no edge routes. The generated hook returns
 * before importing StackNext when `NEXT_RUNTIME !== 'nodejs'`, but the bundler
 * still resolves the dynamic import. This module keeps that resolution free of
 * Node built-ins and OpenTelemetry Node SDK code.
 *
 * Instrumentation and the collector transport are intentionally inert here.
 */
import type { StackNextErrorInput } from '@stacknext/core'
import type { StackNextTransport } from '@stacknext/core/transport'
import type {
  NextRequestErrorContext,
  NextRequestInfo,
} from './error.js'
import type {
  StackNextRegisterOptions,
  StackNextRegistration,
} from './register.js'

export {
  StackNextSpanExporter,
  readableSpanToInput,
  spanAttributes,
  type StackNextSpanExporterOptions,
} from './exporter.js'
export {
  withStackNextAction,
  withStackNextSpan,
  withStackNextSpanSync,
  type StackNextManualSpanOptions,
} from './manual.js'
export type {
  NextRequestErrorContext,
  NextRequestInfo,
} from './error.js'
export type {
  StackNextRegisterOptions,
  StackNextRegistration,
} from './register.js'

export async function registerStackNext(
  options: StackNextRegisterOptions = {},
): Promise<StackNextRegistration | null> {
  void options
  return null
}

export const register = registerStackNext

export function getStackNextRegistration(): StackNextRegistration | undefined {
  return undefined
}

export async function shutdownStackNext(): Promise<void> {
  // Nothing was registered on the Edge runtime.
}

export function onRequestError(
  error: unknown,
  request: NextRequestInfo,
  context: NextRequestErrorContext,
): void {
  void error
  void request
  void context
}

type ErrorSink = Pick<StackNextTransport, 'enqueueError'>

export function createRequestErrorHandler(
  transport: ErrorSink,
): (
  error: unknown,
  request: NextRequestInfo,
  context: NextRequestErrorContext,
) => void {
  void transport
  return () => undefined
}

export function requestErrorToInput(
  error: unknown,
  request: NextRequestInfo,
  context: NextRequestErrorContext,
): StackNextErrorInput {
  void error
  void request
  void context
  throw new Error('StackNext request errors are only captured on the Node.js runtime')
}
