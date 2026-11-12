import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ErrorListResponse, HealthResponse } from '@stacknext/core'
import { api } from './api'
import { useAsync, useLiveTelemetry, useTheme, type Theme } from './hooks'
import { legacyRedirect, matchRoute } from './router'
import { BrandMark } from './components/BrandMark'
import { CommandPalette } from './components/CommandPalette'
import { Icon, type IconName } from './components/Icon'
import { TooltipLayer } from './components/TooltipLayer'
import { Banner, cx, Kbd, PageChromeContext, shortcutLabel, StatusDot } from './components/ui'
import { formatDuration, formatNumber, formatRelative } from './format'
import { captureStatus } from './captureStatus'
import { SampleStatus } from './components/SampleStatus'

const OverviewPage = lazy(() =>
  import('./pages/OverviewPage').then((module) => ({ default: module.OverviewPage })),
)
const TraceDetailPage = lazy(() =>
  import('./pages/TraceDetailPage').then((module) => ({ default: module.TraceDetailPage })),
)
const TracesPage = lazy(() =>
  import('./pages/TracesPage').then((module) => ({ default: module.TracesPage })),
)
const DatabasePage = lazy(() =>
  import('./pages/DatabasePage').then((module) => ({ default: module.DatabasePage })),
)
const DatabaseQueryDetailPage = lazy(() =>
  import('./pages/DatabaseQueryDetailPage').then((module) => ({
    default: module.DatabaseQueryDetailPage,
  })),
)
const ErrorsPage = lazy(() =>
  import('./pages/ErrorsPage').then((module) => ({ default: module.ErrorsPage })),
)
const ErrorDetailPage = lazy(() =>
  import('./pages/ErrorDetailPage').then((module) => ({ default: module.ErrorDetailPage })),
)
const DiagnosticsPage = lazy(() =>
  import('./pages/DiagnosticsPage').then((module) => ({ default: module.DiagnosticsPage })),
)
const DiagnosticDetailPage = lazy(() =>
  import('./pages/DiagnosticDetailPage').then((module) => ({
    default: module.DiagnosticDetailPage,
  })),
)
const RunsPage = lazy(() =>
  import('./pages/RunsPage').then((module) => ({ default: module.RunsPage })),
)
const RunDetailPage = lazy(() =>
  import('./pages/RunDetailPage').then((module) => ({ default: module.RunDetailPage })),
)
const BaselinesPage = lazy(() =>
  import('./pages/BaselinesPage').then((module) => ({ default: module.BaselinesPage })),
)
const BaselineDetailPage = lazy(() =>
  import('./pages/BaselineDetailPage').then((module) => ({
    default: module.BaselineDetailPage,
  })),
)
const ComparisonsPage = lazy(() =>
  import('./pages/ComparisonsPage').then((module) => ({ default: module.ComparisonsPage })),
)
const ComparisonDetailPage = lazy(() =>
  import('./pages/ComparisonDetailPage').then((module) => ({
    default: module.ComparisonDetailPage,
  })),
)
const SnapshotsPage = lazy(() =>
  import('./pages/SnapshotsPage').then((module) => ({ default: module.SnapshotsPage })),
)
const SnapshotDetailPage = lazy(() =>
  import('./pages/SnapshotDetailPage').then((module) => ({
    default: module.SnapshotDetailPage,
  })),
)
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)
const McpPage = lazy(() =>
  import('./pages/McpPage').then((module) => ({ default: module.McpPage })),
)

function RouteFallback(): React.ReactElement {
  return (
    <div className="route-fallback" aria-busy="true">
      <span className="skeleton route-fallback__title" />
      <span className="skeleton route-fallback__card" />
      <span className="skeleton route-fallback__card" />
      <span className="sr-only">Loading page</span>
    </div>
  )
}

interface LiveRefreshKeys {
  telemetry: number
  errors: number
  queries: number
}

const ZERO_REFRESH_KEYS: LiveRefreshKeys = { telemetry: 0, errors: 0, queries: 0 }

function isLiveRowTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        '.table tbody tr, .timeline__row, .latency-chart__item, .list-row, .coverage-table tbody tr',
      ),
    )
  )
}

interface NavItem {
  label: string
  path: string
  icon: IconName
  match: (path: string) => boolean
}

interface NavGroup {
  id: string
  label: string
  items: NavItem[]
  collapsible?: boolean
}

