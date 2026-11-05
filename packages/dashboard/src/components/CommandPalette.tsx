import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import type { Theme } from '../hooks'
import { Icon, type IconName } from './Icon'
import { Kbd, shortcutLabel } from './ui'

interface CommandItem {
  id: string
  label: string
  hint?: string
  keywords?: string
  icon: IconName
  group: string
  shortcut?: string
  run: () => void
}

interface CommandGroup {
  label: string
  items: CommandItem[]
}

export interface CommandPaletteProps {
  open: boolean
  projectName: string
  theme: Theme
  returnFocusRef: RefObject<HTMLElement | null>
  onClose: () => void
  onNavigate: (path: string) => void
  onCycleTheme: () => void
}

export function CommandPalette({
  open,
  projectName,
  theme,
  returnFocusRef,
  onClose,
  onNavigate,
  onCycleTheme,
}: CommandPaletteProps): ReactElement | null {
  if (!open) return null

  return (
    <CommandDialog
      projectName={projectName}
      theme={theme}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
      onNavigate={onNavigate}
      onCycleTheme={onCycleTheme}
    />
  )
}

function canRestoreFocus(element: HTMLElement | null): element is HTMLElement {
  if (!element || element === document.body || !element.isConnected) return false
  if (element.closest('[inert]')) return false
  if (
    element.closest('#app-sidebar') &&
    window.matchMedia('(max-width: 900px)').matches &&
    !document.querySelector('.app--sidebar-open')
  ) {
    return false
  }
  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })
  }
  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

