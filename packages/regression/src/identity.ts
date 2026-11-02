import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  redactText,
  stripUrlQueryInText,
  type StackNextSpan,
  type RequestSummary,
  type TraceDetail,
} from '@stacknext/core'
import {
  diagnosticSpanCategory,
  safeRoute,
  safeSpanName,
  spanHttpEndpoint,
  spanHttpMethod,
} from '@stacknext/diagnostics'
import type { ScenarioIdentity } from './schema.js'

const ID_SEGMENT_PATTERNS = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^[0-9a-f]{16,}$/i,
  /^[a-zA-Z0-9_-]{32,}$/,
  /^\d+$/,
]

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function safeText(value: string, maxLength: number): string {
  return stripUrlQueryInText(redactText(value, maxLength))
}

/** Removes dynamic path segments so trace and span identities survive test data changes. */
export function normalizePathLike(value: string): string {
  const withoutQuery = safeText(value, 1_000)
  const segments = withoutQuery.split('/')
  return segments
    .map((segment, index) => {
      if (index === 0) return segment
      return ID_SEGMENT_PATTERNS.some((pattern) => pattern.test(segment)) ? ':id' : segment
    })
    .join('/')
}

export function normalizeSpanName(value: string): string {
  return normalizePathLike(value).replace(/\s+/g, ' ').trim().slice(0, 300)
}

/**
 * Scenario ids are stable hashes. An explicit `stacknext` Playwright annotation
 * wins; Playwright's stable test id is the next choice; file/title/project is
 * the final fallback. The raw annotation value is never used as a path or id.
 */
export function scenarioIdentity(input: {
  title: string
  file: string
  project: string
  tags?: string[]
  testId?: string
  annotation?: string
  rootDir?: string
}): ScenarioIdentity {
  const file = normalizeScenarioFile(input.file, input.rootDir)
  const title = safeText(input.title, 500)
  const project = safeText(input.project || 'default', 200)
  const annotation = input.annotation?.trim()
  const testId = input.testId?.trim()
  const source: ScenarioIdentity['source'] = annotation
    ? 'annotation'
    : testId
      ? 'test-id'
      : 'title'
  const basis = annotation
    ? `annotation\u0000${annotation}`
    : testId
      ? `test-id\u0000${testId}`
      : `title\u0000${file}\u0000${title}\u0000${project}`
  return {
    id: `scn-${shortHash(basis)}`,
    source,
    title,
    file,
    project,
    tags: [...new Set((input.tags ?? []).map((tag) => safeText(tag, 100)))].slice(0, 20),
  }
}

export function normalizeScenarioFile(file: string, rootDir?: string): string {
  let value = file.replace(/\\/g, '/')
  if (path.isAbsolute(value)) {
    if (rootDir) {
      const relative = path.relative(rootDir, value).replace(/\\/g, '/')
      value = relative.startsWith('..') ? path.basename(value) : relative
    } else {
      value = path.basename(value)
    }
  }
  value = value.replace(/^\.\//, '')
  return value === '' ? 'unknown.spec.ts' : value.slice(0, 1_000)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function traceRoot(
  detail: Pick<TraceDetail, 'spans'>,
): TraceDetail['spans'][number] | undefined {
  const spanIds = new Set(detail.spans.map((span) => span.spanId))
  const roots = detail.spans.filter(
    (span) => !span.parentSpanId || !spanIds.has(span.parentSpanId),
  )
  const candidates = roots.length > 0 ? roots : detail.spans
  return [...candidates].sort(
    (left, right) =>
      left.startTime - right.startTime || compareText(left.spanId, right.spanId),
  )[0]
}

export function traceIdentity(
  detail: Pick<TraceDetail, 'request' | 'spans'>,
): {
  key: string
  method: string | null
  route: string | null
  rootName: string
} {
  const root = traceRoot(detail)
  const request: RequestSummary | null = detail.request
  const optionRoute = safeRoute(request?.route ?? root?.route)
  const rootName = safeSpanName(root?.name ?? request?.name ?? 'trace')
  const route = optionRoute ?? (rootName ? safeRoute(rootName) : null)
  const method = request?.method ?? root?.method ?? null
  return {
    key: [method ?? '', route ?? '', normalizeSpanName(rootName)].join('|').slice(0, 2_000),
    method,
    route,
    rootName,
  }
}

export function spanIdentity(span: StackNextSpan): {
  key: string
  name: string
  category: ReturnType<typeof diagnosticSpanCategory>
} {
  const category = diagnosticSpanCategory(span)
  const name = safeSpanName(span.name)
  const method = category === 'http' ? spanHttpMethod(span) ?? '' : ''
  const endpoint =
    category === 'http' ? spanHttpEndpoint(span) ?? normalizeSpanName(name) : normalizeSpanName(name)
  const key = [
    category,
    span.kind,
    span.nextSpanType ?? '',
    method,
    endpoint,
  ]
    .join('|')
    .slice(0, 2_000)
  return { key, name, category }
}

/** Redacts local account paths and URL query values from stored command arguments. */
export function sanitizeCommandArg(value: string): string {
  let output = stripUrlQueryInText(redactText(value, 500))
  output = output.replace(
    /^(?:[A-Za-z]:\\Users\\[^\\]+|\/home\/[^/]+|\/Users\/[^/]+)/,
    '~',
  )
  return output
}
