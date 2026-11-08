'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { BrandMark } from './BrandMark'
import { Icon, type IconName } from './Icon'
import { cx } from './ui'

interface NavItem {
  label: string
  href: string
  icon: IconName
  external?: boolean
  match?: (path: string) => boolean
}

interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'demo',
    label: 'Demo',
    items: [
      { label: 'Overview', href: '/', icon: 'overview', match: (path) => path === '/' },
      {
        label: 'Projects',
        href: '/projects',
        icon: 'projects',
        match: (path) => path.startsWith('/projects'),
      },
      {
        label: 'Demo scenarios',
        href: '/scenarios',
        icon: 'scenarios',
        match: (path) => path.startsWith('/scenarios'),
      },
      {
        label: 'Server actions',
        href: '/actions-demo',
        icon: 'actions',
        match: (path) => path.startsWith('/actions-demo'),
      },
    ],
  },
  {
    id: 'stacknext',
    label: 'StackNext',
    items: [
      {
        label: 'Open dashboard',
        href: '/__dashboard',
        icon: 'external',
        external: true,
      },
      {
        label: 'Documentation',
        href: 'https://github.com/marrrkkk/stacknext#readme',
        icon: 'book',
        external: true,
      },
    ],
  },
]

const PAGE_TITLES: Array<[RegExp, string]> = [
  [/^\/$/, 'Overview'],
  [/^\/projects\/[^/]+/, 'Project detail'],
  [/^\/projects/, 'Projects'],
  [/^\/scenarios/, 'Demo scenarios'],
  [/^\/actions-demo/, 'Server actions'],
]

function pageTitle(pathname: string): string {
  return PAGE_TITLES.find(([pattern]) => pattern.test(pathname))?.[1] ?? 'Example'
}

function isActive(item: NavItem, pathname: string): boolean {
  if (item.external) return false
  return item.match ? item.match(pathname) : pathname === item.href
}

export function AppShell({
  children,
  dashboardUrl,
}: {
  children: ReactNode
  dashboardUrl: string
}): React.ReactElement {
  const pathname = usePathname()
  // Storing the path with the open flag closes the panel on any navigation
  // without a setState-in-effect cascade.
  const [nav, setNav] = useState<{ open: boolean; path: string }>({
    open: false,
    path: pathname,
  })
  const sidebarRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const navOpen = nav.open && nav.path === pathname
  const openNav = useCallback((): void => {
    setNav({ open: true, path: pathname })
  }, [pathname])
  const closeNav = useCallback((): void => {
    setNav({ open: false, path: pathname })
    if (navOpen) menuButtonRef.current?.focus()
  }, [navOpen, pathname])

  useEffect(() => {
    if (!navOpen) return
    const sidebar = sidebarRef.current
    if (!sidebar) return
    const focusable = (): HTMLElement[] => Array.from(
      sidebar.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]'),
    ).filter((element) => element.getClientRects().length > 0)
    const focusFirst = (): void => { (focusable()[0] ?? sidebar).focus() }
    focusFirst()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeNav()
      if (event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0] ?? sidebar
      const last = elements[elements.length - 1] ?? sidebar
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [navOpen, closeNav])

  const toggleTheme = (): void => {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
    const next = current === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('stacknext-theme', next)
    } catch {
      // Private browsing can reject storage; the document attribute still applies.
    }
  }

  const resolveHref = (item: NavItem): string =>
    item.external && item.href === '/__dashboard' ? dashboardUrl : item.href
  const dashboardHost = new URL(dashboardUrl).host

  return (
    <div className={cx('app', navOpen && 'app--nav-open')}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <aside ref={sidebarRef} tabIndex={-1} className="sidebar" id="app-sidebar">
        <div className="sidebar__brand">
          <Link className="brand" href="/" aria-label="StackNext example overview">
            <span className="brand__mark">
              <BrandMark size={20} />
            </span>
            <span className="brand__text">
              <span className="brand__name">StackNext</span>
              <span className="brand__sub">Example app</span>
            </span>
          </Link>
          <button
            type="button"
            className="button button--ghost button--icon button--compact sidebar__close"
            onClick={closeNav}
            aria-label="Close navigation"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="Example navigation">
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.id}>
              <div className="nav-group__label" aria-hidden="true">
                {group.label}
              </div>
              {group.items.map((item) => {
                const active = isActive(item, pathname)
                const href = resolveHref(item)
                return item.external ? (
                  <a
                    key={item.label}
                    className="nav-item"
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon name={item.icon} size={16} />
                    <span className="nav-item__label">{item.label}</span>
                    <Icon name="external" size={12} className="nav-item__external" />
                  </a>
                ) : (
                  <Link
                    key={item.label}
                    className={cx('nav-item', active && 'nav-item--active')}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={closeNav}
                  >
                    <Icon name={item.icon} size={16} />
                    <span className="nav-item__label">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar__spacer" />

        <div className="sidebar__note">
          <div className="sidebar__row">
            <span className="sidebar__row-label">
              <span className="status-dot status-dot--offline" aria-hidden="true" />
              Loopback only
            </span>
          </div>
          <p className="sidebar__hint">
            The collector runs on {dashboardHost}. Nothing leaves this machine.
          </p>
        </div>

        <div className="sidebar__footer">
          <div className="sidebar__footer-row">
            <span>Next.js · Drizzle · SQLite</span>
            <a
              className="sidebar__footer-link"
              href={dashboardUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open the StackNext dashboard"
              title="Open the StackNext dashboard"
            >
              <Icon name="external" size={14} />
            </a>
          </div>
        </div>
      </aside>

      {navOpen && (
        <button
          type="button"
          className="sidebar-scrim"
          onClick={closeNav}
          aria-label="Close navigation"
        />
      )}

      <div className="main">
        <header className="topbar">
          <button
            ref={menuButtonRef}
            type="button"
            className="button button--ghost button--icon button--compact topbar__menu"
            onClick={openNav}
            aria-label="Open navigation"
            aria-expanded={navOpen}
            aria-controls="app-sidebar"
          >
            <Icon name="menu" size={16} />
          </button>
          <div className="topbar__breadcrumb">
            <Link className="topbar__project" href="/">
              StackNext Example
            </Link>
            <Icon name="chevron-right" size={14} className="topbar__separator" />
            <span className="topbar__title">{pageTitle(pathname)}</span>
          </div>
          <div className="topbar__actions">
            <a
              className="button button--secondary button--small topbar__dashboard"
              href={dashboardUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open StackNext
              <Icon name="external" size={12} />
            </a>
            <button
              type="button"
              className="button button--ghost button--icon button--compact"
              onClick={toggleTheme}
              title="Toggle color theme"
              aria-label="Toggle color theme"
            >
              <Icon name="sun" size={15} className="theme-icon theme-icon--light" />
              <Icon name="moon" size={15} className="theme-icon theme-icon--dark" />
            </button>
          </div>
        </header>
        <main className="content" id="main-content">
          {children}
        </main>
      </div>
    </div>
  )
}
