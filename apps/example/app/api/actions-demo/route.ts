import {
  concurrentAction,
  createDemoTaskAction,
  failingAction,
  notFoundAction,
  redirectAction,
  revalidateAction,
} from '@/lib/demo-actions'

export const dynamic = 'force-dynamic'

/**
 * Exercises the Server Action helper from a real Next.js request. Actual forms
 * live on /actions-demo; this route makes the same actions easy to drive from
 * the e2e test and from the command line.
 */
export async function GET(request: Request): Promise<Response> {
  const scenario = new URL(request.url).searchParams.get('case') ?? 'success'

  if (scenario === 'failure') {
    try {
      await failingAction()
    } catch (error) {
      return Response.json(
        {
          scenario,
          failed: true,
          message: error instanceof Error ? error.message : String(error),
        },
        { status: 500, headers: { 'cache-control': 'no-store' } },
      )
    }
  }

  switch (scenario) {
    case 'success': {
      const form = new FormData()
      form.set('title', '  Ship instrumentation  ')
      return Response.json(
        { scenario, result: await createDemoTaskAction(form) },
        { headers: { 'cache-control': 'no-store' } },
      )
    }
    case 'redirect':
      await redirectAction()
      break
    case 'not-found':
      await notFoundAction()
      break
    case 'revalidate':
      return Response.json(
        { scenario, result: await revalidateAction() },
        { headers: { 'cache-control': 'no-store' } },
      )
    case 'concurrent':
      return Response.json(
        {
          scenario,
          result: await Promise.all([0, 1, 2].map((index) => concurrentAction(index))),
        },
        { headers: { 'cache-control': 'no-store' } },
      )
    default:
      return Response.json(
        { error: `Unknown scenario: ${scenario}` },
        { status: 400 },
      )
  }

  return Response.json({ scenario, unreachable: true }, { status: 500 })
}
