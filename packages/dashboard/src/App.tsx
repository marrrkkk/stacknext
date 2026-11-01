import { useEffect, useMemo, useState } from 'react'
import type { HealthResponse } from '@nextscope/core'
import { api } from './api'
import { useAsync, useLiveTelemetry, useTheme, type Theme } from './hooks'
import { matchRoute } from './router'
import { Icon, type IconName } from './components/Icon'
import { cx, StatusDot } from './components/ui'
import { formatDuration, formatNumber, formatRelative } from './format'
import { OverviewPage } from './pages/OverviewPage'
import { RequestsPage } from './pages/RequestsPage'
import { TraceDetailPage } from './pages/TraceDetailPage'
import { TracesPage } from './pages/TracesPage'
import { DatabasePage } from './pages/DatabasePage'
import { ErrorsPage } from './pages/ErrorsPage'
import { ErrorDetailPage } from './pages/ErrorDetailPage'
import { SettingsPage } from './pages/SettingsPage'

interface NavItem {
  label: string
  path: string
  icon: IconName
  match: (path: string) => boolean
}

const NAV: NavItem[] = [
  {
    label: 'Overview',
    path: '/',
    icon: 'overview',
    match: (path) => path === '/' || path === '',
  },
  {
    label: 'Requests',
    path: '/requests',
    icon: 'requests',
    match: (path) => path.startsWith('/requests'),
  },
  {
    label: 'Traces',
    path: '/traces',
    icon: 'traces',
    match: (path) => path.startsWith('/traces'),
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
  {
    label: 'MCP & settings',
    path: '/settings',
    icon: 'settings',
    match: (path) => path.startsWith('/settings'),
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

function NotFound({ onNavigate }: { onNavigate: (path: string) => void }): React.ReactElement {
  return (
    <div className="not-found">
      <div className="not-found__code">404</div>
      <h1>This view does not exist</h1>
      <p className="muted">
        The dashboard only has Overview, Requests, Traces, Database, Errors and MCP & settings.
      </p>
      <button type="button" className="button button--primary" onClick={() => onNavigate('/')}>
        Back to overview
      </button>
    </div>
  )
}

function ConnectionFooter({ health }: { health: HealthResponse | null }): React.ReactElement {
  if (!health) {
    return (
      <div className="sidebar__connection">
        <StatusDot status="connecting" />
        <div>
          <div className="sidebar__connection-title">Connecting…</div>
          <div className="sidebar__connection-meta">local collector</div>
        </div>
      </div>
    )
  }
  const connected = health.connections.filter((connection) => connection.connected)
  return (
    <div className="sidebar__connection">
      <StatusDot status={health.connected ? 'live' : 'connecting'} />
      <div className="sidebar__connection-body">
        <div className="sidebar__connection-title">
          {health.connected ? connected[0]?.serviceName ?? 'App connected' : 'Waiting for app'}
        </div>
        <div className="sidebar__connection-meta">
          {connected[0]?.nextVersion
            ? `Next.js ${connected[0].nextVersion} · `
            : ''}
          {health.connected
            ? `${formatNumber(health.counts.spans)} spans · ${formatDuration(health.uptimeMs)} up`
            : 'make a request to start a trace'}
        </div>
      </div>
    </div>
  )
}

export function App(): React.ReactElement {
  const [path, setPath] = useState(
    () => `${window.location.pathname}${window.location.search}`,
  )
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const live = useLiveTelemetry()
  const { theme, setTheme } = useTheme()

  const route = useMemo(() => matchRoute(path.split('?')[0] ?? '/'), [path])

  const health = useAsync<HealthResponse>(
    (signal) => api.health(signal),
    'shell-health',
    0,
    10_000,
  )

  useEffect(() => {
    const onPopState = (): void => {
      setSidebarOpen(false)
      setPath(`${window.location.pathname}${window.location.search}`)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = (to: string): void => {
    if (to === `${window.location.pathname}${window.location.search}`) return
    setSidebarOpen(false)
    window.history.pushState({}, '', to)
    setPath(to)
    window.scrollTo({ top: 0 })
  }

  const refreshKey = live.sequence
  const pageHealth = health.data
  const pathname = route.page

  return (
    <div className={cx('app', sidebarOpen && 'app--sidebar-open')}>
      <aside className="sidebar">
        <div className="sidebar__brand">
          <button
            type="button"
            className="sidebar__logo"
            onClick={() => navigate('/')}
            aria-label="NextScope overview"
          >
            <span className="logo-mark">
              <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
                <defs>
                  <linearGradient id="brand-gradient" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#7dd3fc" />
                    <stop offset="1" stopColor="#818cf8" />
                  </linearGradient>
                </defs>
                <circle cx="16" cy="16" r="9" fill="none" stroke="url(#brand-gradient)" strokeWidth="2.4" />
                <circle cx="16" cy="16" r="3.2" fill="url(#brand-gradient)" />
                <path d="M23.5 8.5l3 3M8.5 23.5l-3-3" stroke="url(#brand-gradient)" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </span>
            <span className="sidebar__brand-text">
              <span className="sidebar__brand-name">NextScope</span>
              <span className="sidebar__brand-sub">{pageHealth?.projectName ?? 'local-first'}</span>
            </span>
          </button>
          <button
            type="button"
            className="sidebar__close button button--ghost button--icon"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="Primary">
          {NAV.map((item) => {
            const active = item.match(path.split('?')[0] ?? '/')
            return (
              <button
                type="button"
                key={item.path}
                className={cx('nav-item', active && 'nav-item--active')}
                onClick={() => navigate(item.path)}
                aria-current={active ? 'page' : undefined}
              >
                <Icon name={item.icon} size={17} />
                <span>{item.label}</span>
                {item.path === '/errors' && (pageHealth?.counts.errors ?? 0) > 0 && (
                  <span className="nav-item__count">{pageHealth?.counts.errors}</span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="sidebar__spacer" />

        <div className="sidebar__live">
          <div className="sidebar__live-row">
            <span className="sidebar__live-label">
              <StatusDot status={live.status} />
              {live.status === 'live' ? 'Live' : live.status}
            </span>
            {live.lastEventAt && (
              <span className="sidebar__live-time">{formatRelative(live.lastEventAt)}</span>
            )}
          </div>
          <p className="sidebar__hint">
            Local SSE feed. Nothing leaves this machine.
          </p>
        </div>

        <ConnectionFooter health={pageHealth} />

        <div className="sidebar__footer">
          <div className="sidebar__footer-row">
            <span className="mono">v{pageHealth?.version ?? '0.1.0'}</span>
            <div className="sidebar__footer-actions">
              <button
                type="button"
                className="button button--ghost button--icon"
                onClick={() => setTheme(nextTheme(theme))}
                title={`Theme: ${theme}`}
                aria-label={`Theme: ${theme}. Switch theme`}
              >
                <Icon name={THEME_ICON[theme]} size={15} />
              </button>
              <a
                className="button button--ghost button--icon"
                href="https://github.com/nextscope/nextscope"
                target="_blank"
                rel="noreferrer"
                aria-label="NextScope on GitHub"
                title="Docs and source"
              >
                <Icon name="code" size={15} />
              </a>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-scrim"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="button button--ghost button--icon topbar__menu"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <Icon name="overview" size={17} />
          </button>
          <div className="topbar__project">{pageHealth?.projectName ?? 'NextScope'}</div>
          <div className="topbar__status">
            <span className={cx('pill', pageHealth?.connected ? 'pill--good' : 'pill--muted')}>
              <StatusDot status={pageHealth?.connected ? 'live' : 'connecting'} />
              {pageHealth?.connected ? 'instrumented' : 'waiting for app'}
            </span>
            <span className="topbar__url mono">
              {pageHealth?.dashboardUrl ?? '127.0.0.1'}
            </span>
          </div>
        </header>

        <main className="content">
          {pathname === 'overview' && (
            <OverviewPage refreshKey={refreshKey} onNavigate={navigate} />
          )}
          {pathname === 'requests' && (
            <RequestsPage refreshKey={refreshKey} onNavigate={navigate} />
          )}
          {pathname === 'request' && route.id && (
            <TraceDetailPage
              key={`request:${route.id}`}
              mode="request"
              traceId={route.id}
              refreshKey={refreshKey}
              onNavigate={navigate}
            />
          )}
          {pathname === 'traces' && (
            <TracesPage refreshKey={refreshKey} onNavigate={navigate} />
          )}
          {pathname === 'trace' && route.id && (
            <TraceDetailPage
              key={`trace:${route.id}`}
              mode="trace"
              traceId={route.id}
              refreshKey={refreshKey}
              onNavigate={navigate}
            />
          )}
          {pathname === 'database' && (
            <DatabasePage refreshKey={refreshKey} onNavigate={navigate} />
          )}
          {pathname === 'errors' && (
            <ErrorsPage refreshKey={refreshKey} onNavigate={navigate} />
          )}
          {pathname === 'error' && route.id && (
            <ErrorDetailPage
              errorId={route.id}
              refreshKey={refreshKey}
              onNavigate={navigate}
            />
          )}
          {pathname === 'settings' && (
            <SettingsPage
              refreshKey={refreshKey}
              theme={theme}
              onThemeChange={setTheme}
            />
          )}
          {pathname === 'not-found' && <NotFound onNavigate={navigate} />}

          <footer className="content-footer">
            <span>
              NextScope is local-only: spans are redacted, bounded in memory and never uploaded.
            </span>
            <span className="mono">
              {pageHealth
                ? `${formatNumber(pageHealth.counts.requests)} requests · ${formatNumber(pageHealth.counts.databaseQueries)} queries`
                : ''}
            </span>
          </footer>
        </main>
      </div>
    </div>
  )
}
