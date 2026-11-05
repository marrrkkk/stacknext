import {
  fingerprint,
  stripUrlQuery,
  type StackNextError,
} from '@stacknext/core'

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const LONG_HEX_PATTERN = /\b[0-9a-f]{16,}\b/gi

/**
 * Produces a stable SQL shape without literals or bind parameters. The shape is
 * used for grouping only; it is never treated as proof of an N+1 pattern.
 */
export function sqlFingerprint(sql: string): string {
  const parts: string[] = []
  let plain = ''
  const flush = (): void => {
    let value = plain.replace(UUID_PATTERN, '?')
    value = value.replace(/\$\d+/g, '?')
    value = value.replace(/(?<!:):[a-zA-Z_][a-zA-Z0-9_]*/g, '?')
    value = value.replace(/@[a-zA-Z_][a-zA-Z0-9_]*/g, '?')
    value = value.replace(LONG_HEX_PATTERN, '?')
    value = value.replace(/\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi, '?')
    value = value.replace(/\(\s*\?(?:\s*,\s*\?)+\s*\)/g, '(?)')
    parts.push(value.replace(/\s+/g, ' ').toLowerCase())
    plain = ''
  }
  let index = 0
  while (index < sql.length) {
    const char = sql[index]!
    if (sql.startsWith('--', index)) {
      const end = sql.indexOf('\n', index + 2)
      index = end < 0 ? sql.length : end + 1
      plain += ' '
    } else if (sql.startsWith('/*', index)) {
      let depth = 1
      index += 2
      while (index < sql.length && depth > 0) {
        if (sql.startsWith('/*', index)) { depth += 1; index += 2 }
        else if (sql.startsWith('*/', index)) { depth -= 1; index += 2 }
        else index += 1
      }
      plain += ' '
    } else if (char === '"' || char === '`' || char === '[' || char === "'") {
      const start = index++
      const closing = char === '[' ? ']' : char
      // PostgreSQL E strings and MySQL strings support backslash escapes.
      const backslashEscapes = char === "'" && /(?:^|\W)e$/i.test(sql.slice(0, start))
      while (index < sql.length) {
        if (backslashEscapes && sql[index] === '\\') { index += 2; continue }
        if (sql[index++] !== closing) continue
        if (sql[index] === closing) { index += 1; continue }
        break
      }
      if (char === "'") {
        if (backslashEscapes) plain = plain.slice(0, -1)
        plain += '?'
      } else {
        flush()
        parts.push(sql.slice(start, index))
      }
    } else if (char === '$' && /^\$(?:[a-z_][\w]*)?\$/i.test(sql.slice(index))) {
      const delimiter = /^\$(?:[a-z_][\w]*)?\$/i.exec(sql.slice(index))![0]
      const end = sql.indexOf(delimiter, index + delimiter.length)
      index = end < 0 ? sql.length : end + delimiter.length
      plain += '?'
    } else {
      plain += char
      index += 1
    }
  }
  flush()
  return parts.join('').trim()
}

/** Safe, bounded SQL shape used in finding evidence instead of raw SQL. */
export function sqlPreview(sql: string, maxLength = 500): string {
  const shape = sqlFingerprint(sql)
  if (shape.length <= maxLength) return shape
  const suffix = '… [truncated]'
  if (maxLength <= suffix.length) return shape.slice(0, maxLength)
  return `${shape.slice(0, maxLength - suffix.length)}${suffix}`
}

export function normalizePath(pathname: string): string {
  const segments = pathname.split('/').filter((segment) => segment.length > 0)
  const normalized = segments.map((segment) => {
    if (/^\d+$/.test(segment)) return ':id'
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
      return ':id'
    }
    if (/^[0-9a-f]{16,}$/i.test(segment)) return ':id'
    if (/^[a-zA-Z0-9_-]{32,}$/.test(segment)) return ':id'
    return segment
  })
  return normalized.length === 0 ? '/' : `/${normalized.join('/')}`
}

/**
 * Reduces a URL or path to an endpoint shape: credentials, query values,
 * fragments and ID-like path segments are removed.
 */
export function httpEndpoint(value: string | undefined): string | null {
  if (!value) return null
  const stripped = stripUrlQuery(value.trim())
  if (stripped === '') return null
  try {
    const url = new URL(stripped)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return `${url.host.toLowerCase()}${normalizePath(url.pathname)}`
  } catch {
    if (!stripped.startsWith('/')) return null
    return normalizePath(stripped)
  }
}

/** Best-effort table hint from a normalized SQL shape. Never used as proof. */
export function sqlTableHint(sql: string): string | null {
  const match =
    /\b(?:from|join|into|update|delete\s+from)\s+"?([a-z_][a-z0-9_.]*)"?/i.exec(sql)
  const table = match?.[1]?.trim()
  return table ? table.slice(0, 120) : null
}

/** Next.js control-flow errors are not request failures for diagnostics. */
export function isControlFlowError(error: StackNextError): boolean {
  const digest = error.digest?.trim()
  if (
    digest &&
    /^(?:NEXT_NOT_FOUND|NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK)(?:;|$)/i.test(digest)
  ) {
    return true
  }
  return /^(?:NEXT_NOT_FOUND|NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK)(?:;|$)/i.test(error.message.trim())
}

export function normalizeErrorMessage(message: string): string {
  let value = message.toLowerCase()
  value = value.replace(/https?:\/\/[^\s]+/g, '<url>')
  value = value.replace(UUID_PATTERN, '<id>')
  value = value.replace(LONG_HEX_PATTERN, '<hex>')
  value = value.replace(/\b\d+(?:\.\d+)?\b/g, '<n>')
  value = value.replace(/'(?:''|[^'])*'/g, '<str>')
  value = value.replace(/"[^"]*"/g, '<str>')
  value = value.replace(/\s+/g, ' ').trim()
  return value.slice(0, 600)
}

function stackSignature(stack: string | undefined): string {
  if (!stack) return ''
  const frames = stack
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '))
    .slice(0, 4)
    .map((line) =>
      line
        .replace(/(?:[A-Za-z]:)?[\\/][^\s()]+[\\/]([^\\/()]+)/g, '$1')
        .replace(/:\d+:\d+/g, ':?:?')
        .replace(/\b\d+\b/g, '?')
        .replace(/\s+/g, ' '),
    )
  return frames.join('|').slice(0, 600)
}

export function errorOperationCategory(error: StackNextError): string {
  if (error.routeType) return error.routeType.toLowerCase().slice(0, 80)
  const text = `${error.name} ${error.message}`.toLowerCase()
  if (/(sql|database|drizzle|prisma|sqlite|postgres|mysql)/.test(text)) return 'database'
  if (/(fetch|network|http|socket|econn)/.test(text)) return 'http'
  if (/(render|component|jsx|hydration)/.test(text)) return 'render'
  return 'runtime'
}

/**
 * Route-independent error signature. Routes and methods are deliberately
 * excluded so the same failure can be grouped across entry points.
 */
export function diagnosticErrorFingerprint(error: StackNextError): string {
  return fingerprint([
    'error-fingerprint',
    error.name.toLowerCase().slice(0, 200),
    normalizeErrorMessage(error.message),
    stackSignature(error.stack),
    errorOperationCategory(error),
  ])
}

export function diagnosticFindingId(
  ruleId: string,
  findingFingerprint: string,
  scope = '',
): string {
  const first = fingerprint([ruleId, findingFingerprint])
  const second = fingerprint([ruleId, findingFingerprint, scope])
  return `diag-${first}-${second}`
}
