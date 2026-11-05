import { fingerprint, type StackNextDatabaseQuery } from '@stacknext/core'

/**
 * Display-only SQL helpers. Nothing here changes stored telemetry; the
 * normalized shape is derived from the already-redacted SQL so the dashboard
 * can group executions without a collector-side fingerprint field.
 */

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const LONG_HEX_PATTERN = /\b[0-9a-f]{16,}\b/gi

/**
 * Mirrors the diagnostics engine's `sqlFingerprint`. Keep this in sync when
 * the rule-set normalization changes; the hash is only a display identity.
 */
export function normalizeSql(sql: string): string {
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

export function queryShapeId(sql: string): string {
  return fingerprint(['sql-shape', normalizeSql(sql)])
}

export function compactSql(sql: string): string {
  return normalizeSql(sql).replace(/\s+/g, ' ').trim()
}

const CLAUSE_KEYWORDS = [
  'select',
  'from',
  'where',
  'group by',
  'order by',
  'having',
  'limit',
  'offset',
  'insert into',
  'values',
  'update',
  'set',
  'delete from',
  'returning',
  'left join',
  'right join',
  'inner join',
  'outer join',
  'full join',
  'cross join',
  'join',
  'union all',
  'union',
  'on conflict',
  'do update',
  'do nothing',
  'with',
]

interface QuoteState {
  single: boolean
  double: boolean
  backtick: boolean
  bracket: boolean
  dollar: string | null
  blockComment: boolean
  lineComment: boolean
}

function scanQuote(sql: string, index: number, state: QuoteState): number {
  const char = sql[index] ?? ''
  const next = sql[index + 1] ?? ''
  if (state.lineComment) {
    if (char === '\n') state.lineComment = false
    return index
  }
  if (state.blockComment) {
    if (char === '*' && next === '/') {
      state.blockComment = false
      return index + 1
    }
    return index
  }
  if (state.single) {
    if (char === "'" && next === "'") return index + 1
    if (char === "'") state.single = false
    return index
  }
  if (state.double) {
    if (char === '"' && next === '"') return index + 1
    if (char === '"') state.double = false
    return index
  }
  if (state.backtick) {
    if (char === '`') state.backtick = false
    return index
  }
  if (state.bracket) {
    if (char === ']') state.bracket = false
    return index
  }
  if (state.dollar) {
    if (sql.startsWith(state.dollar, index)) {
      return index + state.dollar.length - 1
    }
    return index
  }
  if (char === '-' && next === '-') {
    state.lineComment = true
    return index + 1
  }
  if (char === '/' && next === '*') {
    state.blockComment = true
    return index + 1
  }
  if (char === "'") state.single = true
  else if (char === '"') state.double = true
  else if (char === '`') state.backtick = true
  else if (char === '[') state.bracket = true
  else if (char === '$') {
    const match = /^\$[a-z_]*\$/i.exec(sql.slice(index))
    if (match?.[0]) state.dollar = match[0]
  }
  return index
}

function keywordAt(value: string): string | null {
  const lower = value.toLowerCase()
  for (const keyword of CLAUSE_KEYWORDS) {
    if (lower === keyword) return keyword
    if (lower.startsWith(`${keyword} `)) return keyword
  }
  return null
}

/**
 * Pretty-prints SQL for display only. Quoted identifiers and comments keep
 * their characters (apart from the normalized case and whitespace); only
 * whitespace between clauses changes.
 */
export function prettySql(sql: string): string {
  const normalized = normalizeSql(sql)
  const state: QuoteState = {
    single: false,
    double: false,
    backtick: false,
    bracket: false,
    dollar: null,
    blockComment: false,
    lineComment: false,
  }
  let output = ''
  let index = 0
  let pendingSpace = false
  let depth = 0
  const flushPendingSpace = (): void => {
    if (!pendingSpace) return
    if (output && !output.endsWith('\n') && !output.endsWith(' ')) output += ' '
    pendingSpace = false
  }
  while (index < normalized.length) {
    const char = normalized[index] ?? ''
    const before = index
    index = scanQuote(normalized, index, state)
    if (index !== before) {
      flushPendingSpace()
      output += normalized.slice(before, index + 1)
      index += 1
      continue
    }
    const quoted =
      state.single ||
      state.double ||
      state.backtick ||
      state.bracket ||
      state.dollar !== null ||
      state.blockComment ||
      state.lineComment
    if (quoted) {
      // A quoted identifier or comment begins here: flush the separator that
      // preceded it so the opening delimiter is not glued to the prior token.
      flushPendingSpace()
      output += char
      index += 1
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') depth = Math.max(0, depth - 1)
    if (/\s/.test(char)) {
      pendingSpace = true
      index += 1
      continue
    }
    if (pendingSpace) {
      const rest = normalized.slice(index)
      const word = /^[a-z]+(?:\s+[a-z]+)?/i.exec(rest)?.[0] ?? ''
      const keyword = keywordAt(word)
      if (keyword && depth === 0) {
        output = `${output.trimEnd()}\n${keyword.toUpperCase()}`
        index += keyword.length
        pendingSpace = false
        continue
      }
      if (char !== ',' && char !== ')' && !output.endsWith('\n')) output += ' '
      pendingSpace = false
    }
    output += char
    index += 1
  }
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

export interface QueryTitle {
  operation: string
  table: string | null
  title: string
  tables: string[]
}

const TABLE_PATTERN =
  /\b(?:from|join|update|into|delete\s+from)\s+((?:"(?:""|[^"])+"|[a-z_][\w$]*)(?:\.(?:"(?:""|[^"])+"|[a-z_][\w$]*))?)/gi

function cleanIdentifier(value: string): string {
  return value.replace(/"/g, '').replace(/^.*\./, '')
}

export function queryTables(sql: string): string[] {
  const normalized = normalizeSql(sql)
  const tables: string[] = []
  for (const match of normalized.matchAll(TABLE_PATTERN)) {
    const table = cleanIdentifier(match[1] ?? '')
    if (table && !tables.includes(table)) tables.push(table)
  }
  return tables
}

export function queryTitle(sql: string): QueryTitle {
  const normalized = normalizeSql(sql)
  const operation =
    /^\s*([a-z]+)/i.exec(normalized)?.[1]?.toUpperCase() ?? 'QUERY'
  const tables = queryTables(normalized)
  const table = tables[0] ?? null
  return {
    operation,
    table,
    tables,
    title: table ? `${operation} · ${table}` : `Query shape`,
  }
}

export interface DurationStats {
  measured: number
  total: number
  min: number | null
  median: number | null
  max: number | null
  p95: number | null
  values: number[]
}

function percentile(sorted: number[], value: number): number | null {
  if (sorted.length === 0) return null
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((value / 100) * sorted.length) - 1),
  )
  return sorted[index] ?? null
}

export function durationStats(
  queries: Array<Pick<StackNextDatabaseQuery, 'durationMs'>>,
): DurationStats {
  const values = queries
    .map((query) => query.durationMs)
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((left, right) => left - right)
  const median =
    values.length === 0
      ? null
      : values.length % 2 === 1
        ? (values[Math.floor(values.length / 2)] ?? null)
        : ((values[values.length / 2 - 1] ?? 0) + (values[values.length / 2] ?? 0)) / 2
  return {
    measured: values.length,
    total: queries.length,
    min: values[0] ?? null,
    median,
    max: values[values.length - 1] ?? null,
    p95: values.length >= 20 ? percentile(values, 95) : null,
    values,
  }
}

export function groupQueriesByShape(
  queries: StackNextDatabaseQuery[],
): Array<{
  shapeId: string
  shape: string
  sql: string
  operation: string | null
  databaseSystem: string
  queries: StackNextDatabaseQuery[]
}> {
  const groups = new Map<
    string,
    {
      shapeId: string
      shape: string
      sql: string
      operation: string | null
      databaseSystem: string
      queries: StackNextDatabaseQuery[]
    }
  >()
  for (const query of queries) {
    const shape = normalizeSql(query.sql)
    const shapeId = queryShapeId(query.sql)
    const groupKey = `${query.databaseSystem}\u0000${shape}`
    const existing = groups.get(groupKey)
    if (existing) {
      existing.queries.push(query)
    } else {
      groups.set(groupKey, {
        shapeId,
        shape,
        sql: query.sql,
        operation: query.operation ?? queryTitle(query.sql).operation.toLowerCase(),
        databaseSystem: query.databaseSystem,
        queries: [query],
      })
    }
  }
  return [...groups.values()].map((group) => ({
    ...group,
    queries: [...group.queries].sort((left, right) => left.timestamp - right.timestamp),
  }))
}

export function queryOffset(
  query: Pick<StackNextDatabaseQuery, 'timestamp'>,
  traceStart: number | null | undefined,
): number | null {
  if (traceStart === null || traceStart === undefined) return null
  return Math.max(0, query.timestamp - traceStart)
}

export interface QueryShapeSummary {
  executions: number
  measured: number
  unmeasured: number
  failed: number
  traces: number
  routes: number
  systems: string[]
  sources: string[]
  firstSeen: number | null
  lastSeen: number | null
}

export function queryShapeSummary(
  queries: Array<
    Pick<
      StackNextDatabaseQuery,
      'durationMs' | 'success' | 'timestamp' | 'databaseSystem' | 'source'
    > & { resolvedTraceId?: string | null; route?: string | null }
  >,
): QueryShapeSummary {
  const traceIds = new Set<string>()
  const routes = new Set<string>()
  const systems = new Set<string>()
  const sources = new Set<string>()
  let measured = 0
  let failed = 0
  let firstSeen: number | null = null
  let lastSeen: number | null = null
  for (const query of queries) {
    if (query.durationMs !== null && Number.isFinite(query.durationMs)) measured += 1
    if (!query.success) failed += 1
    if (query.resolvedTraceId) traceIds.add(query.resolvedTraceId)
    if (query.route) routes.add(query.route)
    systems.add(query.databaseSystem)
    sources.add(query.source)
    if (firstSeen === null || query.timestamp < firstSeen) firstSeen = query.timestamp
    if (lastSeen === null || query.timestamp > lastSeen) lastSeen = query.timestamp
  }
  return {
    executions: queries.length,
    measured,
    unmeasured: queries.length - measured,
    failed,
    traces: traceIds.size,
    routes: routes.size,
    systems: [...systems].sort(),
    sources: [...sources].sort(),
    firstSeen,
    lastSeen,
  }
}

export interface QueryTraceGroup<T extends StackNextDatabaseQuery = StackNextDatabaseQuery> {
  traceId: string | null
  route: string | null
  queries: T[]
  firstTimestamp: number
  measured: number
  totalMs: number | null
}

/**
 * Groups executions by resolved trace. Queries without a trace stay in one
 * explicit "uncorrelated" group instead of being guessed into a request.
 */
export function groupQueriesByTrace<
  T extends StackNextDatabaseQuery & {
    resolvedTraceId?: string | null
    route?: string | null
  },
>(queries: T[]): Array<QueryTraceGroup<T>> {
  const groups = new Map<string, QueryTraceGroup<T>>()
  for (const query of queries) {
    const traceId = query.resolvedTraceId ?? query.traceId ?? null
    const key = traceId ?? '__uncorrelated__'
    const existing = groups.get(key)
    if (existing) {
      existing.queries.push(query)
      if (query.route && !existing.route) existing.route = query.route
      if (query.durationMs !== null && Number.isFinite(query.durationMs)) {
        existing.measured += 1
        existing.totalMs = (existing.totalMs ?? 0) + query.durationMs
      }
      existing.firstTimestamp = Math.min(existing.firstTimestamp, query.timestamp)
    } else {
      groups.set(key, {
        traceId,
        route: query.route ?? null,
        queries: [query],
        firstTimestamp: query.timestamp,
        measured: query.durationMs !== null && Number.isFinite(query.durationMs) ? 1 : 0,
        totalMs:
          query.durationMs !== null && Number.isFinite(query.durationMs)
            ? query.durationMs
            : null,
      })
    }
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      queries: [...group.queries].sort(
        (left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id),
      ),
    }))
    .sort(
      (left, right) =>
        right.firstTimestamp - left.firstTimestamp ||
        (left.traceId ?? '').localeCompare(right.traceId ?? ''),
    )
}
