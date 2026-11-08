'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { withStackNextAction } from '@stacknext/next'
import { db, tasks } from './db'
import { getProject } from './queries'
import type { TaskStatus } from './schema'

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  todo: 'doing',
  doing: 'done',
  done: 'todo',
}

function revalidateProject(projectId: number): void {
  revalidatePath('/')
  revalidatePath('/projects')
  revalidatePath(`/projects/${projectId}`)
}

/**
 * Creates a real task from a Server Action. The span records only bounded,
 * non-sensitive attributes; the title itself is never emitted.
 */
export async function createTaskAction(formData: FormData): Promise<void> {
  const projectId = Number(formData.get('projectId'))
  const title = String(formData.get('title') ?? '')
    .trim()
    .slice(0, 120)
  if (!Number.isInteger(projectId) || projectId <= 0 || title.length === 0) return
  if (!getProject(projectId)) return

  await withStackNextAction(
    'action/create-project-task',
    {
      attributes: {
        'app.action': 'create-task',
        'app.project.id': projectId,
      },
    },
    async (span) => {
      db.insert(tasks)
        .values({
          projectId,
          title,
          status: 'todo',
          priority: 2,
          createdAt: Date.now(),
        })
        .run()
      span.setAttribute('app.title.characters', title.length)
    },
  )

  revalidateProject(projectId)
}

/** Advances a task through todo → doing → done → todo. */
export async function advanceTaskAction(formData: FormData): Promise<void> {
  const taskId = Number(formData.get('taskId'))
  if (!Number.isInteger(taskId) || taskId <= 0) return

  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!task) return
  const next = NEXT_STATUS[task.status]

  await withStackNextAction(
    'action/advance-task',
    {
      attributes: {
        'app.action': 'advance-task',
        'app.project.id': task.projectId,
        'app.task.from': task.status,
        'app.task.to': next,
      },
    },
    async (span) => {
      db.update(tasks)
        .set({ status: next, completedAt: next === 'done' ? Date.now() : null })
        .where(eq(tasks.id, taskId))
        .run()
      span.setAttribute('app.task.id', taskId)
    },
  )

  revalidateProject(task.projectId)
}
