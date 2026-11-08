import { getProject, listProjectTasks } from '@/lib/queries'

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
  const project = getProject(projectId)
  if (!project) {
    return Response.json({ error: 'Project not found' }, { status: 404 })
  }
  return Response.json(
    { project, tasks: listProjectTasks(projectId) },
    { headers: { 'cache-control': 'no-store' } },
  )
}
