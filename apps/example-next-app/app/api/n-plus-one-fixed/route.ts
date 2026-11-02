import { inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { projects, tasks } from '@/lib/schema'

export const dynamic = 'force-dynamic'

/** Batched counterpart to /api/n-plus-one: one task query for all projects. */
export function GET(): Response {
  const projectRows = db.select().from(projects).all()
  const allTasks =
    projectRows.length === 0
      ? []
      : db
          .select()
          .from(tasks)
          .where(
            inArray(
              tasks.projectId,
              projectRows.map((project) => project.id),
            ),
          )
          .all()
  const groups = projectRows.map((project) => ({
    projectId: project.id,
    tasks: allTasks.filter((task) => task.projectId === project.id),
  }))
  return Response.json({
    project: 'stacknext-example',
    mode: 'batched',
    projects: projectRows.length,
    taskQueries: 1,
    groups,
  })
}
