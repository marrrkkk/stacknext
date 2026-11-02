import { redactText, stripUrlQuery } from './redact.js'

/**
 * Span types that Next.js emits without `NEXT_OTEL_VERBOSE=1`. The list mirrors
 * the documented vanilla allowlist in Next.js 15/16. New Next.js releases may
 * add entries; unknown values are treated as verbose/internal rather than
 * discarded so the explorer stays evidence-based.
 */
export const STANDARD_NEXT_SPAN_TYPES = new Set([
  'Middleware.execute',
  'Next.request',
  'BaseServer.handleRequest',
  'Render.getServerSideProps',
  'Render.getStaticProps',
  'AppRender.fetch',
  'AppRender.getBodyResult',
  'LoadComponents.loadRouteModule',
  'Render.renderDocument',
  'Node.runHandler',
  'AppRouteRouteHandlers.runHandler',
  'AppRouteRouteModule.loadUserland',
  'RouteModule.prepare',
  'Instrumentation.loadModule',
  'Instrumentation.register',
  'ResolveMetadata.generateMetadata',
  'ResolveMetadata.generateViewport',
  'NextNodeServer.createComponentTree',
  'NextNodeServer.findPageComponents',
  'NextNodeServer.getLayoutOrPageModule',
  'NextNodeServer.startResponse',
  'NextNodeServer.clientComponentLoading',
])

export const REQUEST_ROOT_SPAN_TYPES = new Set([
  'BaseServer.handleRequest',
  'Next.request',
])

export const RENDER_SPAN_TYPES = new Set([
  'AppRender.getBodyResult',
  'AppRender.renderToString',
  'AppRender.renderToReadableStream',
  'AppRender.renderToNodeFizzStream',
])

export const ROUTE_HANDLER_SPAN_TYPES = new Set([
  'AppRouteRouteHandlers.runHandler',
  'Node.runHandler',
])

export const FETCH_SPAN_TYPES = new Set(['AppRender.fetch'])

export type StackNextSpanCategory = 'framework' | 'app' | 'database' | 'fetch'

export const SPAN_CATEGORY_LABELS: Record<StackNextSpanCategory, string> = {
  framework: 'framework',
  app: 'app/custom',
  database: 'database',
  fetch: 'fetch',
}

export interface FrameworkSpanFields {
  nextSpanName?: string
  nextRoute?: string
  nextPage?: string
  nextSegment?: string
  nextRsc?: boolean
}

export function safeFrameworkText(
  value: string | undefined,
  maxLength = 2_000,
): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  return redactText(stripUrlQuery(trimmed), maxLength)
}

function readString(
  attributes: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = attributes[key]
  return typeof value === 'string' ? value : undefined
}

function readBoolean(
  attributes: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = attributes[key]
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true
    if (value.toLowerCase() === 'false') return false
  }
  return undefined
}

/** Extracts the documented Next.js framework attributes without query strings. */
export function frameworkSpanFields(
  attributes: Record<string, unknown>,
): FrameworkSpanFields {
  const nextSpanName = safeFrameworkText(
    readString(attributes, 'next.span_name'),
    512,
  )
  const nextRoute = safeFrameworkText(readString(attributes, 'next.route'))
  const nextPage = safeFrameworkText(readString(attributes, 'next.page'))
  const nextSegment = safeFrameworkText(readString(attributes, 'next.segment'))
  const nextRsc = readBoolean(attributes, 'next.rsc')
  return {
    ...(nextSpanName ? { nextSpanName } : {}),
    ...(nextRoute ? { nextRoute } : {}),
    ...(nextPage ? { nextPage } : {}),
    ...(nextSegment ? { nextSegment } : {}),
    ...(nextRsc !== undefined ? { nextRsc } : {}),
  }
}

export function isStandardNextSpanType(value: string | undefined): boolean {
  return value !== undefined && STANDARD_NEXT_SPAN_TYPES.has(value)
}

export function isDatabaseSpan(attributes: Record<string, unknown>): boolean {
  return (
    typeof attributes['db.system'] === 'string' ||
    typeof attributes['db.system.name'] === 'string' ||
    typeof attributes['db.statement'] === 'string' ||
    typeof attributes['db.operation'] === 'string'
  )
}

export function isFetchSpan(
  nextSpanType: string | undefined,
  kind: string,
  attributes: Record<string, unknown>,
): boolean {
  if (nextSpanType !== undefined && FETCH_SPAN_TYPES.has(nextSpanType)) {
    return true
  }
  if (kind !== 'client') return false
  return (
    typeof attributes['http.url'] === 'string' ||
    typeof attributes['url.full'] === 'string' ||
    (typeof attributes['http.request.method'] === 'string' &&
      typeof attributes['http.response.status_code'] !== 'undefined')
  )
}

export interface ClassifiableSpan {
  kind: string
  nextSpanType?: string
  parentSpanId?: string
  attributes: Record<string, unknown>
}

/**
 * Classifies a span for the trace explorer. Framework spans come from Next.js'
 * documented telemetry; app spans are custom/manual; fetch and database spans
 * are called out so overlapping work is not mistaken for request time.
 */
export function classifySpanCategory(span: ClassifiableSpan): StackNextSpanCategory {
  const manualKind = span.attributes['stacknext.span.kind']
  if (manualKind === 'custom' || manualKind === 'action') return 'app'
  if (span.attributes['stacknext.manual'] === true) return 'app'
  if (isFetchSpan(span.nextSpanType, span.kind, span.attributes)) return 'fetch'
  if (isDatabaseSpan(span.attributes)) return 'database'
  if (span.nextSpanType !== undefined) return 'framework'
  if (span.kind === 'server' && !span.parentSpanId) return 'framework'
  return 'app'
}
