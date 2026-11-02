import {
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
} from '@opentelemetry/api'
import {
  STACKNEXT_SDK_VERSION,
  redactText,
  stripUrlQueryInText,
} from '@stacknext/core'
import { spanAttributes } from './exporter.js'

export interface StackNextManualSpanOptions {
  attributes?: Record<string, unknown>
  kind?: SpanKind
  /** Record thrown exceptions on the span. Defaults to true. */
  recordException?: boolean
}

type ManualSpanFunction<T> = (span: Span) => T | Promise<T>

type ManualMarker = 'custom' | 'action'

function tracer() {
  return trace.getTracer('stacknext', STACKNEXT_SDK_VERSION)
}

function startOptions(
  options: StackNextManualSpanOptions,
  marker: ManualMarker,
): { kind: SpanKind; attributes: Attributes } {
  return {
    kind: options.kind ?? SpanKind.INTERNAL,
    attributes: {
      ...spanAttributes(options.attributes),
      // Set after user attributes so coverage and classification cannot be
      // spoofed or accidentally dropped by a caller-provided map.
      'stacknext.manual': true,
      'stacknext.span.kind': marker,
    },
  }
}

function safeErrorText(value: string, maxLength: number): string {
  return stripUrlQueryInText(redactText(value, maxLength))
}

function safeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: safeErrorText(error.name, 200),
      message: safeErrorText(error.message, 8_000),
      ...(error.stack ? { stack: safeErrorText(error.stack, 64_000) } : {}),
    }
  }
  return { name: 'Error', message: safeErrorText(String(error), 8_000) }
}

function recordFailure(span: Span, error: unknown): void {
  const safe = safeError(error)
  span.recordException(safe)
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: safe.message.slice(0, 512),
  })
}

/**
 * Redirects and not-found responses use thrown control-flow objects in the App
 * Router. They are normal outcomes, not failures, but must still propagate.
 */
function isControlFlowError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const digest = (error as { digest?: unknown }).digest
  return (
    typeof digest === 'string' &&
    (digest === 'NEXT_NOT_FOUND' ||
      digest.startsWith('NEXT_REDIRECT') ||
      digest.startsWith('NEXT_HTTP_ERROR_FALLBACK'))
  )
}

function resolveCall<T>(
  second: ManualSpanFunction<T> | StackNextManualSpanOptions,
  third: StackNextManualSpanOptions | ManualSpanFunction<T> | undefined,
): { fn: ManualSpanFunction<T>; options: StackNextManualSpanOptions } {
  if (typeof second === 'function') {
    return {
      fn: second,
      options: (third as StackNextManualSpanOptions | undefined) ?? {},
    }
  }
  if (typeof third !== 'function') {
    throw new TypeError('withStackNextSpan requires a callback function')
  }
  return { fn: third, options: second }
}

function finishFailure(span: Span, error: unknown, options: StackNextManualSpanOptions): void {
  if (options.recordException !== false && !isControlFlowError(error)) {
    recordFailure(span, error)
  }
}

/**
 * Runs an async operation inside a StackNext span. The span is exported along
 * with Next.js request spans, so manual work appears in the same timeline.
 *
 * Both `(name, fn, options?)` and `(name, options, fn)` are supported.
 */
export function withStackNextSpan<T>(
  name: string,
  fn: ManualSpanFunction<T>,
  options?: StackNextManualSpanOptions,
): Promise<T>
export function withStackNextSpan<T>(
  name: string,
  options: StackNextManualSpanOptions,
  fn: ManualSpanFunction<T>,
): Promise<T>
export function withStackNextSpan<T>(
  name: string,
  second: ManualSpanFunction<T> | StackNextManualSpanOptions,
  third?: StackNextManualSpanOptions | ManualSpanFunction<T>,
): Promise<T> {
  const { fn, options } = resolveCall(second, third)
  return tracer().startActiveSpan(name, startOptions(options, 'custom'), async (span) => {
    try {
      return await fn(span)
    } catch (error) {
      finishFailure(span, error, options)
      throw error
    } finally {
      span.end()
    }
  })
}

/**
 * Synchronous variant for database drivers and other blocking work. Supports
 * the same argument forms as {@link withStackNextSpan}.
 */
export function withStackNextSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  options?: StackNextManualSpanOptions,
): T
export function withStackNextSpanSync<T>(
  name: string,
  options: StackNextManualSpanOptions,
  fn: (span: Span) => T,
): T
export function withStackNextSpanSync<T>(
  name: string,
  second: ((span: Span) => T) | StackNextManualSpanOptions,
  third?: StackNextManualSpanOptions | ((span: Span) => T),
): T {
  const { fn, options } = resolveCall(second, third)
  return tracer().startActiveSpan(name, startOptions(options, 'custom'), (span) => {
    try {
      return fn(span) as T
    } catch (error) {
      finishFailure(span, error, options)
      throw error
    } finally {
      span.end()
    }
  })
}

/**
 * Wraps a Server Action in an explicit span. Successful Server Actions do not
 * reach `onRequestError`, so this helper is the supported way to make them
 * visible. Return values and thrown control flow are preserved.
 */
export function withStackNextAction<T>(
  name: string,
  fn: ManualSpanFunction<T>,
  options?: StackNextManualSpanOptions,
): Promise<T>
export function withStackNextAction<T>(
  name: string,
  options: StackNextManualSpanOptions,
  fn: ManualSpanFunction<T>,
): Promise<T>
export function withStackNextAction<T>(
  name: string,
  second: ManualSpanFunction<T> | StackNextManualSpanOptions,
  third?: StackNextManualSpanOptions | ManualSpanFunction<T>,
): Promise<T> {
  const { fn, options } = resolveCall(second, third)
  return tracer().startActiveSpan(name, startOptions(options, 'action'), async (span) => {
    try {
      return await fn(span)
    } catch (error) {
      finishFailure(span, error, options)
      throw error
    } finally {
      span.end()
    }
  })
}
