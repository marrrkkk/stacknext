import {
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
} from '@opentelemetry/api'
import { NEXTSCOPE_SDK_VERSION } from '@nextscope/core'
import { spanAttributes } from './exporter.js'

export interface NextScopeManualSpanOptions {
  attributes?: Record<string, unknown>
  kind?: SpanKind
  /** Record thrown exceptions on the span. Defaults to true. */
  recordException?: boolean
}

function tracer() {
  return trace.getTracer('nextscope', NEXTSCOPE_SDK_VERSION)
}

function startOptions(
  options: NextScopeManualSpanOptions,
): { kind: SpanKind; attributes: Attributes } {
  return {
    kind: options.kind ?? SpanKind.INTERNAL,
    attributes: spanAttributes(options.attributes),
  }
}

function recordFailure(span: Span, error: unknown): void {
  span.recordException(
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { name: 'Error', message: String(error) },
  )
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message.slice(0, 512) : String(error).slice(0, 512),
  })
}

/**
 * Runs an async operation inside a NextScope span. The span is exported along
 * with Next.js request spans, so manual work appears in the same timeline.
 */
export function withNextScopeSpan<T>(
  name: string,
  fn: (span: Span) => T | Promise<T>,
  options: NextScopeManualSpanOptions = {},
): Promise<T> {
  return tracer().startActiveSpan(name, startOptions(options), async (span) => {
    try {
      return await fn(span)
    } catch (error) {
      if (options.recordException !== false) recordFailure(span, error)
      throw error
    } finally {
      span.end()
    }
  })
}

/** Synchronous variant for database drivers and other blocking work. */
export function withNextScopeSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  options: NextScopeManualSpanOptions = {},
): T {
  return tracer().startActiveSpan(name, startOptions(options), (span) => {
    try {
      return fn(span)
    } catch (error) {
      if (options.recordException !== false) recordFailure(span, error)
      throw error
    } finally {
      span.end()
    }
  })
}
