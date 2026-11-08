import { desc, eq, sql } from 'drizzle-orm'
import { db, projects, tasks } from './db'
import type { Project, Task } from './schema'

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

export interface WorkspaceSummary {
  projects: number
  tasks: number
  open: number
  done: number
  completion: number
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

export function workspaceSummary(items: readonly ProjectStats[]): WorkspaceSummary {
  const total = items.reduce((sum, project) => sum + project.total, 0)
  const done = items.reduce((sum, project) => sum + project.done, 0)
  return {
    projects: items.length,
    tasks: total,
    open: total - done,
    done,
    completion: total === 0 ? 0 : Math.round((done / total) * 100),
  }
}

export function getProject(id: number): Project | null {
  return db.select().from(projects).where(eq(projects.id, id)).get() ?? null
}

export function listProjectTasks(projectId: number): Task[] {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(tasks.priority, tasks.id)
    .all()
}

export function listRecentTasks(limit = 6): Task[] {
  return db.select().from(tasks).orderBy(desc(tasks.createdAt), desc(tasks.id)).limit(limit).all()
}
