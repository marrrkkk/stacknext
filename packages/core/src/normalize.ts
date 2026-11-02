import {
  fingerprint,
  redactErrorText,
  redactSql,
  redactText,
  sanitizeAttributes,
  sanitizeResource,
  stripUrlQuery,
} from './redact.js'
import {
  frameworkSpanFields,
  safeFrameworkText,
} from './framework.js'
import type {
  StackNextDatabaseQuery,
  StackNextError,
  StackNextSpan,
  StackNextSpanInput,
  StackNextDatabaseQueryInput,
  StackNextErrorInput,
} from './types.js'

const ABSOLUTE_URL_IN_TEXT =
  /\b([a-z][a-z0-9+.-]*:\/\/[^\s?#"'`<>)}]*)(?:[?#][^\s"'`<>)}]*)?/gi
const PATH_IN_TEXT =
  /(^|[\s"'`(=:,\[])(\/[^\s?#"'`<>)}]*)(?:[?#][^\s"'`<>)}]*)?/g

/**
 * Removes query strings and fragments from URLs embedded in free text,
 * including quoted relative paths, non-HTTP schemes and HTTP basic-auth
 * userinfo. Credentials are handled first by redactText.
 */
export function stripUrlQueryInText(value: string): string {
  return value
    .replace(ABSOLUTE_URL_IN_TEXT, '$1')
    .replace(PATH_IN_TEXT, '$1$2')
}

function readStringAttribute(
  attributes: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = attributes[key]
    if (typeof value === 'string' && value.length > 0) return value
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

function readNumberAttribute(
  attributes: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = attributes[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

function routeFromName(name: string): string | undefined {
  const match = /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\s+(\S+)/.exec(name)
  return match?.[1] ? stripUrlQuery(match[1]) : undefined
}

/** Sanitizes and normalizes a span received from an application process. */
export function normalizeSpan(input: StackNextSpanInput, receivedAt: number): StackNextSpan {
  const attributes = sanitizeAttributes(input.attributes)
  const framework = frameworkSpanFields(attributes)
  const nextSpanType =
    input.nextSpanType ??
    readStringAttribute(attributes, 'next.span_type')
  const method = input.method ?? readStringAttribute(attributes, 'http.method', 'http.request.method')
  const nextSpanName =
    safeFrameworkText(input.nextSpanName, 512) ?? framework.nextSpanName
  const nextRoute =
    safeFrameworkText(input.nextRoute) ?? framework.nextRoute
  const nextPage =
    safeFrameworkText(input.nextPage) ?? framework.nextPage
  const nextSegment =
    safeFrameworkText(input.nextSegment) ?? framework.nextSegment
  const nextRsc = input.nextRsc ?? framework.nextRsc
  const routeValue =
    input.route ??
    nextRoute ??
    readStringAttribute(
      attributes,
      'next.route',
      'http.route',
      'http.target',
      'url.path',
    ) ??
    routeFromName(input.name)
  const statusCode =
    input.statusCode ??
    readNumberAttribute(
      attributes,
      'http.status_code',
      'http.response.status_code',
      'http.status',
    )
  const safeName = stripUrlQueryInText(redactText(input.name, 512))
  const computedDuration = Math.max(0, input.endTime - input.startTime)
  return {
    traceId: input.traceId,
    spanId: input.spanId,
    ...(input.parentSpanId ? { parentSpanId: input.parentSpanId } : {}),
    name: safeName,
    kind: input.kind,
    startTime: input.startTime,
    endTime: Math.max(input.startTime, input.endTime),
    durationMs: Number.isFinite(input.durationMs) ? Math.max(0, input.durationMs) : computedDuration,
    status: input.status,
    ...(input.statusMessage
      ? { statusMessage: stripUrlQueryInText(redactText(input.statusMessage, 8_000)) }
      : {}),
    serviceName: redactText(input.serviceName, 200),
    ...(routeValue ? { route: stripUrlQueryInText(redactText(stripUrlQuery(routeValue), 2_000)) } : {}),
    ...(method ? { method: method.toUpperCase().slice(0, 32) } : {}),
    ...(statusCode && Number.isFinite(statusCode)
      ? { statusCode: Math.trunc(statusCode) }
      : {}),
    ...(nextSpanType ? { nextSpanType: redactText(nextSpanType, 200) } : {}),
    ...(nextSpanName ? { nextSpanName } : {}),
    ...(nextRoute ? { nextRoute } : {}),
    ...(nextPage ? { nextPage } : {}),
    ...(nextSegment ? { nextSegment } : {}),
    ...(nextRsc !== undefined ? { nextRsc } : {}),
    attributes,
    events: input.events.slice(0, 100).map((event) => ({
      name: stripUrlQueryInText(redactText(event.name, 512)),
      time: event.time,
      attributes: sanitizeAttributes(event.attributes),
    })),
    resource: sanitizeResource(input.resource),
    receivedAt,
  }
}

export function normalizeError(input: StackNextErrorInput, receivedAt: number): StackNextError {
  const attributes = sanitizeAttributes(input.attributes)
  const routerKind = input.routerKind ?? readStringAttribute(attributes, 'routerKind')
  const routeType = input.routeType ?? readStringAttribute(attributes, 'routeType')
  const renderSource = input.renderSource ?? readStringAttribute(attributes, 'renderSource')
  const message = stripUrlQueryInText(redactErrorText(input.message))
  const name = redactText(input.name, 200)
  const route = input.route
    ? stripUrlQueryInText(redactText(stripUrlQuery(input.route), 2_000))
    : undefined
  return {
    id: input.id,
    fingerprint: fingerprint([name, message, route, input.method, routeType]),
    message,
    name,
    ...(input.stack
      ? { stack: stripUrlQueryInText(redactErrorText(input.stack)) }
      : {}),
    ...(input.digest ? { digest: redactText(input.digest, 1_000) } : {}),
    timestamp: input.timestamp,
    ...(route ? { route } : {}),
    ...(input.method ? { method: input.method.toUpperCase().slice(0, 32) } : {}),
    ...(input.requestPath
      ? {
          requestPath: stripUrlQueryInText(
            redactText(stripUrlQuery(input.requestPath), 2_000),
          ),
        }
      : {}),
    ...(routerKind ? { routerKind: redactText(routerKind, 100) } : {}),
    ...(routeType ? { routeType: redactText(routeType, 100) } : {}),
    ...(renderSource ? { renderSource: redactText(renderSource, 100) } : {}),
    ...(input.traceId ? { traceId: input.traceId } : {}),
    ...(input.spanId ? { spanId: input.spanId } : {}),
    attributes,
    receivedAt,
  }
}

export function normalizeDatabaseQuery(
  input: StackNextDatabaseQueryInput,
  receivedAt: number,
): StackNextDatabaseQuery {
  return {
    id: input.id,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    ...(input.spanId ? { spanId: input.spanId } : {}),
    timestamp: input.timestamp,
    durationMs:
      typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)
        ? Math.max(0, input.durationMs)
        : null,
    sql: redactSql(input.sql),
    databaseSystem: redactText(input.databaseSystem, 100),
    ...(input.operation ? { operation: redactText(input.operation, 200) } : {}),
    success: input.success,
    ...(input.errorMessage
      ? { errorMessage: redactErrorText(input.errorMessage) }
      : {}),
    source: input.source,
    attributes: sanitizeAttributes(input.attributes),
    receivedAt,
  }
}
