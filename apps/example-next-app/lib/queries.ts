import { sql } from 'drizzle-orm'
import { db, projects, tasks } from './db'

export interface ProjectStats {
  id: number
  name: string
  description: string
  createdAt: number
  total: number
  done: number
  doing: number
  todo: number
}

export function listProjects(): ProjectStats[] {
  const rows = db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      createdAt: projects.createdAt,
      total: sql<number>`count(${tasks.id})`,
      done: sql<number>`coalesce(sum(case when ${tasks.status} = 'done' then 1 else 0 end), 0)`,
      doing: sql<number>`coalesce(sum(case when ${tasks.status} = 'doing' then 1 else 0 end), 0)`,
      todo: sql<number>`coalesce(sum(case when ${tasks.status} = 'todo' then 1 else 0 end), 0)`,
    })
    .from(projects)
    .leftJoin(tasks, sql`${tasks.projectId} = ${projects.id}`)
    .groupBy(projects.id)
    .orderBy(projects.id)
    .all()
  return rows.map((row) => ({
    ...row,
    total: Number(row.total),
    done: Number(row.done),
    doing: Number(row.doing),
    todo: Number(row.todo),
  }))
}
