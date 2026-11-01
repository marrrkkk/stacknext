type NextScopeRequest = {
  path: string
  method: string
  headers: NodeJS.Dict<string | string[]>
}

type NextScopeRequestContext = {
  routerKind: 'Pages Router' | 'App Router'
  routePath: string
  routeType: 'render' | 'route' | 'action' | 'proxy'
  renderSource?: string
  revalidateReason: 'on-demand' | 'stale' | undefined
}

// NextScope instrumentation. Node.js runtime only; no-op without a local collector.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const nextscope = await import('@nextscope/next')
  await nextscope.register()
}

export async function onRequestError(
  error: unknown,
  request: NextScopeRequest,
  context: NextScopeRequestContext,
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const nextscope = await import('@nextscope/next')
  nextscope.onRequestError(error, request, context)
}
