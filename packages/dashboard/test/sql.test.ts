import { describe, expect, it } from 'vitest'
import { latencyStats } from '../src/components/LatencyChart'
import { sqlFingerprint } from '@stacknext/diagnostics'
import type { RegressionMetric } from '@stacknext/regression'
import type { StackNextDatabaseQuery } from '@stacknext/core'
import {
  compactSql,
  durationStats,
  groupQueriesByShape,
  groupQueriesByTrace,
  normalizeSql,
  prettySql,
  queryShapeId,
  queryShapeSummary,
  queryTitle,
} from '../src/sql'
import { isAppFrame, isMissingRecordError, parseStackFrames } from '../src/components/details'
import { formatMetricValue } from '../src/pages/RegressionScenarios'

function query(
  overrides: Partial<StackNextDatabaseQuery> & { route?: string | null; resolvedTraceId?: string | null } = {},
): StackNextDatabaseQuery {
  return {
    id: overrides.id ?? 'query-1',
    timestamp: overrides.timestamp ?? 1_000,
    durationMs: overrides.durationMs ?? 5,
    sql: overrides.sql ?? 'select * from tasks where id = 1',
    databaseSystem: overrides.databaseSystem ?? 'sqlite',
    operation: overrides.operation ?? 'select',
    success: overrides.success ?? true,
    source: overrides.source ?? 'drizzle',
    attributes: {},
    receivedAt: overrides.receivedAt ?? 1_000,
    ...overrides,
  }
}

function metric(overrides: Partial<RegressionMetric> = {}): RegressionMetric {
  return {
    key: 'query-duration:trace:select * from tasks',
    label: 'Query duration: select * from tasks',
    kind: 'duration',
    status: 'inconclusive',
    severity: 'none',
    baselineValue: null,
    candidateValue: null,
    delta: null,
    percent: null,
    sampleCount: 0,
    ...overrides,
  }
}

