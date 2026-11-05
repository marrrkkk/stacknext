import {
  useEffect,
  useId,
  useState,
  type ReactNode,
} from 'react'
import { Icon } from './Icon'
import { Badge, CopyButton, PageHeader } from './ui'
import { formatAbsolute, formatRelative } from '../format'

export function SettingsPageShell({
  eyebrow,
  title,
  description,
  actions,
  stats,
  rail,
  railWhenNarrow = 'start',
  children,
}: {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  stats?: ReactNode
  rail?: ReactNode
  railWhenNarrow?: 'start' | 'end'
  children: ReactNode
}): React.ReactElement {
  return (
    <div
      className={
        railWhenNarrow === 'end'
          ? 'settings-shell settings-shell--rail-end'
          : 'settings-shell'
      }
    >
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={actions}
      />
      {stats && <div className="settings-shell__stats">{stats}</div>}
      <div className="settings-shell__body">
        {railWhenNarrow !== 'end' && rail && (
          <aside className="settings-shell__rail" aria-label="Page context">
            {rail}
          </aside>
        )}
        <div className="settings-shell__main">{children}</div>
        {railWhenNarrow === 'end' && rail && (
          <aside className="settings-shell__rail" aria-label="Page context">
            {rail}
          </aside>
        )}
      </div>
    </div>
  )
}

export function SettingsGroup({
  label,
  children,
}: {
  label: string
  children: ReactNode
}): React.ReactElement {
  return (
    <section className="settings-group-block" aria-label={label}>
      <p className="settings-group-block__label">{label}</p>
      {children}
    </section>
  )
}

export function SourceChip({ children }: { children: ReactNode }): React.ReactElement {
  return <Badge tone="muted">{children}</Badge>
}

export function SettingsSection({
  id,
  title,
  description,
  source,
  action,
  children,
  className,
}: {
  id: string
  title: string
  description: string
  source?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}): React.ReactElement {
  const titleId = useId()
  return (
    <section
      id={id}
      className={className ? `settings-section ${className}` : 'settings-section'}
      aria-labelledby={titleId}
    >
      <div className="settings-section__head">
        <div className="settings-section__heading">
          <h2 className="settings-section__title" id={titleId}>
            {title}
          </h2>
          <p className="settings-section__subtitle">{description}</p>
        </div>
        {(source || action) && (
          <div className="settings-section__meta">
            {source && <SourceChip>{source}</SourceChip>}
            {action}
          </div>
        )}
      </div>
      {children}
    </section>
  )
}

export function CodeBlock({
  label,
  code,
  children,
  copyLabel = 'Copy code',
  className,
}: {
  label: string
  code: string
  children?: ReactNode
  copyLabel?: string
  className?: string
}): React.ReactElement {
  return (
    <div className={className ? `code-panel ${className}` : 'code-panel'}>
      <div className="code-panel__header">
        <span className="code-panel__label">{label}</span>
        <CopyButton value={code} label={copyLabel} small />
      </div>
      <pre className="code-block code-panel__code" tabIndex={0}>
        {children ?? code}
      </pre>
    </div>
  )
}

export function CopyText({
  value,
  children,
  className,
  label,
}: {
  value: string
  children?: ReactNode
  className?: string
  label?: string
}): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      // Clipboard permission can fail; the title keeps the value visible.
    }
  }
  return (
    <button
      type="button"
      className={className ? `copy-text ${className}` : 'copy-text'}
      onClick={() => void copy()}
      title={copied ? 'Copied' : `${value} — click to copy`}
      aria-label={`${label ?? 'Copy value'}: ${value}`}
    >
      <span className="copy-text__value">{children ?? value}</span>
      <Icon
        name={copied ? 'check' : 'copy'}
        size={12}
        className="copy-text__icon"
      />
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </button>
  )
}

export interface CheckItem {
  tone: 'good' | 'warn'
  text: ReactNode
}

