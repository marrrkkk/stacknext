export const dynamic = 'force-dynamic'

/**
 * Calls the same internal endpoint three times without caching so the
 * repeated-external-http rule has deterministic fetch spans to inspect.
 */
export async function GET(request: Request): Promise<Response> {
  const target = new URL('/api/projects', request.url)
  const responses = []
  for (let index = 0; index < 3; index += 1) {
    const response = await fetch(target, { cache: 'no-store' })
    responses.push((await response.json()) as { projects?: unknown[] })
  }
  return Response.json(
    {
      project: 'stacknext-example',
      mode: 'repeated-fetch',
      calls: responses.length,
      projects: responses[0]?.projects?.length ?? 0,
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
