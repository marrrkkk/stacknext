import { listProjects } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export function GET(): Response {
  const projects = listProjects()
  return Response.json({
    project: 'nextscope-example',
    projects,
    generatedAt: new Date().toISOString(),
  })
}
