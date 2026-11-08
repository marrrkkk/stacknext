import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { projects, tasks } from '@/lib/schema'

export const dynamic = 'force-dynamic'

/**
 * Deliberately runs one task query per item. The project ids repeat so the demo
 * reliably crosses the repeated-query threshold even with a small seed data set.
 */
export function GET(): Response {
  const projectRows = db.select().from(projects).all()
  const projectIds = [1, 2, 3, 1, 2, 3, 1, 2]
  const groups = projectIds.map((projectId) => ({
    projectId,
    tasks: db.select().from(tasks).where(eq(tasks.projectId, projectId)).all(),
  }))
  return Response.json(
    {
      project: 'stacknext-example',
      mode: 'n-plus-one',
      projects: projectRows.length,
      taskQueries: groups.length,
      groups,
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
