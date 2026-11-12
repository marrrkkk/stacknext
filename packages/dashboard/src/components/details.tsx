import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { Icon } from './Icon'
import {
  CopyButton,
  EmptyState,
  JsonView,
  SearchInput,
  cx,
  type Tone,
} from './ui'
import {
  formatAbsolute,
  formatDuration,
  formatNumber,
  formatRelative,
} from '../format'
import { compactSql, prettySql } from '../sql'

export function RefreshButton({
  onClick,
  loading,
  label = 'Refresh',
}: {
  onClick: () => void
  loading?: boolean
  label?: string
}): React.ReactElement {
  return (
    <button
      type="button"
      className="button button--secondary"
      onClick={onClick}
      disabled={loading}
      aria-busy={loading || undefined}
      title={loading ? 'Refreshing…' : label}
    >
      <Icon
        name="refresh"
        size={15}
        className={loading ? 'icon-button__spin' : undefined}
      />
      <span aria-live="polite">{loading ? 'Refreshing…' : label}</span>
    </button>
  )
}

export function RelativeTime({
  timestamp,
  fallback = '—',
}: {
  timestamp: number | null | undefined
  fallback?: string
}): React.ReactElement {
  if (!timestamp) {
    return (
      <span className="muted" title="No timestamp was stored for this value.">
        {fallback}
      </span>
    )
  }
  const absolute = formatAbsolute(timestamp)
  return (
    <time dateTime={new Date(timestamp).toISOString()} title={absolute}>
      <span aria-hidden="true">{formatRelative(timestamp)}</span>
      <span className="sr-only">{absolute}</span>
    </time>
  )
}

export function DurationValue({
  ms,
  emptyLabel = 'unmeasured',
  emptyTitle = 'The adapter did not measure this duration. Null is never treated as zero.',
}: {
  ms: number | null | undefined
  emptyLabel?: string
  emptyTitle?: string
}): React.ReactElement {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) {
    return (
      <span className="unmeasured" title={emptyTitle}>
        {emptyLabel}
      </span>
    )
  }
  return <span className="tabular">{formatDuration(ms)}</span>
}

export function Unmeasured({
  label = 'unmeasured',
  title = 'The adapter did not measure this duration. Null is never treated as zero.',
}: {
  label?: string
  title?: string
}): React.ReactElement {
  return (
    <span className="chip chip--muted unmeasured-chip" title={title}>
      <span className="chip__dot" aria-hidden="true" />
      <span className="chip__label">{label}</span>
    </span>
  )
}

/** A read API 404 or retention miss gets a friendly "not in this sample" state. */
export function isMissingRecordError(message: string): boolean {
  return /not found|404|aged out/i.test(message)
}

export function Notice({
  title,
  children,
  tone = 'warn',
  icon = 'errors',
  action,
  code,
}: {
  title: ReactNode
  children?: ReactNode
  tone?: Extract<Tone, 'warn' | 'bad' | 'good' | 'accent' | 'muted'>
  icon?: 'errors' | 'info' | 'shield' | 'database' | 'clock' | 'traces' | 'layers'
  action?: ReactNode
  code?: string
}): React.ReactElement {
  return (
    <div className={cx('notice', `notice--${tone}`)} role="note">
      <Icon name={icon} size={16} className="notice__icon" />
      <div className="notice__body">
        <div className="notice__title">
          {title}
          {code && <code className="notice__code">{code}</code>}
        </div>
        {children && <div className="notice__text">{children}</div>}
      </div>
      {action && <div className="notice__action">{action}</div>}
    </div>
  )
}

/**
 * Collapsible card with a remembered open state. Low-value context (commands,
 * environment, limitations, raw attributes) lives here without disappearing.
 */
export function CollapsibleCard({
  title,
  description,
  meta,
  actions,
  children,
  defaultOpen = false,
  storageKey,
  className,
  footer,
}: {
  title: ReactNode
  description?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  storageKey?: string
  className?: string
  footer?: ReactNode
}): React.ReactElement {
  const id = useId()
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined' || !storageKey) return defaultOpen
    try {
      const stored = window.localStorage.getItem(`stacknext-details:${storageKey}`)
      return stored === null ? defaultOpen : stored === '1'
    } catch {
      return defaultOpen
    }
  })
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(`stacknext-details:${storageKey}`, open ? '1' : '0')
    } catch {
      // Local state is optional; keep the disclosure usable without storage.
    }
  }, [open, storageKey])

  return (
    <section className={cx('card', 'collapsible', className)}>
      <header className="card__header collapsible__header">
        <button
          type="button"
          className="collapsible__trigger"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="collapsible__chevron" aria-hidden="true">
            <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
          </span>
          <span className="collapsible__heading">
            <span className="card__title-row">
              <span className="card__title">{title}</span>
              {meta && <span className="card__meta">{meta}</span>}
            </span>
            {description && <span className="card__subtitle">{description}</span>}
          </span>
        </button>
        {actions && <div className="card__actions">{actions}</div>}
      </header>
      {open && (
        <div className="card__body" id={id}>
          {children}
        </div>
      )}
      {open && footer && <footer className="card__footer">{footer}</footer>}
    </section>
  )
}

