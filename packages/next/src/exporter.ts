import {
  SpanKind,
  SpanStatusCode,
  type Attributes,
  type HrTime,
  type Span,
} from '@opentelemetry/api'
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import {
  frameworkSpanFields,
  redactText,
  sanitizeAttributes,
  sanitizeResource,
  stripUrlQueryInText,
  type StackNextSpanInput,
  type StackNextSpanKind,
  type StackNextSpanStatus,
} from '@stacknext/core'
import type { StackNextTransport } from '@stacknext/core/transport'

const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/i
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/i

function hrTimeToMilliseconds(time: HrTime): number {
  const [seconds, nanoseconds] = time
  return seconds * 1_000 + nanoseconds / 1_000_000
}

function kindFromOtel(kind: SpanKind): StackNextSpanKind {
  switch (kind) {
    case SpanKind.SERVER:
      return 'server'
    case SpanKind.CLIENT:
      return 'client'
    case SpanKind.PRODUCER:
      return 'producer'
    case SpanKind.CONSUMER:
      return 'consumer'
    case SpanKind.INTERNAL:
      return 'internal'
  }
}

function statusFromOtel(status: ReadableSpan['status']): StackNextSpanStatus {
  if (status.code === SpanStatusCode.OK) return 'ok'
  if (status.code === SpanStatusCode.ERROR) return 'error'
  return 'unset'
}

function attributeString(
  attributes: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = attributes[key]
  return typeof value === 'string' ? value : undefined
}

function isInternalUrl(
  attributes: Record<string, unknown>,
  collectorUrl: string,
): boolean {
  const candidates = [
    attributeString(attributes, 'http.url'),
    attributeString(attributes, 'url.full'),
    attributeString(attributes, 'http.target'),
    attributeString(attributes, 'next.original_url'),
  ].filter((value): value is string => Boolean(value))
  for (const candidate of candidates) {
    if (candidate.includes('/__stacknext/')) return true
    try {
      if (collectorUrl && candidate.startsWith(new URL(collectorUrl).origin)) {
        return true
      }
    } catch {
      // Ignore malformed URLs in attributes.
    }
  }
  return false
}

/**
 * Converts an OTel ReadableSpan into the StackNext wire format. Redaction happens
 * here as well as in the collector: sensitive data never leaves the app process.
 */
export function readableSpanToInput(
  span: ReadableSpan,
  options: {
    collectorUrl: string
    fallbackServiceName: string
  },
): StackNextSpanInput | null {
  const context = span.spanContext()
  if (
    !TRACE_ID_PATTERN.test(context.traceId) ||
    !SPAN_ID_PATTERN.test(context.spanId)
  ) {
    return null
  }
  const attributes = sanitizeAttributes(span.attributes)
  const nextSpanType = attributeString(attributes, 'next.span_type')
  if (nextSpanType?.startsWith('Instrumentation.')) return null
  if (isInternalUrl(attributes, options.collectorUrl)) return null
  const framework = frameworkSpanFields(attributes)

  const resource = sanitizeResource(span.resource.attributes)
  const serviceName =
    typeof resource['service.name'] === 'string'
      ? resource['service.name']
      : options.fallbackServiceName
  const startTime = hrTimeToMilliseconds(span.startTime)
  const endTime = Math.max(startTime, hrTimeToMilliseconds(span.endTime))
  const status = statusFromOtel(span.status)
  const parentSpanId = span.parentSpanContext?.spanId
  const safeName = stripUrlQueryInText(redactText(span.name, 512))
  return {
    traceId: context.traceId.toLowerCase(),
    spanId: context.spanId.toLowerCase(),
    ...(parentSpanId && SPAN_ID_PATTERN.test(parentSpanId)
      ? { parentSpanId: parentSpanId.toLowerCase() }
      : {}),
    name: safeName,
    kind: kindFromOtel(span.kind),
    startTime,
    endTime,
    durationMs: endTime - startTime,
    status,
    ...(span.status.message
      ? {
          statusMessage: stripUrlQueryInText(
            redactText(span.status.message, 8_000),
          ),
        }
      : {}),
    serviceName: redactText(serviceName, 200),
    ...(nextSpanType ? { nextSpanType: redactText(nextSpanType, 200) } : {}),
    ...framework,
    attributes,
    events: span.events.slice(0, 100).map((event) => ({
      name: stripUrlQueryInText(redactText(event.name, 512)),
      time: hrTimeToMilliseconds(event.time),
      attributes: sanitizeAttributes(event.attributes ?? {}),
    })),
    resource,
  }
}

export interface StackNextSpanExporterOptions {
  transport: Pick<StackNextTransport, 'enqueueSpan' | 'forceFlush'>
  collectorUrl: string
  fallbackServiceName?: string
  /** Set to false to drop Next.js fetch spans. */
  captureFetch?: boolean
}

/**
 * OpenTelemetry SpanExporter that hands normalized spans to the bounded local
 * transport. It never performs network I/O synchronously.
 */
export class StackNextSpanExporter implements SpanExporter {
  private readonly transport: Pick<StackNextTransport, 'enqueueSpan' | 'forceFlush'>
  private readonly collectorUrl: string
  private readonly fallbackServiceName: string
  private readonly captureFetch: boolean

  constructor(options: StackNextSpanExporterOptions) {
    this.transport = options.transport
    this.collectorUrl = options.collectorUrl
    this.fallbackServiceName = options.fallbackServiceName ?? 'next-app'
    this.captureFetch = options.captureFetch ?? true
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: { code: number; error?: Error }) => void,
  ): void {
    try {
      for (const span of spans) {
        const input = readableSpanToInput(span, {
          collectorUrl: this.collectorUrl,
          fallbackServiceName: this.fallbackServiceName,
        })
        if (!input) continue
        if (!this.captureFetch && input.nextSpanType === 'AppRender.fetch') continue
        this.transport.enqueueSpan(input)
      }
      resultCallback({ code: 0 })
    } catch (error) {
      resultCallback({
        code: 1,
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  }

  async shutdown(): Promise<void> {
    await this.transport.forceFlush()
  }

  async forceFlush(): Promise<void> {
    await this.transport.forceFlush()
  }
}

export function spanAttributes(
  attributes: Record<string, unknown> | undefined,
): Attributes {
  const sanitized = sanitizeAttributes(attributes)
  const output: Attributes = {}
  for (const [key, value] of Object.entries(sanitized)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      (Array.isArray(value) &&
        value.every(
          (item) =>
            typeof item === 'string' ||
            typeof item === 'number' ||
            typeof item === 'boolean',
        ))
    ) {
      output[key] = value as Attributes[string]
    }
  }
  return output
}

export type { Span }
