import { afterEach, describe, expect, it, vi } from 'vitest'

// A minimal hook host lets these tests control pending promises and effect ticks
// without a DOM renderer. State/ref slots survive renders, as they do in React.
const host = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => void>,
  cleanups: [] as Array<() => void>,
}))
vi.mock('react', () => ({
  useRef: (value: unknown) => {
    const index = host.cursor++
    return host.slots[index] ??= { current: value }
  },
  useState: (value: unknown) => {
    const index = host.cursor++
    if (!(index in host.slots)) host.slots[index] = value
    return [host.slots[index], (next: unknown) => {
      host.slots[index] = typeof next === 'function' ? next(host.slots[index]) : next
    }]
  },
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const index = host.cursor++
    const previous = host.slots[index] as unknown[] | undefined
    if (previous && deps.every((dep, i) => Object.is(dep, previous[i]))) return
    host.slots[index] = deps
    host.effects.push(() => {
      host.cleanups[index]?.()
      const cleanup = effect()
      host.cleanups[index] = cleanup ?? (() => {})
    })
  },
}))
import { useAsync, useLiveTelemetry } from '../src/hooks'

function render<T>(hook: () => T): T {
  host.cursor = 0
  const result = hook()
  host.effects.splice(0).forEach((effect) => effect())
  return result
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
afterEach(() => {
  host.cleanups.forEach((cleanup) => cleanup?.())
  host.slots = []
  host.cleanups = []
  host.effects = []
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('refresh recovery', () => {
  it.each(['resolve', 'reject'] as const)('manual refresh replaces a stalled request and ignores its late %s', async (outcome) => {
    const old = deferred<string>()
    const fresh = deferred<string>()
    const trailing = deferred<string>()
    const signals: AbortSignal[] = []
    const loader = vi.fn((signal: AbortSignal) => {
      signals.push(signal)
      return [old.promise, fresh.promise, trailing.promise][signals.length - 1] ?? trailing.promise
    })
    let tick = 0
    const useTestAsync = () => useAsync(loader, 'same', tick)
    render(useTestAsync)
    tick++
    const state = render(useTestAsync)
    expect(loader).toHaveBeenCalledTimes(1)
    state.reload()
    render(useTestAsync)
    expect(signals[0]!.aborted).toBe(true)
    expect(loader).toHaveBeenCalledTimes(2)
    expect(render(useTestAsync).loading).toBe(true)
    fresh.resolve('fresh')
    await settle()
    expect(render(useTestAsync)).toMatchObject({ data: 'fresh', loading: false, error: null })
    // An obsolete finally must not settle the newer request or trigger reloads.
    tick++
    render(useTestAsync)
    tick++
    render(useTestAsync)
    if (outcome === 'resolve') old.resolve('stale')
    else old.reject(new Error('stale error'))
    await settle()
    expect(render(useTestAsync)).toMatchObject({ data: 'fresh', loading: false, error: null })
    expect(loader).toHaveBeenCalledTimes(3)
    trailing.resolve('trailing')
    await settle()
    expect(loader).toHaveBeenCalledTimes(4)
  })

  it('preserves reconnecting status through a delayed telemetry flush', () => {
    vi.useFakeTimers()
    const listeners = new Map<string, (event: { data: string }) => void>()
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('document', { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('EventSource', class {
      addEventListener(name: string, callback: (event: { data: string }) => void) { listeners.set(name, callback) }
      removeEventListener() {}
      close() {}
    })
    render(useLiveTelemetry)
    listeners.get('open')?.({ data: '' })
    listeners.get('telemetry')?.({ data: JSON.stringify({ sequence: 1, accepted: { spans: 1 } }) })
    listeners.get('error')?.({ data: '' })
    expect(render(useLiveTelemetry).status).toBe('reconnecting')
    vi.advanceTimersByTime(1000)
    expect(render(useLiveTelemetry)).toMatchObject({ status: 'reconnecting', spanEpoch: 1, telemetryEpoch: 1 })
    listeners.get('open')?.({ data: '' })
    expect(render(useLiveTelemetry).status).toBe('live')
  })
})
