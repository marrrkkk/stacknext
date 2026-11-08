import { listProjects } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export function GET(): Response {
  const projects = listProjects()
  return Response.json(
    {
      project: 'stacknext-example',
      projects,
      generatedAt: new Date().toISOString(),
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