const REGRESSION_PATHS = ['/runs', '/baselines', '/comparisons']

function isRegressionPath(path: string): boolean {
  return REGRESSION_PATHS.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`),
  )
}

function isRequestsView(path: string): boolean {
  return path.startsWith('/traces') && path.includes('view=requests')
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'debug',
    label: 'Debug',
    items: [
      {
        label: 'Overview',
        path: '/',
        icon: 'overview',
        match: (path) => {
          const pathname = path.split(/[?#]/)[0] ?? '/'
          return pathname === '/' || pathname === ''
        },
      },
      {
        label: 'Requests',
        path: '/traces?view=requests',
        icon: 'requests',
        match: isRequestsView,
      },
      {
        label: 'Traces',
        path: '/traces',
        icon: 'traces',
        match: (path) => path.startsWith('/traces') && !isRequestsView(path),
      },
      {
        label: 'Database',
        path: '/database',
        icon: 'database',
        match: (path) => path.startsWith('/database'),
      },
      {
        label: 'Errors',
        path: '/errors',
        icon: 'errors',
        match: (path) => path.startsWith('/errors'),
      },
    ],
  },
  {
    id: 'evidence',
    label: 'Evidence',
    items: [
      {
        label: 'Diagnostics',
        path: '/diagnostics',
        icon: 'pulse',
        match: (path) => path.startsWith('/diagnostics'),
      },
      {
        label: 'Snapshots',
        path: '/snapshots',
        icon: 'layers',
        match: (path) => path.startsWith('/snapshots'),
      },
    ],
  },
  {
    id: 'regression',
    label: 'Regression',
    collapsible: true,
    items: [
      {
        label: 'Test runs',
        path: '/runs',
        icon: 'terminal',
        match: (path) => path.startsWith('/runs'),
      },
      {
        label: 'Baselines',
        path: '/baselines',
        icon: 'flag',
        match: (path) => path.startsWith('/baselines'),
      },
      {
        label: 'Comparisons',
        path: '/comparisons',
        icon: 'compare',
        match: (path) => path.startsWith('/comparisons'),
      },
    ],
  },
  {
    id: 'configure',
    label: 'Configure',
    items: [
      {
        label: 'Settings',
        path: '/settings',
        icon: 'settings',
        match: (path) => path.startsWith('/settings'),
      },
      {
        label: 'MCP server',
        path: '/mcp',
        icon: 'terminal',
        match: (path) => path.startsWith('/mcp'),
      },
    ],
  },
]

const THEME_ICON: Record<Theme, IconName> = {
  dark: 'moon',
  light: 'sun',
  system: 'monitor',
}

function nextTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark'
}

interface ErrorMarker {
  id: string
  timestamp: number
}

const SEEN_ERRORS_KEY = 'stacknext-errors-seen'
const seenErrorListeners = new Set<() => void>()
let seenErrorRaw: string | null | undefined
let seenErrorSnapshot: ErrorMarker | null = null

function parseSeenErrorMarker(raw: string | null): ErrorMarker | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ErrorMarker> | null
    if (
      parsed &&
      typeof parsed.id === 'string' &&
      typeof parsed.timestamp === 'number' &&
      Number.isFinite(parsed.timestamp)
    ) {
      return { id: parsed.id, timestamp: parsed.timestamp }
    }
  } catch {
    // Ignore unreadable local state and start without a marker.
  }
  return null
}

function getSeenErrorMarker(): ErrorMarker | null {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(SEEN_ERRORS_KEY)
  } catch {
    raw = null
  }
  if (raw !== seenErrorRaw) {
    seenErrorRaw = raw
    seenErrorSnapshot = parseSeenErrorMarker(raw)
  }
  return seenErrorSnapshot
}

function subscribeSeenErrorMarker(listener: () => void): () => void {
  seenErrorListeners.add(listener)
  return () => seenErrorListeners.delete(listener)
}

function persistSeenErrorMarker(marker: ErrorMarker): void {
  const serialized = JSON.stringify(marker)
  try {
    window.localStorage.setItem(SEEN_ERRORS_KEY, serialized)
    seenErrorRaw = serialized
  } catch {
    seenErrorRaw = null
  }
  seenErrorSnapshot = marker
  for (const listener of seenErrorListeners) listener()
}

function isNewerErrorMarker(latest: ErrorMarker, seen: ErrorMarker): boolean {
  return (
    latest.timestamp > seen.timestamp ||
    (latest.timestamp === seen.timestamp && latest.id !== seen.id)
  )
}

function NotFound({ onNavigate }: { onNavigate: (path: string) => void }): React.ReactElement {
  return (
    <div className="not-found">
      <div className="not-found__code">404</div>
      <h1>This view does not exist</h1>
      <p className="muted">
        The dashboard has Overview, Requests, Traces, Database, Snapshots, Errors,
        Diagnostics, Test runs, Baselines, Comparisons, Settings and MCP server. Press{' '}
        <Kbd>{shortcutLabel('K')}</Kbd> to jump to any view.
      </p>
      <button
        type="button"
        className="button button--primary"
        onClick={() => onNavigate('/')}
      >
        Back to overview
      </button>
    </div>
  )
}

function ConnectionFooter({ health }: { health: HealthResponse | null }): React.ReactElement {
  if (!health) {
    return (
      <div className="sidebar__connection">
        <div className="sidebar__row">
          <span className="sidebar__row-label">
            <StatusDot status="connecting" />
            Connecting…
          </span>
        </div>
        <div className="sidebar__row-meta">local collector</div>
      </div>
    )
  }
  const { connected, inactive, partial, affected } = captureStatus(health.connections)
  const primary = connected[0]
  const hasInactive = inactive.length > 0
  return (
    <div className="sidebar__connection">
      <div className="sidebar__row">
        <span className="sidebar__row-label">
          <StatusDot status={health.connected && !hasInactive ? 'live' : 'connecting'} />
          {hasInactive
            ? `${partial ? 'Partial request capture' : 'Request capture inactive'} · ${affected}`
            : health.connected
              ? primary?.serviceName ?? 'App connected'
              : 'Waiting for app'}
        </span>
      </div>
      <div className="sidebar__row-meta">
        {primary?.nextVersion ? `Next.js ${primary.nextVersion} · ` : ''}
        {hasInactive
          ? 'external OpenTelemetry provider on affected instances'
          : health.connected
            ? `${formatNumber(health.counts.spans)} spans · ${formatDuration(health.uptimeMs)} up`
            : 'make a request to start a trace'}
      </div>
    </div>
  )
}

function normalizePath(path: string): string {
  return legacyRedirect(path) ?? path
}

function isTraceList(path: string): boolean {
  return matchRoute(path.split('?')[0] ?? '/').page === 'traces'
}

function initialPath(): string {
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  const next = normalizePath(current)
  if (next !== current) window.history.replaceState({}, '', next)
  return next
}

export function App(): React.ReactElement {
  const [path, setPath] = useState(initialPath)
  const [tracesEpoch, setTracesEpoch] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('stacknext-sidebar-collapsed') === '1',
  )
  const [commandOpen, setCommandOpen] = useState(false)
  const [regressionOpen, setRegressionOpen] = useState(() => isRegressionPath(path))
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia('(max-width: 900px)').matches,
  )
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const collapseButtonRef = useRef<HTMLButtonElement | null>(null)
  const expandButtonRef = useRef<HTMLButtonElement | null>(null)
  const sidebarToggleFocusPending = useRef(false)
  const commandTriggerRef = useRef<HTMLButtonElement | null>(null)
  const contentRef = useRef<HTMLElement | null>(null)
  const live = useLiveTelemetry()
  const [refreshKeys, setRefreshKeys] = useState<LiveRefreshKeys>(ZERO_REFRESH_KEYS)
  const [pausedAtSequence, setPausedAtSequence] = useState<number | null>(null)
  const seenErrorMarker = useSyncExternalStore(
    subscribeSeenErrorMarker,
    getSeenErrorMarker,
    getSeenErrorMarker,
  )
  const appliedLiveKeys = useRef<LiveRefreshKeys>(ZERO_REFRESH_KEYS)
  const liveKeysRef = useRef<LiveRefreshKeys>(ZERO_REFRESH_KEYS)
  const pointerPosition = useRef({ x: -1, y: -1 })
  const applyPendingLiveKey = useCallback(() => {
    const next = liveKeysRef.current
    const applied = appliedLiveKeys.current
    if (
      next.telemetry === applied.telemetry &&
      next.errors === applied.errors &&
      next.queries === applied.queries
    ) {
      return
    }
    appliedLiveKeys.current = next
    setRefreshKeys(next)
  }, [])
  const { theme, setTheme } = useTheme()

  const livePaused = pausedAtSequence !== null
  const pendingLive = livePaused
    ? Math.max(0, live.sequence - pausedAtSequence)
    : 0

  const toggleLivePause = useCallback((): void => {
    if (pausedAtSequence !== null) {
      setPausedAtSequence(null)
      applyPendingLiveKey()
      return
    }
    setPausedAtSequence(live.sequence)
  }, [applyPendingLiveKey, live.sequence, pausedAtSequence])

  useEffect(() => {
    liveKeysRef.current = {
      telemetry: live.telemetryEpoch,
      errors: live.errorEpoch,
      queries: live.queryEpoch,
    }
  }, [live.telemetryEpoch, live.errorEpoch, live.queryEpoch])

  useEffect(() => {
    if (pausedAtSequence !== null) return
    const applied = appliedLiveKeys.current
    if (
      live.telemetryEpoch === applied.telemetry &&
      live.errorEpoch === applied.errors &&
      live.queryEpoch === applied.queries
    ) {
      return
    }
    const { x, y } = pointerPosition.current
    const target = x >= 0 ? document.elementFromPoint(x, y) : null
    if (isLiveRowTarget(target)) return
    applyPendingLiveKey()
  }, [
    live.telemetryEpoch,
    live.errorEpoch,
    live.queryEpoch,
    pausedAtSequence,
    applyPendingLiveKey,
  ])

  useEffect(() => {
    if (pausedAtSequence !== null) return
    const onPointerMove = (event: PointerEvent): void => {
      pointerPosition.current = { x: event.clientX, y: event.clientY }
      if (!isLiveRowTarget(event.target)) applyPendingLiveKey()
    }
    const onPointerOut = (event: PointerEvent): void => {
      if (event.relatedTarget !== null) return
      pointerPosition.current = { x: -1, y: -1 }
      applyPendingLiveKey()
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerout', onPointerOut)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerout', onPointerOut)
    }
  }, [applyPendingLiveKey, pausedAtSequence])

  const [breadcrumbTarget, setBreadcrumbTarget] = useState<HTMLElement | null>(null)

  const route = useMemo(() => matchRoute(path.split('?')[0] ?? '/'), [path])

  const health = useAsync<HealthResponse>(
    (signal) => api.health(signal),
    'shell-health',
    0,
    10_000,
  )
  const latestErrors = useAsync<ErrorListResponse>(
    (signal) => api.errors({ limit: 1 }, signal),
    'shell-latest-error',
    0,
    10_000,
  )
  const latestErrorMarker = useMemo<ErrorMarker | null>(() => {
    const latest = latestErrors.data?.items[0]
    return latest ? { id: latest.id, timestamp: latest.timestamp } : null
  }, [latestErrors.data])

  useEffect(() => {
    if (!latestErrorMarker) return
    if (route.page !== 'errors' && route.page !== 'error') return
    if (seenErrorMarker && !isNewerErrorMarker(latestErrorMarker, seenErrorMarker)) {
      return
    }
    persistSeenErrorMarker(latestErrorMarker)
  }, [latestErrorMarker, route.page, seenErrorMarker])

  useEffect(() => {
    const onPopState = (): void => {
      setSidebarOpen(false)
      setPausedAtSequence(null)
      applyPendingLiveKey()
      const rawPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
      const nextPath = normalizePath(rawPath)
      if (nextPath !== rawPath) window.history.replaceState({}, '', nextPath)
      setPath(nextPath)
      if (isRegressionPath(nextPath)) setRegressionOpen(true)
      if (isTraceList(nextPath)) setTracesEpoch((value) => value + 1)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [applyPendingLiveKey])

  useEffect(() => {
    if (!sidebarOpen) return
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sidebarOpen])

  useEffect(() => {
    localStorage.setItem('stacknext-sidebar-collapsed', sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])

  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)')
    const onChange = (): void => {
      setIsMobile(query.matches)
      if (!query.matches) setSidebarOpen(false)
    }
    onChange()
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const wasSidebarOpen = useRef(false)
  useEffect(() => {
    if (sidebarOpen) {
      wasSidebarOpen.current = true
      return
    }
    if (wasSidebarOpen.current) {
      wasSidebarOpen.current = false
      if (menuButtonRef.current?.offsetParent) {
        menuButtonRef.current.focus()
      } else {
        const activeNav = document.querySelector<HTMLButtonElement>('.nav-item--active')
        const fallback = activeNav ?? document.querySelector<HTMLButtonElement>('.sidebar__logo')
        fallback?.focus()
      }
    }
  }, [sidebarOpen])

  const closeSidebar = (): void => {
    setSidebarOpen(false)
  }

  const toggleSidebar = useCallback((): void => {
    setSidebarOpen((open) => !open)
  }, [])

  const collapseSidebar = useCallback((): void => {
    sidebarToggleFocusPending.current = true
    setSidebarCollapsed(true)
  }, [])

  const expandSidebar = useCallback((): void => {
    sidebarToggleFocusPending.current = true
    setSidebarCollapsed(false)
  }, [])

  useEffect(() => {
    if (!sidebarToggleFocusPending.current) return
    sidebarToggleFocusPending.current = false
    const target = sidebarCollapsed ? expandButtonRef.current : collapseButtonRef.current
    target?.focus()
  }, [sidebarCollapsed])

  const cycleTheme = useCallback((): void => {
    setTheme(nextTheme(theme))
  }, [setTheme, theme])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.defaultPrevented) return
      const key = event.key.toLowerCase()
      if (key === 'k') {
        event.preventDefault()
        if (!commandOpen) setSidebarOpen(false)
        setCommandOpen(!commandOpen)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [commandOpen])

  const navigate = useCallback((to: string): void => {
    const target = normalizePath(to)
    if (target === `${window.location.pathname}${window.location.search}${window.location.hash}`) return
    setSidebarOpen(false)
    setCommandOpen(false)
    if (pausedAtSequence !== null) setPausedAtSequence(null)
    applyPendingLiveKey()
    window.history.pushState({}, '', target)
    setPath(target)
    if (isRegressionPath(target)) setRegressionOpen(true)
    if (isTraceList(target)) setTracesEpoch((value) => value + 1)
  }, [applyPendingLiveKey, pausedAtSequence])

  const replacePath = useCallback((to: string): void => {
    const target = normalizePath(to)
    if (target === `${window.location.pathname}${window.location.search}`) return
    window.history.replaceState({}, '', target)
    setPath(target)
  }, [])

  useLayoutEffect(() => {
    const hashIndex = path.indexOf('#')
    const hash = hashIndex >= 0 ? path.slice(hashIndex + 1) : ''
    if (!hash) {
      contentRef.current?.scrollTo({ top: 0 })
      return
    }
    const scrollToHash = (): boolean => {
      const target = document.getElementById(hash)
      if (!target) return false
      target.scrollIntoView({ block: 'start' })
      return true
    }
    if (scrollToHash()) return
    const root = contentRef.current
    if (!root || typeof MutationObserver === 'undefined') return
    let timer = 0
    const observer = new MutationObserver(() => {
      if (!scrollToHash()) return
      observer.disconnect()
      window.clearTimeout(timer)
    })
    observer.observe(root, { childList: true, subtree: true })
    timer = window.setTimeout(() => observer.disconnect(), 5_000)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [path])

  const pageHealth = health.data
  const externalCapture = captureStatus(pageHealth?.connections ?? [])
  const pathname = route.page
  const projectName = pageHealth?.projectName ?? 'StackNext'
  const errorCount = pageHealth?.counts.errors ?? 0
  const unseenErrors =
    latestErrorMarker !== null &&
    (seenErrorMarker === null ||
      isNewerErrorMarker(latestErrorMarker, seenErrorMarker)) &&
    pathname !== 'errors' &&
    pathname !== 'error'

  const breadcrumbRef = useCallback((node: HTMLDivElement | null) => {
    setBreadcrumbTarget(node)
  }, [])

  const chrome = useMemo(
    () => ({
      breadcrumb: breadcrumbTarget,
      projectName,
    }),
    [breadcrumbTarget, projectName],
  )

  const sidebarIsCollapsed = sidebarCollapsed && !isMobile

  return (
    <div
      className={cx(
        'app',
        sidebarOpen && 'app--sidebar-open',
        sidebarIsCollapsed && 'app--sidebar-collapsed',
      )}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <div className="shell">
        <aside className="sidebar" id="app-sidebar">
        <div className="sidebar__brand">
          {sidebarIsCollapsed ? (
            <button
              type="button"
              className="sidebar__expand button button--ghost button--icon button--compact"
              onClick={expandSidebar}
              aria-label="Expand sidebar"
              aria-expanded={false}
              aria-controls="app-sidebar"
              title="Expand sidebar"
              ref={expandButtonRef}
            >
              <Icon name="panel-left" size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="sidebar__logo"
              onClick={() => navigate('/')}
              aria-label="StackNext overview"
            >
              <span className="logo-mark">
                <BrandMark size={20} />
              </span>
              <span className="sidebar__brand-text">
                <span className="sidebar__brand-name">StackNext</span>
                <span className="sidebar__brand-sub">{projectName}</span>
              </span>
            </button>
          )}
          <div className="sidebar__brand-actions">
            <button
              type="button"
              className="sidebar__collapse button button--ghost button--icon button--compact"
              onClick={collapseSidebar}
              aria-label="Collapse sidebar"
              aria-expanded={true}
              aria-controls="app-sidebar"
              title="Collapse sidebar"
              ref={collapseButtonRef}
            >
              <Icon name="panel-left" size={15} />
            </button>
            <button
              type="button"
              className="sidebar__close button button--ghost button--icon"
              onClick={closeSidebar}
              aria-label="Close navigation"
              ref={closeButtonRef}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>

        <nav className="sidebar__nav" aria-label="Primary">
          {NAV_GROUPS.map((group) => {
            const open = !group.collapsible || sidebarIsCollapsed || regressionOpen
            const itemsId = `nav-group-${group.id}`
            return (
              <div className="nav-group" key={group.id}>
                {group.collapsible ? (
                  <button
                    type="button"
                    className="nav-group__label nav-group__toggle"
                    onClick={() => setRegressionOpen((value) => !value)}
                    aria-expanded={open}
                    aria-controls={itemsId}
                    title={sidebarIsCollapsed ? group.label : undefined}
                  >
                    <span>{group.label}</span>
                    <Icon
                      name={open ? 'chevron-down' : 'chevron-right'}
                      size={12}
                    />
                  </button>
                ) : (
                  <div className="nav-group__label" aria-hidden="true">
                    {group.label}
                  </div>
                )}
                <div className="nav-group__items" id={itemsId}>
                  {open &&
                    group.items.map((item) => {
                      const active = item.match(path)
                      return (
                        <button
                          type="button"
                          key={item.path}
                          className={cx('nav-item', active && 'nav-item--active')}
                          onClick={() => navigate(item.path)}
                          aria-current={active ? 'page' : undefined}
                          title={sidebarIsCollapsed ? item.label : undefined}
                        >
                          <Icon name={item.icon} size={16} />
                          <span className="nav-item__label">{item.label}</span>
                          {item.path === '/errors' && errorCount > 0 && (
                            <span
                              className={cx(
                                'nav-item__count',
                                unseenErrors && 'nav-item__count--unseen',
                              )}
                              title={
                                unseenErrors
                                  ? 'New errors since your last visit'
                                  : `${errorCount} errors`
                              }
                            >
                              {errorCount}
                            </span>
                          )}
                        </button>
                      )
                    })}
                </div>
              </div>
            )
          })}
        </nav>

        <div className="sidebar__spacer" />

        <div className="sidebar__live">
          <div className="sidebar__row">
            <span className="sidebar__row-label">
              <StatusDot status={live.status} />
              <span className="sidebar__row-text">
                {live.status === 'live' ? 'Live' : live.status}
              </span>
            </span>
            {live.lastEventAt && (
              <span className="sidebar__row-time">{formatRelative(live.lastEventAt)}</span>
            )}
          </div>
          <p className="sidebar__hint">
            Local SSE feed. Nothing leaves this machine.
          </p>
        </div>

        <ConnectionFooter health={pageHealth} />

        <div className="sidebar__footer">
          <div className="sidebar__footer-row">
            <span className="mono sidebar__version">v{pageHealth?.version ?? '0.6.0'}</span>
            <div className="sidebar__footer-actions">
              <button
                type="button"
                className="button button--ghost button--icon button--compact"
                onClick={cycleTheme}
                title={`Theme: ${theme}`}
                aria-label={`Theme: ${theme}. Switch theme`}
              >
                <Icon name={THEME_ICON[theme]} size={14} />
              </button>
              <a
                className="button button--ghost button--icon button--compact"
                href="https://github.com/marrrkkk/stacknext"
                target="_blank"
                rel="noreferrer"
                aria-label="StackNext on GitHub"
                title="Docs and source"
              >
                <Icon name="code" size={14} />
              </a>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-scrim"
          onClick={closeSidebar}
          aria-label="Close navigation"
        />
      )}

      <div className="main" inert={sidebarOpen || commandOpen || undefined}>
        <header className="topbar">
          <button
            type="button"
            className="button button--ghost button--icon topbar__sidebar-toggle"
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            title="Toggle navigation"
            ref={menuButtonRef}
          >
            <Icon name="panel-left" size={16} />
          </button>
          <div className="topbar__breadcrumb">
            <button
              type="button"
              className="topbar__project topbar__project--link"
              onClick={() => navigate('/')}
              title={`Open ${projectName} overview`}
            >
              {projectName}
            </button>
            <Icon name="chevron-right" size={14} className="topbar__separator" />
            <div className="topbar__slot" ref={breadcrumbRef} />
          </div>
          <SampleStatus health={pageHealth} onNavigate={navigate} />
          <button
            type="button"
            className="topbar__command"
            ref={commandTriggerRef}
            onClick={() => setCommandOpen(true)}
            aria-label="Search views and actions"
            title={`Search or jump to (${shortcutLabel('K')})`}
          >
            <Icon name="search" size={14} />
            <span className="topbar__command-label">Search or jump to…</span>
            <Kbd>{shortcutLabel('K')}</Kbd>
          </button>
        </header>
        <PageChromeContext.Provider value={chrome}>
          <main className="content" id="main-content" ref={contentRef} tabIndex={-1}>
            {externalCapture.inactive.length > 0 && (
              <Banner
                tone="warn"
                icon="shield"
                role="alert"
                title={externalCapture.partial ? 'Request capture is partial' : 'Request capture is inactive'}
              >
                Request capture is inactive for {externalCapture.affected} because an
                external OpenTelemetry provider is registered on those instances.
                StackNext yields to those providers. {externalCapture.partial
                  ? 'Other connected instances still have StackNext request capture enabled.'
                  : 'No connected instance has StackNext request capture enabled.'} Run{' '}
                <code>npx stacknext doctor</code> and follow the Next.js integration
                guide.
              </Banner>
            )}
            <Suspense fallback={<RouteFallback />}>
              {pathname === 'overview' && (
                <OverviewPage
                  refreshKey={refreshKeys.telemetry}
                  onNavigate={navigate}
                  liveStatus={live.status}
                  paused={livePaused}
                  pendingLive={pendingLive}
                  onTogglePause={toggleLivePause}
                />
              )}
              {pathname === 'traces' && (
                <TracesPage
                  key={tracesEpoch}
                  refreshKey={refreshKeys.telemetry}
                  onNavigate={navigate}
                  onReplaceUrl={replacePath}
                  slowThresholdMs={pageHealth?.config.slowRequestMs ?? 250}
                />
              )}
              {pathname === 'trace' && route.id && (
                <TraceDetailPage
                  key={`trace:${route.id}`}
                  traceId={route.id}
                  refreshKey={refreshKeys.telemetry}
                  onNavigate={navigate}
                />
              )}
              {pathname === 'redirect' && null}
              {pathname === 'database' && (
                <DatabasePage
                  refreshKey={refreshKeys.telemetry}
                  onNavigate={navigate}
                  repeatedQueryMin={pageHealth?.config.diagnostics.repeatedQueryMin}
                />
              )}
              {pathname === 'database-query' && route.id && (
                <DatabaseQueryDetailPage
                  key={`database-shape:${route.id}`}
                  shapeId={route.id}
                  onNavigate={navigate}
                />
              )}
              {pathname === 'errors' && (
                <ErrorsPage refreshKey={refreshKeys.errors} onNavigate={navigate} />
              )}
              {pathname === 'error' && route.id && (
                <ErrorDetailPage
                  errorId={route.id}
                  refreshKey={refreshKeys.telemetry}
                  onNavigate={navigate}
                />
              )}
              {pathname === 'diagnostics' && (
                <DiagnosticsPage
                  refreshKey={refreshKeys.telemetry}
                  onNavigate={navigate}
                  repeatedQueryMin={pageHealth?.config.diagnostics.repeatedQueryMin}
                />
              )}
              {pathname === 'diagnostic' && route.id && (
                <DiagnosticDetailPage
                  diagnosticId={route.id}
                  refreshKey={refreshKeys.telemetry}
                  onNavigate={navigate}
                />
              )}
              {pathname === 'runs' && (
                <RunsPage refreshKey={0} onNavigate={navigate} />
              )}
              {pathname === 'run' && route.id && (
                <RunDetailPage
                  key={`run:${route.id}`}
                  runId={route.id}
                  refreshKey={0}
                  onNavigate={navigate}
                />
              )}
              {pathname === 'baselines' && (
                <BaselinesPage refreshKey={0} onNavigate={navigate} />
              )}
              {pathname === 'baseline' && route.id && (
                <BaselineDetailPage
                  key={`baseline:${route.id}`}
                  baselineId={route.id}
                  refreshKey={0}
                  onNavigate={navigate}
                />
              )}
              {pathname === 'comparisons' && (
                <ComparisonsPage refreshKey={0} onNavigate={navigate} />
              )}
              {pathname === 'comparison' && route.id && (
                <ComparisonDetailPage
                  key={`comparison:${route.id}`}
                  comparisonId={route.id}
                  refreshKey={0}
                  onNavigate={navigate}
                />
              )}
              {pathname === 'snapshots' && (
                <SnapshotsPage refreshKey={0} onNavigate={navigate} />
              )}
              {pathname === 'snapshot' && route.id && (
                <SnapshotDetailPage
                  key={`snapshot:${route.id}`}
                  snapshotId={route.id}
                  refreshKey={0}
                  onNavigate={navigate}
                />
              )}
              {pathname === 'snapshot-traces' && route.id && (
                <TracesPage
                  key={`snapshot-traces:${route.id}`}
                  refreshKey={0}
                  onNavigate={navigate}
                  onReplaceUrl={replacePath}
                  slowThresholdMs={
                    pageHealth?.config.slowRequestMs ?? 250
                  }
                  snapshotId={route.id}
                />
              )}
              {pathname === 'snapshot-trace' && route.id && route.childId && (
                <TraceDetailPage
                  key={`snapshot-trace:${route.id}:${route.childId}`}
                  traceId={route.childId}
                  refreshKey={0}
                  onNavigate={navigate}
                  snapshotId={route.id}
                />
              )}
              {pathname === 'snapshot-errors' && route.id && (
                <ErrorsPage
                  key={`snapshot-errors:${route.id}`}
                  refreshKey={0}
                  onNavigate={navigate}
                  snapshotId={route.id}
                />
              )}
              {pathname === 'snapshot-error' && route.id && route.childId && (
                <ErrorDetailPage
                  key={`snapshot-error:${route.id}:${route.childId}`}
                  errorId={route.childId}
                  refreshKey={0}
                  onNavigate={navigate}
                  snapshotId={route.id}
                />
              )}
              {pathname === 'snapshot-database' && route.id && (
                <DatabasePage
                  key={`snapshot-database:${route.id}`}
                  refreshKey={0}
                  onNavigate={navigate}
                  snapshotId={route.id}
                  repeatedQueryMin={pageHealth?.config.diagnostics.repeatedQueryMin}
                />
              )}
              {pathname === 'settings' && (
                <SettingsPage
                  refreshKey={0}
                  theme={theme}
                  onThemeChange={setTheme}
                  onCycleTheme={cycleTheme}
                  onNavigate={navigate}
                />
              )}
              {pathname === 'mcp' && (
                <McpPage refreshKey={0} onNavigate={navigate} />
              )}
              {pathname === 'not-found' && <NotFound onNavigate={navigate} />}
            </Suspense>
          </main>
        </PageChromeContext.Provider>
      </div>
      </div>

      <CommandPalette
        open={commandOpen}
        projectName={projectName}
        theme={theme}
        returnFocusRef={commandTriggerRef}
        onClose={() => setCommandOpen(false)}
        onNavigate={navigate}
        onCycleTheme={cycleTheme}
      />

      <TooltipLayer />
    </div>
  )
}
