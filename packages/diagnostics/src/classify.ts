import {
  isDatabaseSpan,
  isFetchSpan,
  redactText,
  stripUrlQueryInText,
  type DiagnosticSpanCategory,
  type DiagnosticSpanEvidence,
  type StackNextConfig,
  type StackNextSpan,
} from '@stacknext/core'
import { httpEndpoint } from './fingerprints.js'

function stringAttribute(
  attributes: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = attributes[key]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return undefined
}

/**
 * Classifies a span for threshold selection. Manual spans carrying documented
 * database attributes are treated as database work, even though the explorer
 * labels them app/custom.
 */
export function diagnosticSpanCategory(span: StackNextSpan): DiagnosticSpanCategory {
  if (isDatabaseSpan(span.attributes)) return 'database'
  if (isFetchSpan(span.nextSpanType, span.kind, span.attributes)) return 'http'
  const manualKind = span.attributes['stacknext.span.kind']
  if (
    manualKind === 'custom' ||
    manualKind === 'action' ||
    span.attributes['stacknext.manual'] === true
  ) {
    return 'custom'
  }
  if (span.nextSpanType !== undefined) return 'framework'
  if (span.kind === 'server' && !span.parentSpanId) return 'framework'
  return 'other'
}

export function spanThresholdMs(
  category: DiagnosticSpanCategory,
  config: StackNextConfig['diagnostics'],
): number {
  if (category === 'database') return config.slowSpans.databaseMs
  if (category === 'http') return config.slowSpans.httpMs
  if (category === 'custom') return config.slowSpans.customMs
  if (category === 'framework') return config.slowSpans.frameworkMs
  return config.slowSpans.otherMs
}

function methodFromName(name: string): string | undefined {
  const match = /^(?:fetch\s+)?(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\s+/i.exec(
    name,
  )
  return match?.[1]?.toUpperCase()
}

export function spanHttpMethod(span: StackNextSpan): string | null {
  return (
    span.method ??
    stringAttribute(span.attributes, 'http.method', 'http.request.method')?.toUpperCase() ??
    methodFromName(span.name) ??
    null
  )
}

/**
 * Extracts a bounded, credential-free endpoint from a fetch span. Returns null
 * when no URL-like attribute or path can be identified.
 */
export function spanHttpEndpoint(span: StackNextSpan): string | null {
  const direct = stringAttribute(
    span.attributes,
    'http.url',
    'url.full',
    'http.target',
    'url.path',
    'http.route',
  )
  if (direct) {
    const endpoint = httpEndpoint(direct)
    if (endpoint) return endpoint
  }
  const match = /^(?:fetch\s+)?(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\s+(\S+)/i.exec(
    span.name,
  )
  return match?.[1] ? httpEndpoint(match[1]) : null
}

/**
 * Defense-in-depth for evidence output. Stored telemetry is already redacted,
 * but diagnostics must never reintroduce URL query values or credentials when
 * it copies a span name into a finding.
 */
export function safeSpanName(name: string): string {
  return stripUrlQueryInText(redactText(name, 300))
}

/** Bounded route evidence with URL query values and credentials removed. */
export function safeRoute(value: string | null | undefined): string | null {
  if (!value) return null
  const sanitized = stripUrlQueryInText(redactText(value, 500))
  return sanitized.length <= 500 ? sanitized : `${sanitized.slice(0, 500)}…`
}

export function spanEvidence(
  span: StackNextSpan,
  category = diagnosticSpanCategory(span),
): DiagnosticSpanEvidence {
  const route = safeRoute(span.route)
  return {
    spanId: span.spanId,
    traceId: span.traceId,
    name: safeSpanName(span.name),
    durationMs: Math.round(span.durationMs * 10) / 10,
    category,
    status: span.status,
    ...(route ? { route } : {}),
    ...(span.nextSpanType ? { nextSpanType: span.nextSpanType } : {}),
  }
}