export interface DetailsTab<T extends string> {
  key: T
  label: string
  count?: number
}

export function DetailsTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: Array<DetailsTab<T>>
  value: T
  onChange: (value: T) => void
  label: string
}): React.ReactElement {
  const onKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    const offset =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (offset === 0) return
    event.preventDefault()
    const next = tabs[(index + offset + tabs.length) % tabs.length]
    if (next) {
      const tablist = event.currentTarget.closest('[role="tablist"]')
      tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[(index + offset + tabs.length) % tabs.length]?.focus()
      onChange(next.key)
    }
  }
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          type="button"
          key={tab.key}
          role="tab"
          aria-selected={value === tab.key}
          tabIndex={value === tab.key ? 0 : -1}
          className={cx('tab', value === tab.key && 'tab--active')}
          onClick={() => onChange(tab.key)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="tab__count">{formatNumber(tab.count)}</span>
          )}
        </button>
      ))}
    </div>
  )
}

/** URL-backed tab/row selection that survives reloads and back/forward. */
export function useUrlParam(
  name: string,
  fallback: string,
): [string, (value: string, options?: { push?: boolean }) => void] {
  const read = useCallback((): string => {
    if (typeof window === 'undefined') return fallback
    return new URLSearchParams(window.location.search).get(name) ?? fallback
  }, [fallback, name])
  const [value, setValue] = useState(read)

  useEffect(() => {
    const onPopState = (): void => setValue(read())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [read])

  const update = useCallback(
    (next: string, options?: { push?: boolean }): void => {
      setValue(next)
      if (typeof window === 'undefined') return
      const url = new URL(window.location.href)
      if (next === '' || next === fallback) url.searchParams.delete(name)
      else url.searchParams.set(name, next)
      const target = `${url.pathname}${url.search}${url.hash}`
      if (target === `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        return
      }
      if (options?.push) window.history.pushState({}, '', target)
      else window.history.replaceState({}, '', target)
    },
    [fallback, name],
  )

  return [value, update]
}

export function Meter({
  value,
  max,
  threshold,
  label,
  valueLabel,
}: {
  value: number
  max: number
  threshold?: number | null
  label: string
  valueLabel: string
}): React.ReactElement {
  const scale = Math.max(1, max, threshold ?? 0)
  const percent = Math.min(100, (value / scale) * 100)
  const thresholdPercent =
    threshold === null || threshold === undefined
      ? null
      : Math.min(100, (threshold / scale) * 100)
  return (
    <div className="meter" role="img" aria-label={`${label}: ${valueLabel}`}>
      <div className="meter__track">
        <span className="meter__fill" style={{ width: `${percent}%` }} />
        {thresholdPercent !== null && (
          <span
            className="meter__threshold"
            style={{ left: `${thresholdPercent}%` }}
            title={`Threshold ${formatNumber(threshold ?? 0)}`}
          />
        )}
      </div>
      <div className="meter__labels">
        <span>{label}</span>
        <span className="tabular">{valueLabel}</span>
      </div>
    </div>
  )
}

export function SqlBlock({
  sql,
  caption = 'Literals and bind values are removed.',
  copyLabel = 'Copy SQL',
}: {
  sql: string
  caption?: ReactNode
  copyLabel?: string
}): React.ReactElement {
  const [mode, setMode] = useState<'formatted' | 'compact'>('formatted')
  const normalized = compactSql(sql)
  const formatted = prettySql(sql)
  return (
    <div className="sql-block">
      <div className="sql-block__toolbar">
        <span className="sql-block__caption">{caption}</span>
        <div className="sql-block__actions">
          <div className="segmented" role="group" aria-label="SQL display mode">
            <button
              type="button"
              className={cx('segmented__button', mode === 'formatted' && 'is-active')}
              aria-pressed={mode === 'formatted'}
              onClick={() => setMode('formatted')}
            >
              Formatted
            </button>
            <button
              type="button"
              className={cx('segmented__button', mode === 'compact' && 'is-active')}
              aria-pressed={mode === 'compact'}
              onClick={() => setMode('compact')}
            >
              Compact
            </button>
          </div>
          <CopyButton
            value={normalized}
            label={copyLabel}
            small
            className="sql-block__copy"
          />
        </div>
      </div>
      <pre
        className={cx(
          'code-block',
          'sql-block__code',
          mode === 'compact' && 'sql-block__code--compact',
        )}
      >
        {mode === 'formatted' ? formatted : normalized}
      </pre>
    </div>
  )
}

export function StackTrace({
  stack,
  emptyTitle = 'No stack available',
  emptyDescription = 'The error was reported without a stack trace.',
}: {
  stack: string | null | undefined
  emptyTitle?: string
  emptyDescription?: string
}): React.ReactElement {
  const [search, setSearch] = useState('')
  const [appOnly, setAppOnly] = useState(false)
  const [wrap, setWrap] = useState(false)
  const lines = useMemo(() => parseStackFrames(stack ?? ''), [stack])
  const query = search.trim().toLowerCase()
  const visible = useMemo(
    () =>
      lines.filter((line) => {
        if (appOnly && !isAppFrame(line)) return false
        if (query && !line.toLowerCase().includes(query)) return false
        return true
      }),
    [appOnly, lines, query],
  )

  if (!stack) {
    return (
      <EmptyState
        compact
        icon="code"
        title={emptyTitle}
        description={emptyDescription}
      />
    )
  }

  return (
    <div className="stack-trace">
      <div className="stack-toolbar">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filter frames…"
          label="Filter stack frames"
        />
        <button
          type="button"
          className="button button--secondary button--small"
          aria-pressed={appOnly}
          onClick={() => setAppOnly((value) => !value)}
          title="Hide node_modules, Next.js internals and node: internals"
        >
          <Icon name={appOnly ? 'check' : 'code'} size={13} />
          App frames only
        </button>
        <button
          type="button"
          className="button button--secondary button--small"
          aria-pressed={wrap}
          onClick={() => setWrap((value) => !value)}
        >
          {wrap ? 'No wrap' : 'Wrap lines'}
        </button>
        <span className="muted tabular">
          {visible.length} of {lines.length} frames
        </span>
        <CopyButton value={stack} label="Copy stack" small />
      </div>

      {visible.length === 0 ? (
        <p className="muted">
          No frame matches the current filter. Clear the search or turn off
          “App frames only” to see the full stack.
        </p>
      ) : (
        <ol className={cx('stack-frames', wrap && 'stack-frames--wrap')}>
          {visible.map((line, index) => {
            const app = isAppFrame(line)
            return (
              <li
                key={`${index}:${line}`}
                className={cx('stack-frame', app && 'stack-frame--app')}
              >
                <span className="stack-frame__index" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="stack-frame__text">
                  {query ? highlight(line, search.trim()) : line}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      <details className="disclosure stack-raw">
        <summary>Verbatim redacted stack</summary>
        <pre className="code-block code-block--scroll">{stack}</pre>
      </details>
    </div>
  )
}

/** Split a server stack into frame lines without discarding the error header. */
export function parseStackFrames(stack: string): string[] {
  return stack
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
}

/**
 * A frame is "app" when it is not a dependency or runtime internal. This is a
 * display filter only; the original stack stays available verbatim.
 */
export function isAppFrame(line: string): boolean {
  const value = line.trim()
  if (!value) return false
  if (/^at\s/.test(value)) {
    if (value.includes('node_modules')) return false
    if (value.includes('node:internal')) return false
    if (value.includes('next/dist')) return false
    if (value.includes('webpack/')) return false
    return true
  }
  return !value.includes('node_modules') && !value.includes('node:internal')
}

function highlight(value: string, query: string): ReactNode {
  if (!query) return value
  const lower = value.toLowerCase()
  const needle = query.toLowerCase()
  const parts: ReactNode[] = []
  let cursor = 0
  let index = lower.indexOf(needle)
  while (index >= 0) {
    if (index > cursor) parts.push(value.slice(cursor, index))
    parts.push(
      <mark key={`${index}:${parts.length}`}>
        {value.slice(index, index + query.length)}
      </mark>,
    )
    cursor = index + query.length
    index = lower.indexOf(needle, cursor)
  }
  if (cursor < value.length) parts.push(value.slice(cursor))
  return parts.length > 0 ? parts : value
}

export function RawJsonCard({
  title,
  description,
  value,
  filename,
  maxHeight = 640,
  actions,
}: {
  title: string
  description?: ReactNode
  value: unknown
  filename: string
  maxHeight?: number
  actions?: ReactNode
}): React.ReactElement {
  const json = JSON.stringify(value, null, 2)
  const download = (): void => {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  return (
    <section className="card">
      <header className="card__header">
        <div className="card__heading">
          <h2 className="card__title">{title}</h2>
          {description && <p className="card__subtitle">{description}</p>}
        </div>
        <div className="card__actions">
          {actions}
          <CopyButton value={json} label="Copy JSON" small />
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={download}
          >
            <Icon name="download" size={14} />
            Download
          </button>
        </div>
      </header>
      <div className="card__body">
        <JsonView value={value} maxHeight={maxHeight} />
      </div>
    </section>
  )
}