export function CheckList({
  items,
  label,
}: {
  items: CheckItem[]
  label?: string
}): React.ReactElement {
  return (
    <ul className="check-list" aria-label={label}>
      {items.map((item, index) => (
        <li
          key={index}
          className={`check-list__item check-list__item--${item.tone}`}
        >
          {item.text}
        </li>
      ))}
    </ul>
  )
}

export function CheckGroup({
  title,
  tone,
  children,
}: {
  title: string
  tone: 'good' | 'warn'
  children: ReactNode
}): React.ReactElement {
  return (
    <section className="check-group">
      <h3 className="check-group__title">
        <span
          className={`check-list__dot check-list__dot--${tone}`}
          aria-hidden="true"
        />
        {title}
      </h3>
      {children}
    </section>
  )
}

export function SettingsDisclosure({
  title,
  storageKey,
  defaultOpen = false,
  children,
}: {
  title: string
  storageKey: string
  defaultOpen?: boolean
  children: ReactNode
}): React.ReactElement {
  const id = useId()
  const [open, setOpen] = useState(() => {
    try {
      const stored = window.localStorage.getItem(`stacknext-details:${storageKey}`)
      return stored === null ? defaultOpen : stored === '1'
    } catch {
      return defaultOpen
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(
        `stacknext-details:${storageKey}`,
        open ? '1' : '0',
      )
    } catch {
      // Remembering disclosure state is optional.
    }
  }, [open, storageKey])

  return (
    <div className="settings-disclosure">
      <button
        type="button"
        className="settings-disclosure__trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
        {title}
      </button>
      {open && (
        <div className="settings-disclosure__body" id={id}>
          {children}
        </div>
      )}
    </div>
  )
}

export interface RailNavItem {
  id: string
  label: string
}

export interface RailNavGroup {
  label: string
  items: RailNavItem[]
}

function useActiveSection(ids: string[]): [string, (id: string) => void] {
  const [active, setActive] = useState(ids[0] ?? '')
  const key = ids.join('|')

  useEffect(() => {
    if (ids.length === 0) return
    const root = document.querySelector<HTMLElement>('.content')
    if (!root || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              left.boundingClientRect.top - right.boundingClientRect.top,
          )
        const first = visible[0]?.target.id
        if (first) setActive(first)
      },
      {
        root,
        rootMargin: '-8% 0px -72% 0px',
        threshold: 0,
      },
    )
    for (const id of ids) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
    // The key captures the ordered id list without re-observing each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return [active, setActive]
}

export function SettingsRailNav({
  groups,
}: {
  groups: RailNavGroup[]
}): React.ReactElement {
  const ids = groups.flatMap((group) => group.items.map((item) => item.id))
  const [active, setActive] = useActiveSection(ids)
  return (
    <nav className="settings-nav" aria-label="On this page">
      <p className="settings-nav__title">On this page</p>
      {groups.map((group) => (
        <div className="settings-nav__group" key={group.label}>
          <p className="settings-nav__group-label">{group.label}</p>
          <ul className="settings-nav__list">
            {group.items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="settings-nav__link"
                  aria-current={active === item.id ? 'location' : undefined}
                  onClick={() => setActive(item.id)}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function SourceLegend(): React.ReactElement {
  return (
    <div className="settings-source-legend">
      <p className="settings-source-legend__title">Sources</p>
      <p className="settings-source-legend__text">
        A chip on a section shows where its values come from.
      </p>
      <div className="settings-source-legend__chips">
        <SourceChip>Stored in this browser</SourceChip>
        <SourceChip>From stacknext.config.json</SourceChip>
        <SourceChip>Live from collector</SourceChip>
      </div>
    </div>
  )
}

export function RelativeTime({
  timestamp,
}: {
  timestamp: number | null | undefined
}): React.ReactElement {
  return (
    <span title={formatAbsolute(timestamp)}>{formatRelative(timestamp)}</span>
  )
}
