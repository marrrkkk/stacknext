import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { projects, tasks } from '@/lib/schema'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  const projectId = Number(id)
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return Response.json({ error: 'Invalid project id' }, { status: 400 })
  }
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) {
    return Response.json({ error: 'Project not found' }, { status: 404 })
  }
  const items = db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(tasks.priority, tasks.id)
    .all()
  return Response.json({ project, tasks: items })
}
