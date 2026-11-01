const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

export class CollectorApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'CollectorApiError'
    this.status = status
  }
}

function assertLoopback(baseUrl: string): URL {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new Error(`Invalid collector URL: ${baseUrl}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Collector URL must use http or https')
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('NextScope only talks to a loopback collector')
  }
  return url
}

export async function collectorFetch(
  baseUrl: string,
  pathname: string,
  token: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = assertLoopback(baseUrl)
  const url = new URL(pathname, base)
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${token}`)
  const response = await fetch(url, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(5_000),
  })
  return response
}

export async function collectorJson<T>(
  baseUrl: string,
  pathname: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await collectorFetch(baseUrl, pathname, token, init)
  if (!response.ok) {
    let message = `Collector responded with HTTP ${response.status}`
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload.error) message = payload.error
    } catch {
      // Keep the status-based message.
    }
    throw new CollectorApiError(message, response.status)
  }
  return (await response.json()) as T
}
