import { resetDemoData } from '@/lib/db'
import { listProjects } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export function POST(): Response {
  resetDemoData()
  return Response.json({
    reset: true,
    projects: listProjects().length,
  })
}
