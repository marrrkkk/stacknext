import { listProjects } from '@/lib/queries'

export const dynamic = 'force-dynamic'

/**
 * Deliberately slow route used to demonstrate slow-request detection and the
 * request waterfall. `delay` is capped so the demo cannot hang a worker.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const requested = Number(url.searchParams.get('delay') ?? '300')
  const delay = Number.isFinite(requested)
    ? Math.min(2_000, Math.max(10, Math.round(requested)))
    : 300

  const projects = listProjects()
  await new Promise((resolve) => setTimeout(resolve, delay))
  const tasksCount = projects.reduce((sum, project) => sum + project.total, 0)

  return Response.json(
    {
      slow: true,
      delayMs: delay,
      projects: projects.length,
      tasks: tasksCount,
    },
    {
      headers: {
        'cache-control': 'no-store',
        'x-demo-delay': String(delay),
      },
    },
  )
}
