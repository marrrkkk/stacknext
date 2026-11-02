import { withStackNextSpanSync } from '@stacknext/next'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Large enough to exceed the default 250 ms database span threshold even on
// fast CI runners. The current default threshold lives in StackNextConfig.
const SLOW_ROW_COUNT = 4_000_000

const SLOW_SQL = `
WITH RECURSIVE counter(x) AS (
  SELECT 1
  UNION ALL
  SELECT x + 1 FROM counter WHERE x < ${SLOW_ROW_COUNT}
)
SELECT count(*) AS count FROM counter
`

/**
 * Runs a real, CPU-bound SQLite query inside a manual span that carries
 * documented database attributes. The diagnostic engine must classify this as
 * database work even though manual spans are shown as app/custom elsewhere.
 */
export function GET(): Response {
  const row = withStackNextSpanSync(
    'demo.db.recursive_cte',
    {
      attributes: {
        'db.system': 'sqlite',
        'db.operation': 'select',
        'db.statement': SLOW_SQL.trim(),
      },
    },
    () =>
      db.$client
        .prepare(SLOW_SQL)
        .get() as { count: number },
  )
  return Response.json({
    project: 'stacknext-example',
    slow: true,
    rows: Number(row.count),
  })
}
