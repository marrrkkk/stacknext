import { useEffect, useState } from 'react'

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
    | 'requests'
    | 'request'
    | 'traces'
    | 'trace'
    | 'database'
    | 'errors'
    | 'error'
    | 'settings'
    | 'not-found'
  id?: string
}

export function matchRoute(path: string): RouteMatch {
  if (path === '/' || path === '') return { page: 'overview' }
  const segments = path.replace(/\/+$/, '').split('/').filter(Boolean)
  if (segments[0] === 'requests') {
    return segments[1]
      ? { page: 'request', id: decodeURIComponent(segments[1]) }
      : { page: 'requests' }
  }
  if (segments[0] === 'traces') {
    return segments[1]
      ? { page: 'trace', id: decodeURIComponent(segments[1]) }
      : { page: 'traces' }
  }
  if (segments[0] === 'database') return { page: 'database' }
  if (segments[0] === 'errors') {
    return segments[1]
      ? { page: 'error', id: decodeURIComponent(segments[1]) }
      : { page: 'errors' }
  }
  if (segments[0] === 'settings') return { page: 'settings' }
  return { page: 'not-found' }
}
