import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
}

/**
 * Loads data whenever the key or live refresh counter changes. The loader is
 * read through a ref so callers can pass inline closures without loops.
 * `suspendInterval` pauses background interval loads without aborting an
 * in-flight request or changing the refresh key.
 */
export function useAsync<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  key: string,
  refreshKey = 0,
  intervalMs?: number,
  suspendInterval = false,
): AsyncState<T> & { reload: () => void } {
  const loaderRef = useRef(loader)
  const suspendIntervalRef = useRef(suspendInterval)
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: true,
  })
  const [localRefresh, setLocalRefresh] = useState(0)

  useEffect(() => {
    loaderRef.current = loader
  }, [loader])

  useEffect(() => {
    suspendIntervalRef.current = suspendInterval
  }, [suspendInterval])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    const load = (initial: boolean): void => {
      if (initial) {
        setState((previous) => ({ ...previous, loading: true, error: null }))
      }
      loaderRef
        .current(controller.signal)
        .then((data) => {
          if (!cancelled) setState({ data, error: null, loading: false })
        })
        .catch((error: unknown) => {
          if (cancelled || controller.signal.aborted) return
          setState((previous) => ({
            ...previous,
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          }))
        })
    }

    load(true)
    let timer: number | undefined
    if (intervalMs && intervalMs > 0) {
      timer = window.setInterval(() => {
        if (!suspendIntervalRef.current) load(false)
      }, intervalMs)
    }
    return () => {
      cancelled = true
      controller.abort()
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [key, refreshKey, localRefresh, intervalMs])

  const reload = useCallback((): void => {
    setLocalRefresh((value) => value + 1)
  }, [])

  return {
    ...state,
    reload,
  }
}

export type LiveStatus = 'connecting' | 'live' | 'reconnecting'

export interface LiveState {
  status: LiveStatus
  sequence: number
  lastEventAt: number | null
}

/**
 * Subscribes to the collector SSE feed. EventSource reconnects automatically;
 * the sequence counter drives page refreshes.
 */
export function useLiveTelemetry(): LiveState {
  const [state, setState] = useState<LiveState>({
    status: 'connecting',
    sequence: 0,
    lastEventAt: null,
  })

  useEffect(() => {
    const source = new EventSource('/api/stream')

    const ready = (): void => {
      setState((previous) => ({ ...previous, status: 'live' }))
    }
    const telemetry = (event: MessageEvent<string>): void => {
      try {
        const payload = JSON.parse(event.data) as { sequence?: number }
        setState((previous) => ({
          status: 'live',
          sequence: payload.sequence ?? previous.sequence + 1,
          lastEventAt: Date.now(),
        }))
      } catch {
        setState((previous) => ({
          ...previous,
          status: 'live',
          sequence: previous.sequence + 1,
          lastEventAt: Date.now(),
        }))
      }
    }
    source.addEventListener('open', ready)
    source.addEventListener('ready', ready)
    source.addEventListener('telemetry', telemetry as EventListener)
    source.addEventListener('error', () => {
      setState((previous) =>
        previous.status === 'connecting'
          ? previous
          : { ...previous, status: 'reconnecting' },
      )
    })

    return () => {
      source.removeEventListener('ready', ready)
      source.removeEventListener('telemetry', telemetry as EventListener)
      source.close()
    }
  }, [])

  return state
}

export type Theme = 'dark' | 'light' | 'system'

export function useTheme(): { theme: Theme; resolved: 'dark' | 'light'; setTheme: (theme: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('stacknext-theme')
    return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'system'
  })
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (event: MediaQueryListEvent): void => setSystemDark(event.matches)
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [])

  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    localStorage.setItem('stacknext-theme', theme)
  }, [theme, resolved])

  return {
    theme,
    resolved,
    setTheme: (next) => setThemeState(next),
  }
}

export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
