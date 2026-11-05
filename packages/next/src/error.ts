import { randomUUID } from 'crypto'
import { isSpanContextValid, trace } from '@opentelemetry/api'
import {
  redactErrorText,
  redactText,
  stripUrlQuery,
  type StackNextErrorInput,
} from '@stacknext/core'
import {
  getStackNextTransport,
  type StackNextTransport,
} from '@stacknext/core/transport'

/** Structural subset of Next.js `Instrumentation.RequestInfo`. */
export interface NextRequestInfo {
  path: string
  method: string
  headers?: Record<string, string | string[] | undefined>
}

/** Structural subset of Next.js `Instrumentation.RequestErrorContext`. */
export interface NextRequestErrorContext {
  routerKind?: string
  routePath?: string
  routeType?: string
  renderSource?: string
  revalidateReason?: string
  renderType?: string
  [key: string]: unknown
}

interface ErrorDetails {
  message: string
  name: string
  stack?: string
  digest?: string
}

function readErrorDetails(error: unknown): ErrorDetails {
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest
    return {
      message: error.message || 'Unknown error',
      name: error.name || 'Error',
      ...(error.stack ? { stack: error.stack } : {}),
      ...(typeof digest === 'string' && digest.length > 0
        ? { digest: redactText(digest, 1_000) }
        : {}),
    }
  }
  if (typeof error === 'string' && error.trim() !== '') {
    return { message: error, name: 'Error' }
  }
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>
    const message =
      typeof record.message === 'string' && record.message.trim() !== ''
        ? record.message
        : 'Unknown error'
    const name = typeof record.name === 'string' && record.name.trim() !== ''
      ? record.name
      : 'Error'
    return {
      message,
      name,
      ...(typeof record.stack === 'string' ? { stack: record.stack } : {}),
      ...(typeof record.digest === 'string' && record.digest.length > 0
        ? { digest: redactText(record.digest, 1_000) }
        : {}),
    }
  }
  return {
    message: error === undefined || error === null ? 'Unknown error' : String(error),
    name: 'Error',
  }
}

function safeText(value: string | undefined, maxLength = 2_000): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  return redactText(trimmed, maxLength)
}

function safePath(value: string | undefined): string | undefined {
  const text = safeText(value)
  return text ? stripUrlQuery(text) : undefined
}

function buildAttributes(
  context: NextRequestErrorContext,
): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  if (typeof context.routerKind === 'string') {
    attributes['next.router_kind'] = context.routerKind
  }
  if (typeof context.routeType === 'string') {
    attributes['next.route_type'] = context.routeType
  }
  if (typeof context.renderSource === 'string') {
    attributes['next.render_source'] = context.renderSource
  }
  if (typeof context.revalidateReason === 'string') {
    attributes['next.revalidate_reason'] = context.revalidateReason
  }
  if (typeof context.renderType === 'string') {
    attributes['next.render_type'] = context.renderType
  }
  return attributes
}

/**
 * Converts a Next.js request error into the StackNext wire format.
 * Header values are never read or stored.
 */
export function requestErrorToInput(
  error: unknown,
  request: NextRequestInfo,
  context: NextRequestErrorContext,
): StackNextErrorInput {
  const details = readErrorDetails(error)
  const route = safePath(context.routePath)
  const requestPath = safePath(request.path)
  const method = safeText(request.method, 32)?.toUpperCase()
  const activeSpan = trace.getActiveSpan()
  const spanContext = activeSpan?.spanContext()
  const validContext = spanContext && isSpanContextValid(spanContext)

  return {
    id: randomUUID(),
    message: redactErrorText(details.message),
    name: redactText(details.name, 200),
    ...(details.stack ? { stack: redactErrorText(details.stack) } : {}),
    ...(details.digest ? { digest: details.digest } : {}),
    timestamp: Date.now(),
    ...(route ? { route } : {}),
    ...(method ? { method } : {}),
    ...(requestPath ? { requestPath } : {}),
    ...(context.routerKind
      ? { routerKind: redactText(context.routerKind, 100) }
      : {}),
    ...(context.routeType ? { routeType: redactText(context.routeType, 100) } : {}),
    ...(context.renderSource
      ? { renderSource: redactText(context.renderSource, 100) }
      : {}),
    ...(context.renderType ? { renderType: redactText(context.renderType, 100) } : {}),
    ...(validContext
      ? {
          traceId: spanContext.traceId.toLowerCase(),
          spanId: spanContext.spanId.toLowerCase(),
        }
      : {}),
    attributes: buildAttributes(context),
  }
}

type ErrorSink = Pick<StackNextTransport, 'enqueueError'>

/**
 * Creates a Next.js `onRequestError` handler bound to a transport. Exposed for
 * tests and for applications that want to supply their own transport.
 */
export function createRequestErrorHandler(
  transport: ErrorSink,
): (
  error: unknown,
  request: NextRequestInfo,
  context: NextRequestErrorContext,
) => void {
  return (error, request, context) => {
    try {
      transport.enqueueError(requestErrorToInput(error, request, context))
    } catch {
      // Instrumentation must never throw into Next.js error handling.
    }
  }
}

/**
 * Next.js `onRequestError` entry point. Re-export from `instrumentation.ts`.
 * When the active OTel span is available the error is linked to its trace;
 * otherwise the collector correlates by route and timestamp.
 */
export function onRequestError(
  error: unknown,
  request: NextRequestInfo,
  context: NextRequestErrorContext,
): void {
  const runtime = process.env.NEXT_RUNTIME
  if (runtime !== undefined && runtime !== 'nodejs') return
  if (process.env.STACKNEXT_CAPTURE_ERRORS === '0') return
  try {
    const transport = getStackNextTransport()
    if (!transport) return
    createRequestErrorHandler(transport)(error, request, context)
  } catch {
    // Never break the host application because telemetry failed.
  }
}
