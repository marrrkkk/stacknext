import { useEffect, useState } from 'react'

/** Decode a URL path segment without throwing on malformed escapes. */
function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export interface RouterState {
  path: string
  navigate: (to: string, replace?: boolean) => void
}

export function useRouter(): RouterState {
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const onPopState = (): void => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [path])

  return {
    path,
    navigate: (to, replace = false) => {
      if (to === window.location.pathname) return
      if (replace) window.history.replaceState({}, '', to)
      else window.history.pushState({}, '', to)
      setPath(to)
    },
  }
}

export interface RouteMatch {
  page:
    | 'overview'
    | 'traces'
    | 'trace'
    | 'database'
    | 'database-query'
    | 'errors'
    | 'error'
    | 'diagnostics'
    | 'diagnostic'
    | 'snapshots'
    | 'snapshot'
    | 'snapshot-traces'
    | 'snapshot-trace'
    | 'snapshot-errors'
    | 'snapshot-error'
    | 'snapshot-database'
    | 'runs'
    | 'run'
    | 'baselines'
    | 'baseline'
    | 'comparisons'
    | 'comparison'
    | 'settings'
    | 'mcp'
    | 'redirect'
    | 'not-found'
  id?: string
  childId?: string
  to?: string
}

/** Resolve a legacy path to its canonical URL, preserving list filters. */
export function legacyRedirect(path: string): string | null {
  const [pathname, search = ''] = path.split('?')
  const route = matchRoute(pathname ?? '/')
  if (route.page !== 'redirect' || !route.to) return null
  if (route.to === '/traces?view=requests' && search) {
    const params = new URLSearchParams(search)
    params.delete('view')
    const next = new URLSearchParams({ view: 'requests' })
    for (const [key, value] of params) next.append(key, value)
    return `/traces?${next.toString()}`
  }
  return route.to
}

export function matchRoute(path: string): RouteMatch {
  const pathname = path.split('#')[0] ?? path
  if (pathname === '/' || pathname === '') return { page: 'overview' }
  const segments = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  if (segments[0] === 'requests') {
    return segments[1]
      ? { page: 'redirect', to: `/traces/${encodeURIComponent(decodeSegment(segments[1]))}` }
      : { page: 'redirect', to: '/traces?view=requests' }
  }
  if (segments[0] === 'traces') {
    return segments[1]
      ? { page: 'trace', id: decodeSegment(segments[1]) }
      : { page: 'traces' }
  }
  if (segments[0] === 'database') {
    return segments[1]
      ? { page: 'database-query', id: decodeSegment(segments[1]) }
      : { page: 'database' }
  }
  if (segments[0] === 'errors') {
    return segments[1]
      ? { page: 'error', id: decodeSegment(segments[1]) }
      : { page: 'errors' }
  }
  if (segments[0] === 'diagnostics') {
    return segments[1]
      ? { page: 'diagnostic', id: decodeSegment(segments[1]) }
      : { page: 'diagnostics' }
  }
  if (segments[0] === 'snapshots') {
    if (!segments[1]) return { page: 'snapshots' }
    const id = decodeSegment(segments[1])
    if (!segments[2]) return { page: 'snapshot', id }
    if (segments[2] === 'traces') {
      return segments[3]
        ? { page: 'snapshot-trace', id, childId: decodeSegment(segments[3]) }
        : { page: 'snapshot-traces', id }
    }
    if (segments[2] === 'errors') {
      return segments[3]
        ? { page: 'snapshot-error', id, childId: decodeSegment(segments[3]) }
        : { page: 'snapshot-errors', id }
    }
    if (segments[2] === 'database' && !segments[3]) {
      return { page: 'snapshot-database', id }
    }
    return { page: 'not-found' }
  }
  if (segments[0] === 'runs') {
    return segments[1]
      ? { page: 'run', id: decodeSegment(segments[1]) }
      : { page: 'runs' }
  }
  if (segments[0] === 'baselines') {
    return segments[1]
      ? { page: 'baseline', id: decodeSegment(segments[1]) }
      : { page: 'baselines' }
  }
  if (segments[0] === 'comparisons') {
    return segments[1]
      ? { page: 'comparison', id: decodeSegment(segments[1]) }
      : { page: 'comparisons' }
  }
  if (segments[0] === 'settings') return { page: 'settings' }
  if (segments[0] === 'mcp') return { page: 'mcp' }
  return { page: 'not-found' }
}
