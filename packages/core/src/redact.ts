const SENSITIVE_KEY_PATTERN =
  /(authorization|proxy[-_]?authorization|cookie|set[-_]?cookie|password|passwd|pwd|secret|api[-_]?key|access[-_]?token|refresh[-_]?token|private[-_]?key|client[-_]?secret|credential|connection[-_]?string|database[-_]?url|dsn|session[-_]?token|(^|[._-])tokens?($|[._-])|auth[-_]?token|x[-_]?auth[-_]?token)/i

const URL_LIKE_KEY_PATTERN =
  /(^|\.)(url|uri|target|href|span_name|route|page|segment|original[-_]?url|request[-_]?url|url\.(?:full|path))$/i
const URL_QUERY_KEY_PATTERN =
  /(^|\.)(url\.(?:query|fragment|search)|http\.(?:query|fragment))$/i
const HEADER_KEY_PATTERN =
  /(^|\.)(headers?|request[-_.]headers?|response[-_.]headers?)(\.|$)/i
const REDACTED = '[redacted]'
const MAX_DEPTH = 8
const MAX_ARRAY_ITEMS = 50
const MAX_STRING_LENGTH = 4_000

const RESOURCE_ALLOWLIST = new Set([
  'service.name',
  'service.version',
  'service.namespace',
  'telemetry.sdk.name',
  'telemetry.sdk.language',
  'telemetry.sdk.version',
  'next.runtime',
  'next.version',
  'deployment.environment',
])

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(bearer\s+)[a-z0-9._~+/=-]+/gi, `$1${REDACTED}`],
  [/\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/gi, REDACTED],
  [/\b(gh[pousr]_[a-z0-9]{16,})\b/gi, REDACTED],
  [/\bgithub_pat_[a-z0-9_]{20,}\b/gi, REDACTED],
  [/\b(xox[baprs]-[a-z0-9-]{10,})\b/gi, REDACTED],
  [/\b(AKIA[0-9A-Z]{16})\b/g, REDACTED],
  [/\bsk-[a-z0-9_-]{16,}\b/gi, REDACTED],
  [/\b(pk|rk)_(live|test)_[a-z0-9]{10,}\b/gi, REDACTED],
  [
    /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@?#]+@/gi,
    `$1${REDACTED}@`,
  ],
  [
    /\b(password|passwd|pwd|secret|token|api[_-]?key)\s*[=:]\s*("[^"]*"|'[^']*'|[^\s,;&]+)/gi,
    `$1=${REDACTED}`,
  ],
]

export function redactText(value: string, maxLength = MAX_STRING_LENGTH): string {
  let result = value
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement)
  }
  if (result.length > maxLength) {
    return `${result.slice(0, maxLength)}… [truncated]`
  }
  return result
}

/**
 * Removes credentials, query strings and fragments from a URL while preserving
 * enough information to identify the resource. Works with absolute and relative URLs.
 */
export function stripUrlQuery(value: string): string {
  if (typeof value !== 'string') return value
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    const withoutFragment = value.split('#', 1)[0] ?? value
    return withoutFragment.split('?', 1)[0] ?? withoutFragment
  }
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key)
}

function sanitizeValue(key: string, value: unknown, depth: number): unknown {
  if (isSensitiveKey(key) || HEADER_KEY_PATTERN.test(key) || URL_QUERY_KEY_PATTERN.test(key)) {
    return REDACTED
  }
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    const withoutQuery = URL_LIKE_KEY_PATTERN.test(key) ? stripUrlQuery(value) : value
    return redactText(withoutQuery)
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'boolean' || typeof value === 'bigint') {
    return typeof value === 'bigint' ? value.toString() : value
  }
  if (depth >= MAX_DEPTH) return '[max-depth]'
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(key, item, depth + 1))
  }
  if (typeof value === 'object') {
    const output = Object.create(null) as Record<string, unknown>
    let count = 0
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      if (count >= MAX_ARRAY_ITEMS) break
      output[childKey] = sanitizeValue(childKey, childValue, depth + 1)
      count += 1
    }
    return output
  }
  return String(value)
}

/**
 * Central privacy boundary. Every attribute map that enters StackNext passes
 * through this function, in the application exporter and again in the collector.
 */
export function sanitizeAttributes(
  attributes: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!attributes) return {}
  const output = Object.create(null) as Record<string, unknown>
  let count = 0
  for (const [key, value] of Object.entries(attributes)) {
    if (count >= 100) {
      output['stacknext.truncated_attributes'] = true
      break
    }
    output[key] = sanitizeValue(key, value, 0)
    count += 1
  }
  return output
}

export function sanitizeResource(
  resource: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!resource) return {}
  const output = Object.create(null) as Record<string, unknown>
  for (const [key, value] of Object.entries(resource)) {
    if (!RESOURCE_ALLOWLIST.has(key)) continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      output[key] = sanitizeValue(key, value, 0)
    }
  }
  return output
}

export function redactSql(sql: string): string {
  return redactText(sql, 20_000)
}

export function redactErrorText(value: string): string {
  return redactText(value, 64_000)
}

/** FNV-1a: stable, dependency-free fingerprint for grouping repeated errors. */
export function fingerprint(parts: Array<string | null | undefined>): string {
  const input = parts.filter((part): part is string => Boolean(part)).join('\u0000')
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
