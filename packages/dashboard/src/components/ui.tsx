import { useState, type ReactElement, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export type Tone = 'good' | 'warn' | 'bad' | 'muted' | 'accent'

export function Badge({
  children,
  tone = 'muted',
  className,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}): ReactElement {
  return <span className={cx('badge', `badge--${tone}`, className)}>{children}</span>
}

const methodTone: Record<string, string> = {
  GET: 'method--get',
  POST: 'method--post',
  PUT: 'method--put',
  PATCH: 'method--patch',
  DELETE: 'method--delete',
  HEAD: 'method--head',
  OPTIONS: 'method--options',
}

export function MethodBadge({ method }: { method: string | null | undefined }): ReactElement {
  const label = method ?? '—'
  return <span className={cx('method', methodTone[label] ?? 'method--other')}>{label}</span>
}

export function StatusCodeBadge({
  code,
  failed = false,
}: {
  code: number | null | undefined
  failed?: boolean
}): ReactElement {
  const tone: Tone =
    code === null || code === undefined
      ? failed
        ? 'bad'
        : 'muted'
      : code >= 500
        ? 'bad'
        : code >= 400
          ? 'warn'
          : 'good'
  return <Badge tone={tone}>{code ?? (failed ? 'ERR' : '—')}</Badge>
}

export function StatusDot({ status }: { status: 'live' | 'reconnecting' | 'connecting' | 'offline' }): ReactElement {
  return (
    <span className={cx('status-dot', `status-dot--${status}`)} aria-label={status}>
      <span className="status-dot__halo" />
    </span>
  )
}

export function Card({
  children,
  title,
  subtitle,
  actions,
  className,
  padded = true,
}: {
  children: ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
  padded?: boolean
}): ReactElement {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <header className="card__header">
          <div>
            {title && <h2 className="card__title">{title}</h2>}
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      <div className={cx('card__body', !padded && 'card__body--flush')}>{children}</div>
    </section>
  )
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  icon,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'bad'
  icon?: IconName
}): ReactElement {
  return (
    <div className={cx('stat', `stat--${tone}`)}>
      <div className="stat__top">
        <span className="stat__label">{label}</span>
        {icon && (
          <span className="stat__icon">
            <Icon name={icon} size={16} />
          </span>
        )}
      </div>
      <div className="stat__value">{value}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  icon = 'inbox',
  action,
  compact = false,
}: {
  title: string
  description: ReactNode
  icon?: IconName
  action?: ReactNode
  compact?: boolean
}): ReactElement {
  return (
    <div className={cx('empty', compact && 'empty--compact')}>
      <div className="empty__icon">
        <Icon name={icon} size={compact ? 22 : 28} />
      </div>
      <h3 className="empty__title">{title}</h3>
      <div className="empty__description">{description}</div>
      {action && <div className="empty__action">{action}</div>}
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
  compact = false,
}: {
  message: string
  onRetry?: () => void
  compact?: boolean
}): ReactElement {
  return (
    <div className={cx('error-state', compact && 'error-state--compact')}>
      <Icon name="errors" size={22} />
      <div className="error-state__text">
        <strong>Could not load data</strong>
        <span>{message}</span>
      </div>
      {onRetry && (
        <button type="button" className="button button--ghost button--small" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

export function Loading({ rows = 5, label = 'Loading telemetry' }: { rows?: number; label?: string }): ReactElement {
  return (
    <div className="loading" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="loading__row" style={{ width: `${92 - index * 7}%` }} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  )
}

export function Pagination({
  total,
  limit,
  offset,
  onChange,
}: {
  total: number
  limit: number
  offset: number
  onChange: (offset: number) => void
}): React.ReactElement | null {
  if (total <= limit) return null
  const page = Math.floor(offset / limit) + 1
  const pages = Math.max(1, Math.ceil(total / limit))
  return (
    <div className="pagination">
      <span className="pagination__label">
        {offset + 1}–{Math.min(total, offset + limit)} of {total}
      </span>
      <div className="pagination__buttons">
        <button
          type="button"
          className="button button--ghost button--icon"
          onClick={() => onChange(Math.max(0, offset - limit))}
          disabled={offset === 0}
          aria-label="Previous page"
        >
          <Icon name="chevron-left" size={16} />
        </button>
        <span className="pagination__page">
          {page} / {pages}
        </span>
        <button
          type="button"
          className="button button--ghost button--icon"
          onClick={() => onChange(Math.min((pages - 1) * limit, offset + limit))}
          disabled={page >= pages}
          aria-label="Next page"
        >
          <Icon name="chevron-right" size={16} />
        </button>
      </div>
    </div>
  )
}

export function CopyButton({
  value,
  label = 'Copy',
  className,
}: {
  value: string
  label?: string
  className?: string
}): ReactElement {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      // Clipboard permission can fail; select the text instead.
    }
  }
  return (
    <button
      type="button"
      className={cx('button button--ghost button--small', className)}
      onClick={() => void copy()}
    >
      <Icon name={copied ? 'check' : 'copy'} size={14} />
      {copied ? 'Copied' : label}
    </button>
  )
}

export function JsonView({ value, maxHeight }: { value: unknown; maxHeight?: number }): ReactElement {
  return (
    <pre className="json-view" style={maxHeight ? { maxHeight } : undefined}>
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  label = 'Search',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
}): ReactElement {
  return (
    <label className="search">
      <Icon name="search" size={15} />
      <input
        type="search"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button type="button" className="search__clear" onClick={() => onChange('')} aria-label="Clear search">
          <Icon name="close" size={13} />
        </button>
      )}
    </label>
  )
}

export function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  label: string
}): ReactElement {
  return (
    <label className="select">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size={13} />
    </label>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}): ReactElement {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
      {label}
    </label>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}): ReactElement {
  return (
    <div className="page-header">
      <div className="page-header__text">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  )
}

export function KeyValue({
  entries,
}: {
  entries: Array<{ label: string; value: ReactNode }>
}): ReactElement {
  return (
    <dl className="key-values">
      {entries.map((entry) => (
        <div key={entry.label} className="key-values__row">
          <dt>{entry.label}</dt>
          <dd>{entry.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function SectionTitle({
  children,
  count,
  action,
}: {
  children: ReactNode
  count?: number
  action?: ReactNode
}): ReactElement {
  return (
    <div className="section-title">
      <h2>
        {children}
        {count !== undefined && <span className="section-title__count">{count}</span>}
      </h2>
      {action}
    </div>
  )
}