describe('sql display helpers', () => {
  it('normalizes literals and bind values into one display shape', () => {
    const first = normalizeSql(
      "select * from tasks where id = 1 and title = 'first' and owner_id = $1",
    )
    const second = normalizeSql(
      "SELECT * FROM tasks WHERE id = 42 AND title = 'second' AND owner_id = $9",
    )
    expect(first).toBe(second)
    expect(first).not.toContain('first')
    expect(first).not.toContain('42')
    expect(queryShapeId("select * from tasks where id = 1")).toBe(
      queryShapeId("select * from tasks where id = 2"),
    )
    expect(queryShapeId('select * from tasks')).not.toBe(
      queryShapeId('select * from projects'),
    )
  })

  it('formats clauses without exposing or changing the normalized SQL', () => {
    const sql = "select id, title from tasks where id = 7 order by title limit 10"
    expect(compactSql(sql)).toBe(
      'select id, title from tasks where id = ? order by title limit ?',
    )
    expect(prettySql(sql)).toBe(
      [
        'select id, title',
        'FROM tasks',
        'WHERE id = ?',
        'ORDER BY title',
        'LIMIT ?',
      ].join('\n'),
    )
  })

  it('keeps spaces around quoted identifiers when pretty-printing', () => {
    const sql =
      'select "id", "display name" from "tasks" where "owner id" = 1'
    expect(prettySql(sql)).toBe(
      [
        'select "id", "display name"',
        'FROM "tasks"',
        'WHERE "owner id" = ?',
      ].join('\n'),
    )
  })

  it('uses an operation and table title with a query-shape fallback', () => {
    expect(queryTitle('select id from tasks where id = 1')).toMatchObject({
      operation: 'SELECT',
      table: 'tasks',
      title: 'SELECT · tasks',
    })
    expect(queryTitle('pragma journal_mode')).toMatchObject({
      operation: 'PRAGMA',
      table: null,
      title: 'Query shape',
    })
  })

  it('keeps null durations out of every duration statistic', () => {
    const stats = durationStats([
      { durationMs: null },
      { durationMs: null },
      { durationMs: null },
    ])
    expect(stats).toMatchObject({
      measured: 0,
      total: 3,
      min: null,
      median: null,
      max: null,
      p95: null,
    })
    expect(stats.values).toEqual([])
  })

  it('only reports p95 once twenty durations are measured', () => {
    const values = Array.from({ length: 19 }, (_, index) => ({ durationMs: index + 1 }))
    expect(durationStats(values).p95).toBeNull()
    expect(durationStats([...values, { durationMs: 20 }]).p95).toBe(19)
  })

  it('groups executions by normalized shape without merging different SQL', () => {
    const groups = groupQueriesByShape([
      query({ id: 'a', sql: 'select * from tasks where id = 1' }),
      query({ id: 'b', sql: 'select * from tasks where id = 2' }),
      query({ id: 'c', sql: 'select * from projects where id = 1' }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0]?.queries.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('summarizes all-null shapes without inventing measured values', () => {
    const summary = queryShapeSummary([
      query({ durationMs: null, timestamp: 10, success: false, route: '/tasks' }),
      query({ durationMs: null, timestamp: 20, resolvedTraceId: 'trace-1' }),
    ])
    expect(summary).toMatchObject({
      executions: 2,
      measured: 0,
      unmeasured: 2,
      failed: 1,
      traces: 1,
      routes: 1,
      firstSeen: 10,
      lastSeen: 20,
    })
  })

  it('keeps uncorrelated executions in an explicit group', () => {
    const groups = groupQueriesByTrace([
      query({ id: 'a', timestamp: 10, durationMs: 4, resolvedTraceId: 'trace-1' }),
      query({ id: 'b', timestamp: 11, durationMs: null, resolvedTraceId: 'trace-1' }),
      query({ id: 'c', timestamp: 12, durationMs: 3 }),
    ])
    const correlated = groups.find((group) => group.traceId === 'trace-1')
    const uncorrelated = groups.find((group) => group.traceId === null)
    expect(correlated).toMatchObject({ measured: 1, totalMs: 4 })
    expect(correlated?.queries.map((item) => item.id)).toEqual(['a', 'b'])
    expect(uncorrelated?.queries.map((item) => item.id)).toEqual(['c'])
  })
})

describe('metric display values', () => {
  it('renders a null duration as unmeasured, never as zero', () => {
    expect(formatMetricValue(metric(), null)).toBe('unmeasured')
    expect(formatMetricValue(metric(), 12)).toBe('12 ms')
  })

  it('leaves non-duration nulls explicit rather than fabricated', () => {
    expect(formatMetricValue(metric({ kind: 'count' }), null)).toBe('—')
    expect(formatMetricValue(metric({ kind: 'count' }), 1200)).toBe('1,200')
  })
})

describe('stack display helpers', () => {
  it('splits a stack without dropping the error header', () => {
    const lines = parseStackFrames(
      'Error: boom\r\n\r\n    at run (/app/src/run.ts:10:2)\r\n    at node:internal/process/task_queues:1:1\r\n',
    )
    expect(lines).toEqual([
      'Error: boom',
      '    at run (/app/src/run.ts:10:2)',
      '    at node:internal/process/task_queues:1:1',
    ])
  })

  it('keeps app frames and hides dependency or runtime internals', () => {
    expect(isAppFrame('    at run (/app/src/run.ts:10:2)')).toBe(true)
    expect(isAppFrame('    at run (/app/node_modules/pkg/index.js:1:1)')).toBe(false)
    expect(isAppFrame('    at next (/app/node_modules/next/dist/server.js:1:1)')).toBe(false)
    expect(isAppFrame('    at node:internal/process/task_queues:1:1')).toBe(false)
    expect(isAppFrame('Error: boom')).toBe(true)
  })

  it('treats only read misses as friendly not-found states', () => {
    expect(isMissingRecordError('request failed: 404')).toBe(true)
    expect(isMissingRecordError('Trace not found')).toBe(true)
    expect(isMissingRecordError('record aged out of the store')).toBe(true)
    expect(isMissingRecordError('fetch failed: ECONNREFUSED')).toBe(false)
  })
})


it('keeps SQL normalizers aligned across quoted identifiers, strings, and comments', () => {
  const cases = [
    ['SELECT * FROM "task--archive" -- comment', 'select * from "task--archive"'],
    ['SELECT * FROM "Task/*Live*/" /* comment */', 'select * from "Task/*Live*/"'],
    ['SELECT "a""--b" FROM "public"."Tasks"', 'select "a""--b" from "public"."Tasks"'],
    ["SELECT 'it''s -- /* quoted */' FROM tasks", 'select ? from tasks'],
    ["SELECT E'it\\\'s -- quoted' FROM tasks", 'select ? from tasks'],
    ['SELECT $tag$-- /* literal */$tag$ FROM tasks', 'select ? from tasks'],
    ['SELECT * FROM `task--live`', 'select * from `task--live`'],
    ['SELECT * FROM [task/*live*/]', 'select * from [task/*live*/]'],
    ['SELECT /* nested /* comment */ end */ * FROM tasks', 'select * from tasks'],
  ]
  for (const [sql, expected] of cases) {
    expect(normalizeSql(sql!)).toBe(expected)
    expect(sqlFingerprint(sql!)).toBe(expected)
  }
  expect(queryTitle('SELECT * FROM "public"."Tasks"').table).toBe('Tasks')
  expect(groupQueriesByShape([
    query({ sql: 'select * from "Tasks"' }),
    query({ sql: 'select * from "tasks"' }),
    query({ sql: 'select * from "task--archive"' }),
    query({ sql: 'select * from "task--live"' }),
  ])).toHaveLength(4)
})

it('separates query groups by database system', () => {
  const groups = groupQueriesByShape([
    query({ databaseSystem: 'sqlite' }),
    query({ databaseSystem: 'postgresql' }),
    query({ databaseSystem: 'sqlite', sql: 'SELECT * FROM tasks WHERE id = 2' }),
  ])
  expect(groups.map((group) => [group.databaseSystem, group.queries.length])).toEqual([
    ['sqlite', 2], ['postgresql', 1],
  ])
})

it('uses only server slow flags when the collector threshold is unavailable', () => {
  const requests = [false, true].map((slow) => ({
    id: String(slow), traceId: String(slow), name: 'GET /', method: 'GET', route: '/',
    statusCode: 200, statusClass: '2xx' as const, durationMs: 1_000, timestamp: 1_000,
    endTime: 2_000, spanCount: 1, errorCount: 0, databaseQueryCount: 0, fetchCount: 0,
    failed: false, slow, serviceName: 'test',
  }))
  expect(latencyStats(requests, null)).toMatchObject({ slowCount: 1, allUnderThreshold: false })
  expect(latencyStats(requests, 250)).toMatchObject({ slowCount: 2 })
})
