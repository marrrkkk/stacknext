type StackNextRequest = {
  path: string
  method: string
  headers: NodeJS.Dict<string | string[]>
}

type StackNextRequestContext = {
  routerKind: 'Pages Router' | 'App Router'
  routePath: string
  routeType: 'render' | 'route' | 'action' | 'proxy'
  renderSource?: string
  revalidateReason: 'on-demand' | 'stale' | undefined
}

// StackNext instrumentation. Node.js runtime only; no-op without a local collector.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const stacknext = await import('@stacknext/next')
  await stacknext.register()
}

export async function onRequestError(
  error: unknown,
  request: StackNextRequest,
  context: StackNextRequestContext,
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const stacknext = await import('@stacknext/next')
  stacknext.onRequestError(error, request, context)
}
