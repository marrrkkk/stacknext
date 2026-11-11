import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
}

/**
 * Loads data whenever the semantic key changes, on a live refresh tick or from
 * an interval. The loader is read through a ref so callers can pass inline
 * closures without loops.
 *
 * Refreshes are single-flight: a tick that arrives while a request is running
 * is collapsed into one trailing reload instead of aborting and restarting the
 * request. Manual refresh replaces the active request. Key changes abort
 * immediately because the previous data is no longer relevant. Interval loads
 * pause while the tab is hidden and catch up once when it becomes visible.
 */
export function useAsync<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  key: string,
  refreshKey = 0,
  intervalMs?: number,
  shouldPoll?: boolean | ((data: T | null) => boolean),
): AsyncState<T> & { reload: () => void } {
  const loaderRef = useRef(loader)
  const shouldPollRef = useRef(shouldPoll)
  const dataRef = useRef<T | null>(null)
  const runRef = useRef<((showLoading: boolean) => void) | null>(null)
  const lastCompletedAtRef = useRef(0)
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: true,
  })
  const [localRefresh, setLocalRefresh] = useState(0)
  const inputsRef = useRef({ key, refreshKey, localRefresh })

  useEffect(() => {
    loaderRef.current = loader
  }, [loader])

  useEffect(() => {
    shouldPollRef.current = shouldPoll
  }, [shouldPoll])

  useEffect(() => {
    let controller = new AbortController()
    let requestId = 0
    let cancelled = false
    let inFlight = false
    let pending = false
    dataRef.current = null
    lastCompletedAtRef.current = 0

    const settle = (id: number): void => {
      if (cancelled || id !== requestId) return
      inFlight = false
      lastCompletedAtRef.current = Date.now()
      if (!pending) return
      pending = false
      request(false)
    }

    const request = (showLoading: boolean): void => {
      if (cancelled) return
      if (inFlight && !showLoading) {
        pending = true
        return
      }
      if (inFlight) {
        controller.abort()
        controller = new AbortController()
        pending = false
      }
      const id = ++requestId
      inFlight = true
      if (showLoading) {
        setState((previous) => ({ ...previous, loading: true, error: null }))
      }
      let promise: Promise<T>
      try {
        promise = loaderRef.current(controller.signal)
      } catch (error) {
        inFlight = false
        if (!cancelled) {
          setState((previous) => ({
            ...previous,
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          }))
        }
        return
      }
      promise
        .then((data) => {
          if (!cancelled && id === requestId) {
            dataRef.current = data
            setState({ data, error: null, loading: false })
          }
        })
        .catch((error: unknown) => {
          if (cancelled || id !== requestId || controller.signal.aborted) return
          setState((previous) => ({
            ...previous,
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          }))
        })
        .finally(() => settle(id))
    }

    runRef.current = request
    request(true)

    return () => {
      cancelled = true
      controller.abort()
      runRef.current = null
    }
  }, [key])

  // Live refreshes collapse into one trailing reload. Manual refresh replaces
  // an active request so a stalled loader cannot block recovery.
  useEffect(() => {
    const previous = inputsRef.current
    inputsRef.current = { key, refreshKey, localRefresh }
    if (previous.key !== key) return
    if (
      previous.refreshKey === refreshKey &&
      previous.localRefresh === localRefresh
    ) {
      return
    }
    const live = previous.refreshKey !== refreshKey
    runRef.current?.(previous.localRefresh !== localRefresh || !live)
  }, [key, refreshKey, localRefresh])

  // Interval polling. Hidden tabs make no read requests; a stale page catches
  // up once when it becomes visible again.
  useEffect(() => {
    if (intervalMs === undefined || intervalMs <= 0) return
    const canPoll = (): boolean => {
      if (document.hidden) return false
      const rule = shouldPollRef.current
      if (typeof rule === 'function') return rule(dataRef.current)
      return rule !== false
    }
    const tick = (): void => {
      if (!canPoll()) return
      runRef.current?.(false)
    }
    const timer = window.setInterval(tick, intervalMs)
    const onVisibilityChange = (): void => {
      if (!canPoll()) return
      if (Date.now() - lastCompletedAtRef.current < intervalMs) return
      runRef.current?.(false)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [key, intervalMs])

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
  /** Advances when a flush contains new spans. */
  spanEpoch: number
  /** Advances when a flush contains new errors. */
  errorEpoch: number
  /** Advances when a flush contains new database queries. */
  queryEpoch: number
  /** Advances on every flush, whatever the resource type. */
  telemetryEpoch: number
}

const INITIAL_LIVE_STATE: LiveState = {
  status: 'connecting',
  sequence: 0,
  lastEventAt: null,
  spanEpoch: 0,
  errorEpoch: 0,
  queryEpoch: 0,
  telemetryEpoch: 0,
}

/** Update React at most once per second instead of once per ingest event. */
const LIVE_FLUSH_MS = 1000

interface LivePayload {
  sequence?: number
  accepted?: {
    spans?: number
    errors?: number
    databaseQueries?: number
  }
}

interface PendingLive {
  sequence: number
  lastEventAt: number
  spans: boolean
  errors: boolean
  queries: boolean
}

/**
 * Subscribes to the collector SSE feed. EventSource reconnects automatically.
 * Events are coalesced into a bounded flush, so ingest rate does not become
 * render or fetch rate. While the tab is hidden the pending update is retained
 * but never pushed to React; one flush runs when the tab becomes visible.
 */
export function useLiveTelemetry(): LiveState {
  const [state, setState] = useState<LiveState>(INITIAL_LIVE_STATE)

  useEffect(() => {
    const source = new EventSource('/api/stream')
    let timer: number | undefined
    let pending: PendingLive | null = null
    let lastSequence = 0

    const flush = (): void => {
      if (timer !== undefined) {
        window.clearTimeout(timer)
        timer = undefined
      }
      if (!pending || document.hidden) return
      const next = pending
      pending = null
      lastSequence = Math.max(lastSequence, next.sequence)
      setState((previous) => ({
        status: previous.status,
        sequence: lastSequence,
        lastEventAt: next.lastEventAt,
        spanEpoch: previous.spanEpoch + (next.spans ? 1 : 0),
        errorEpoch: previous.errorEpoch + (next.errors ? 1 : 0),
        queryEpoch: previous.queryEpoch + (next.queries ? 1 : 0),
        telemetryEpoch: previous.telemetryEpoch + 1,
      }))
    }

    const schedule = (): void => {
      if (document.hidden || timer !== undefined) return
      timer = window.setTimeout(flush, LIVE_FLUSH_MS)
    }

    let streamStatus: LiveStatus = 'connecting'
    const setStatus = (next: LiveStatus): void => {
      if (streamStatus === next) return
      streamStatus = next
      setState((previous) =>
        previous.status === next ? previous : { ...previous, status: next },
      )
    }

    const ready = (): void => setStatus('live')

    const telemetry = (event: MessageEvent<string>): void => {
      let payload: LivePayload = {}
      try {
        payload = JSON.parse(event.data) as LivePayload
      } catch {
        payload = {}
      }
      const accepted = payload.accepted
      // A delivered event proves the stream is healthy even if the browser has
      // not fired `open` again after a reconnect.
      setStatus('live')
      // Be conservative when talking to an older collector: an event without
      // accepted counts may contain any resource.
      const unknown = accepted === undefined
      const spans = unknown || (accepted.spans ?? 0) > 0
      const errors = unknown || (accepted.errors ?? 0) > 0
      const queries = unknown || (accepted.databaseQueries ?? 0) > 0
      const sequence =
        payload.sequence ?? (pending?.sequence ?? lastSequence) + 1
      const now = Date.now()
      if (pending) {
        pending.sequence = Math.max(pending.sequence, sequence)
        pending.lastEventAt = now
        pending.spans = pending.spans || spans
        pending.errors = pending.errors || errors
        pending.queries = pending.queries || queries
      } else {
        pending = { sequence, lastEventAt: now, spans, errors, queries }
      }
      schedule()
    }

    const onError = (): void => {
      if (streamStatus === 'connecting') return
      setStatus('reconnecting')
    }

    const onVisibilityChange = (): void => {
      if (document.hidden || !pending) return
      flush()
    }

    source.addEventListener('open', ready)
    source.addEventListener('ready', ready)
    source.addEventListener('telemetry', telemetry as EventListener)
    source.addEventListener('error', onError)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      source.removeEventListener('open', ready)
      source.removeEventListener('ready', ready)
      source.removeEventListener('telemetry', telemetry as EventListener)
      source.removeEventListener('error', onError)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (timer !== undefined) window.clearTimeout(timer)
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