function CommandDialog({
  projectName,
  theme,
  returnFocusRef,
  onClose,
  onNavigate,
  onCycleTheme,
}: Omit<CommandPaletteProps, 'open'>): ReactElement {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [previousFocus] = useState<HTMLElement | null>(
    () => document.activeElement as HTMLElement | null,
  )
  const [initialPath] = useState(
    () => `${window.location.pathname}${window.location.search}`,
  )
  const listRef = useRef<HTMLDivElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  const groups = useMemo<CommandGroup[]>(() => {
    const go = (path: string) => () => {
      onNavigate(path)
      onClose()
    }
    return [
      {
        label: 'Go to',
        items: [
          {
            id: 'nav-overview',
            label: 'Overview',
            hint: 'Health, coverage and recent activity',
            keywords: 'home dashboard summary',
            icon: 'overview',
            group: 'Go to',
            run: go('/'),
          },
          {
            id: 'nav-requests',
            label: 'Requests',
            hint: 'HTTP requests only',
            keywords: 'http routes slow errors',
            icon: 'requests',
            group: 'Go to',
            run: go('/traces?view=requests'),
          },
          {
            id: 'nav-traces',
            label: 'Traces',
            hint: 'Browse every captured trace',
            keywords: 'spans timeline services',
            icon: 'traces',
            group: 'Go to',
            run: go('/traces'),
          },
          {
            id: 'nav-database',
            label: 'Database',
            hint: 'Redacted SQL and query timings',
            keywords: 'sql drizzle prisma queries',
            icon: 'database',
            group: 'Go to',
            run: go('/database'),
          },
          {
            id: 'nav-snapshots',
            label: 'Snapshots',
            hint: 'Frozen copies of the current sample',
            keywords: 'saved sample freeze retention export',
            icon: 'layers',
            group: 'Go to',
            run: go('/snapshots'),
          },
          {
            id: 'nav-errors',
            label: 'Errors',
            hint: 'Server errors grouped by fingerprint',
            keywords: 'exceptions stack trace',
            icon: 'errors',
            group: 'Go to',
            run: go('/errors'),
          },
          {
            id: 'nav-diagnostics',
            label: 'Diagnostics',
            hint: 'Deterministic evidence-backed findings',
            keywords: 'n+1 slow findings rules',
            icon: 'pulse',
            group: 'Go to',
            run: go('/diagnostics'),
          },
          {
            id: 'nav-runs',
            label: 'Test runs',
            hint: 'Playwright-linked runtime captures',
            keywords: 'playwright capture regression',
            icon: 'terminal',
            group: 'Go to',
            run: go('/runs'),
          },
          {
            id: 'nav-baselines',
            label: 'Baselines',
            hint: 'Saved reference runs',
            keywords: 'reference regression testing',
            icon: 'flag',
            group: 'Go to',
            run: go('/baselines'),
          },
          {
            id: 'nav-comparisons',
            label: 'Comparisons',
            hint: 'Baseline versus candidate results',
            keywords: 'regressed improved inconclusive',
            icon: 'compare',
            group: 'Go to',
            run: go('/comparisons'),
          },
          {
            id: 'nav-settings',
            label: 'Settings',
            hint: 'Collector, snapshots, adapters and preferences',
            keywords: 'config theme export retention',
            icon: 'settings',
            group: 'Go to',
            run: go('/settings'),
          },
          {
            id: 'nav-mcp',
            label: 'MCP server',
            hint: 'Read-only AI client setup and tool catalog',
            keywords: 'model context protocol tools agent skill',
            icon: 'terminal',
            group: 'Go to',
            run: go('/mcp'),
          },
        ],
      },
      {
        label: 'Explore',
        items: [
          {
            id: 'filter-slow',
            label: 'Slow requests',
            hint: 'Requests above the configured threshold',
            keywords: 'latency performance slow',
            icon: 'clock',
            group: 'Explore',
            run: go('/traces?view=requests&slow=1'),
          },
          {
            id: 'filter-5xx',
            label: 'Failed requests',
            hint: 'Requests that returned a 5xx status',
            keywords: 'server error 500 failed',
            icon: 'errors',
            group: 'Explore',
            run: go('/traces?view=requests&status=5xx'),
          },
          {
            id: 'filter-4xx',
            label: 'Client errors',
            hint: 'Requests that returned a 4xx status',
            keywords: 'not found 404 client',
            icon: 'pulse',
            group: 'Explore',
            run: go('/traces?view=requests&status=4xx'),
          },
          {
            id: 'filter-slowest',
            label: 'Slowest requests',
            hint: 'Sort requests by duration',
            keywords: 'latency sort performance',
            icon: 'bolt',
            group: 'Explore',
            run: go('/traces?view=requests&sort=slowest'),
          },
        ],
      },
      {
        label: 'Actions',
        items: [
          {
            id: 'action-theme',
            label: `Switch to ${theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark'} theme`,
            hint: `Currently ${theme}`,
            keywords: 'appearance dark light system',
            icon: theme === 'dark' ? 'sun' : theme === 'light' ? 'monitor' : 'moon',
            group: 'Actions',
            run: () => {
              onCycleTheme()
              onClose()
            },
          },
          {
            id: 'action-copy',
            label: 'Copy current URL',
            hint: 'Copy the address of the current page',
            keywords: 'link clipboard share',
            icon: 'copy',
            group: 'Actions',
            run: () => {
              void navigator.clipboard.writeText(window.location.href).catch(() => undefined)
              onClose()
            },
          },
          {
            id: 'action-docs',
            label: 'Open StackNext docs',
            hint: 'Project documentation on GitHub',
            keywords: 'help readme github',
            icon: 'external',
            group: 'Actions',
            run: () => {
              window.open('https://github.com/marrrkkk/stacknext', '_blank', 'noreferrer')
              onClose()
            },
          },
        ],
      },
    ]
  }, [onClose, onNavigate, onCycleTheme, theme])

  const filtered = useMemo<CommandGroup[]>(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return groups
    const rank = (item: CommandItem, groupLabel: string): number => {
      const label = item.label.toLowerCase()
      if (label === needle) return 0
      if (label.startsWith(needle)) return 1
      if (label.includes(needle)) return 2
      if (item.hint?.toLowerCase().includes(needle)) return 3
      if (item.keywords?.toLowerCase().includes(needle)) return 4
      if (groupLabel.toLowerCase().includes(needle)) return 5
      return Number.POSITIVE_INFINITY
    }
    return groups
      .map((group) => {
        const scored = group.items
          .map((item) => ({ item, score: rank(item, group.label) }))
          .filter((entry) => Number.isFinite(entry.score))
          .sort((a, b) => a.score - b.score)
        return {
          group: { ...group, items: scored.map((entry) => entry.item) },
          score: scored[0]?.score ?? Number.POSITIVE_INFINITY,
        }
      })
      .filter((entry) => entry.group.items.length > 0)
      .sort((a, b) => a.score - b.score)
      .map((entry) => entry.group)
  }, [groups, query])

  const flattened = useMemo(() => filtered.flatMap((group) => group.items), [filtered])

  useEffect(() => {
    const fallbackFocus = returnFocusRef.current
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => {
      window.clearTimeout(timer)
      const currentPath = `${window.location.pathname}${window.location.search}`
      if (currentPath !== initialPath) {
        document.getElementById('main-content')?.focus()
        return
      }
      if (canRestoreFocus(previousFocus)) {
        previousFocus.focus()
        return
      }
      if (canRestoreFocus(fallbackFocus)) {
        fallbackFocus.focus()
        return
      }
      document.getElementById('main-content')?.focus()
    }
  }, [initialPath, previousFocus, returnFocusRef])

  useEffect(() => {
    const selected = flattened[activeIndex]
    if (!selected) return
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-command-id="${selected.id}"]`,
    )
    node?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, flattened])

  const choose = (item: CommandItem): void => {
    item.run()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % Math.max(1, flattened.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(
        (index) => (index - 1 + Math.max(1, flattened.length)) % Math.max(1, flattened.length),
      )
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = flattened[activeIndex]
      if (item) choose(item)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(Math.max(0, flattened.length - 1))
    }
  }

  const active = flattened[activeIndex]
  let itemIndex = -1

  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((node) => node.tabIndex >= 0)
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return createPortal(
    <div
      className="command-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="command-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        ref={dialogRef}
        onKeyDown={onDialogKeyDown}
      >
        <div className="command-search">
          <Icon name="search" size={16} className="command-search__icon" />
          <input
            ref={inputRef}
            className="command-search__input"
            type="text"
            role="combobox"
            aria-label="Search views and actions"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={active ? `command-option-${active.id}` : undefined}
            placeholder={`Search ${projectName} or jump to a view…`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={onKeyDown}
          />
          <Kbd>{shortcutLabel('K')}</Kbd>
        </div>

        <div className="command-results" id="command-results" role="listbox" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="command-empty">
              <Icon name="search" size={18} />
              <p>No views or actions match “{query}”.</p>
              <span>Try “requests”, “slow”, “theme” or “sidebar”.</span>
            </div>
          ) : (
            filtered.map((group) => (
              <div className="command-group" key={group.label} role="group" aria-label={group.label}>
                <div className="command-group__label">{group.label}</div>
                {group.items.map((item) => {
                  itemIndex += 1
                  const index = itemIndex
                  const selected = index === activeIndex
                  return (
                    <button
                      type="button"
                      key={item.id}
                      id={`command-option-${item.id}`}
                      data-command-id={item.id}
                      role="option"
                      aria-selected={selected}
                      tabIndex={-1}
                      className={selected ? 'command-item command-item--active' : 'command-item'}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(item)}
                    >
                      <span className="command-item__icon">
                        <Icon name={item.icon} size={16} />
                      </span>
                      <span className="command-item__body">
                        <span className="command-item__label">{item.label}</span>
                        {item.hint && <span className="command-item__hint">{item.hint}</span>}
                      </span>
                      {item.shortcut ? (
                        <Kbd>{item.shortcut}</Kbd>
                      ) : (
                        <Icon name="arrow-right" size={14} className="command-item__arrow" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="command-footer">
          <div className="command-footer__hints">
            <span>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> navigate
            </span>
            <span>
              <Kbd>↵</Kbd> open
            </span>
            <span>
              <Kbd>esc</Kbd> close
            </span>
          </div>
          <button type="button" className="command-footer__close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
