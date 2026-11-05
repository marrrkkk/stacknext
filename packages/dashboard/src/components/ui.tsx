import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'
import { formatNumber } from '../format'

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export type Tone = 'good' | 'warn' | 'bad' | 'muted' | 'accent'

export type StatusKind =
  | 'observed'
  | 'not-observed'
  | 'unknown'
  | 'unsupported'
  | 'active'
  | 'configured'
  | 'error'
  | 'warning'
  | 'info'
  | 'neutral'

const STATUS_LABEL: Record<StatusKind, string> = {
  observed: 'Observed',
  'not-observed': 'Not observed',
  unknown: 'Unknown',
  unsupported: 'Unsupported',
  active: 'Active',
  configured: 'Configured',
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
  neutral: 'Neutral',
}

/**
 * Shape carries the status as well as colour: check = observed, hollow = not
 * observed, dashed = unknown, slash = unsupported, filled alert shapes for
 * severity. The label is available to assistive tech and on hover.
 */
export function StatusIcon({
  status,
  label,
  size = 14,
  className,
}: {
  status: StatusKind
  label?: string
  size?: number
  className?: string
}): ReactElement {
  const accessibleLabel = label ?? STATUS_LABEL[status]
  let glyph: ReactNode
  switch (status) {
    case 'observed':
      glyph = (
        <>
          <circle cx="8" cy="8" r="6.6" fill="currentColor" />
          <path
            d="m4.9 8.15 2.05 2.05 4.2-4.4"
            fill="none"
            stroke="var(--status-knockout)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )
      break
    case 'not-observed':
      glyph = (
        <circle
          cx="8"
          cy="8"
          r="5.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
      )
      break
    case 'unknown':
      glyph = (
        <circle
          cx="8"
          cy="8"
          r="5.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeDasharray="2.1 2.1"
        />
      )
      break
    case 'unsupported':
      glyph = (
        <>
          <circle
            cx="8"
            cy="8"
            r="5.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M4.5 11.5 11.5 4.5" stroke="currentColor" strokeWidth="1.5" />
        </>
      )
      break
    case 'active':
      glyph = (
        <>
          <circle
            cx="8"
            cy="8"
            r="5.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle cx="8" cy="8" r="2" fill="currentColor" />
        </>
      )
      break
    case 'configured':
      glyph = (
        <>
          <circle
            cx="8"
            cy="8"
            r="5.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M5.8 8h4.4"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </>
      )
      break
    case 'error':
      glyph = (
        <>
          <circle cx="8" cy="8" r="6.6" fill="currentColor" />
          <path
            d="M8 4.3v4.5"
            stroke="var(--status-knockout)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="8" cy="11.6" r="0.9" fill="var(--status-knockout)" />
        </>
      )
      break
    case 'warning':
      glyph = (
        <>
          <path d="M8 1.7 14.8 13.8H1.2L8 1.7Z" fill="currentColor" />
          <path
            d="M8 5.4v4"
            stroke="var(--status-knockout)"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <circle cx="8" cy="11.7" r="0.8" fill="var(--status-knockout)" />
        </>
      )
      break
    case 'info':
      glyph = (
        <>
          <circle cx="8" cy="8" r="6.6" fill="currentColor" />
          <path
            d="M8 7.1v4.6"
            stroke="var(--status-knockout)"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <circle cx="8" cy="4.9" r="0.85" fill="var(--status-knockout)" />
        </>
      )
      break
    default:
      glyph = <circle cx="8" cy="8" r="4.2" fill="currentColor" />
  }

  return (
    <span
      className={cx('status-icon', `status-icon--${status}`, className)}
      role="img"
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        {glyph}
      </svg>
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }): ReactElement {
  return <kbd className="kbd">{children}</kbd>
}

export const MOD_KEY =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    ? '⌘'
    : 'Ctrl'

export function shortcutLabel(key: string): string {
  return MOD_KEY === '⌘' ? `⌘${key}` : `Ctrl ${key}`
}

export interface PageChrome {
  breadcrumb: HTMLElement | null
  projectName: string
}

export const PageChromeContext = createContext<PageChrome>({
  breadcrumb: null,
  projectName: '',
})

export function Badge({
  children,
  tone = 'muted',
  className,
  title,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
  title?: string
}): ReactElement {
  return (
    <span className={cx('chip', `chip--${tone}`, className)} title={title}>
      <span className="chip__dot" aria-hidden="true" />
      <span className="chip__label">{children}</span>
    </span>
  )
}

export function MethodBadge({ method }: { method: string | null | undefined }): ReactElement {
  const label = method ?? '—'
  return <span className="method">{label}</span>
}

export function StatusCodeBadge({
  code,
  failed = false,
}: {
  code: number | null | undefined
  failed?: boolean
}): ReactElement {
  const tone =
    code === null || code === undefined
      ? failed
        ? 'danger'
        : 'muted'
      : code >= 500
        ? 'danger'
        : code >= 400
          ? 'warning'
          : 'muted'
  return (
    <span className={cx('status-code', `status-code--${tone}`)}>
      {code ?? (failed ? 'ERR' : '—')}
    </span>
  )
}

export function StatusDot({
  status,
}: {
  status: 'live' | 'reconnecting' | 'connecting' | 'offline'
}): ReactElement {
  return <span className={cx('status-dot', `status-dot--${status}`)} aria-label={status} />
}

export function Card({
  children,
  title,
  subtitle,
  meta,
  actions,
  footer,
  className,
  bodyClassName,
  padded = true,
}: {
  children: ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  className?: string
  bodyClassName?: string
  padded?: boolean
}): ReactElement {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <header className="card__header">
          <div className="card__heading">
            <div className="card__title-row">
              {title && <h2 className="card__title">{title}</h2>}
              {meta && <span className="card__meta">{meta}</span>}
            </div>
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      <div
        className={cx('card__body', !padded && 'card__body--flush', bodyClassName)}
      >
        {children}
      </div>
      {footer && <footer className="card__footer">{footer}</footer>}
    </section>
  )
}

export function IconButton({
  icon,
  label,
  onClick,
  busy = false,
  disabled = false,
  pressed,
  className,
  iconClassName,
}: {
  icon: IconName
  label: string
  onClick?: () => void
  busy?: boolean
  disabled?: boolean
  pressed?: boolean
  className?: string
  iconClassName?: string
}): ReactElement {
  return (
    <button
      type="button"
      className={cx('icon-button', className)}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-busy={busy || undefined}
      aria-pressed={pressed}
      disabled={disabled}
    >
      <Icon
        name={icon}
        size={14}
        className={cx(busy && 'icon-button__spin', iconClassName)}
      />
    </button>
  )
}

export interface Segment {
  key: string
  label: string
  count: number
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'muted' | 'accent'
}

/**
 * One proportional status bar plus clickable legend counts. Both the bar
 * segments and the legend filter the list below through the same handler.
 */
export function SegmentBar({
  segments,
  activeKey,
  onSelect,
  label,
}: {
  segments: Segment[]
  activeKey: string | null
  onSelect: (key: string | null) => void
  label: string
}): ReactElement {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0)
  const visible = segments.filter((segment) => segment.count > 0)
  return (
    <div className="segment-summary">
      <div className="segment-bar" role="group" aria-label={label}>
        {visible.map((segment) => (
          <button
            type="button"
            key={segment.key}
            className={cx(
              'segment-bar__segment',
              `segment--${segment.tone}`,
              activeKey === segment.key && 'is-active',
            )}
            style={{ flexGrow: segment.count }}
            aria-label={`${segment.count} ${segment.label}`}
            aria-pressed={activeKey === segment.key}
            onClick={() => onSelect(activeKey === segment.key ? null : segment.key)}
          >
            <span className="segment-bar__fill" aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="segment-legend">
        {visible.map((segment) => (
          <button
            type="button"
            key={segment.key}
            className={cx(
              'segment-legend__item',
              activeKey === segment.key && 'is-active',
            )}
            aria-pressed={activeKey === segment.key}
            onClick={() => onSelect(activeKey === segment.key ? null : segment.key)}
          >
            <span
              className={cx('segment-legend__mark', `segment--${segment.tone}`)}
              aria-hidden="true"
            />
            <span className="segment-legend__count">{segment.count}</span>
            <span>{segment.label}</span>
          </button>
        ))}
        <span className="segment-legend__total">of {total}</span>
      </div>
    </div>
  )
}

export interface ListRowProps {
  leading?: ReactNode
  primary: ReactNode
  secondary?: ReactNode
  meta?: ReactNode
  /** Trailing affordance. Pass reserveChevron when no glyph should render. */
  chevron?: ReactNode
  reserveChevron?: boolean
  onClick?: () => void
  ariaLabel?: string
  title?: string
  expanded?: boolean
  className?: string
  /** Clamp the secondary line to one or two lines. */
  secondaryLines?: 1 | 2
}

export function ListRow({
  leading,
  primary,
  secondary,
  meta,
  chevron,
  reserveChevron = false,
  onClick,
  ariaLabel,
  title,
  expanded,
  className,
  secondaryLines = 1,
}: ListRowProps): ReactElement {
  return (
    <button
      type="button"
      className={cx(
        'list-row',
        secondaryLines === 2 && 'list-row--two-line',
        (chevron != null || reserveChevron) && 'list-row--has-chevron',
        className,
      )}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={expanded}
      title={title}
    >
      {leading && <span className="list-row__leading">{leading}</span>}
      <span className="list-row__text">
        <span className="list-row__primary">{primary}</span>
        {secondary && (
          <span
            className={cx(
              'list-row__secondary',
              secondaryLines === 2 && 'list-row__secondary--clamp-2',
            )}
          >
            {secondary}
          </span>
        )}
      </span>
      {meta && <span className="list-row__meta">{meta}</span>}
      {(chevron || reserveChevron) && (
        <span className="list-row__chevron" aria-hidden="true">
          {chevron}
        </span>
      )}
    </button>
  )
}

export function Sparkline({
  values,
  tone = 'accent',
  height = 28,
  label = 'Recent trend',
  barLabels,
}: {
  values: number[]
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'info'
  height?: number
  label?: string
  barLabels?: Array<string | undefined>
}): ReactElement {
  const finite = values.filter((value) => Number.isFinite(value))
  const max = Math.max(1, ...finite.map((value) => Math.abs(value)))
  const hasPositive = values.some((value) => Number.isFinite(value) && value > 0)
  return (
    <span
      className={cx('sparkline', `sparkline--${tone}`)}
      style={{ height }}
      role="img"
      aria-label={label}
    >
      {hasPositive ? (
        values.map((value, index) => (
          <span
            key={index}
            className={cx('sparkline__bar', value <= 0 && 'sparkline__bar--zero')}
            style={{
              height: value > 0 ? `${Math.max(8, (value / max) * 100)}%` : '2px',
            }}
            title={barLabels?.[index]}
          />
        ))
      ) : (
        <span
          className="sparkline__bar sparkline__bar--zero"
          style={{ height: '2px' }}
          title={barLabels?.[0]}
        />
      )}
    </span>
  )
}

export function InfoHint({
  label,
  children,
}: {
  label: string
  children: ReactNode
}): ReactElement {
  return (
    <span className="info-hint" title={label} aria-label={label} role="img">
      <Icon name="info" size={12} />
      <span className="sr-only">{children}</span>
    </span>
  )
}

export function KpiTile({
  label,
  value,
  unit,
  context,
  onClick,
  sparkline,
  sparklineTone = 'accent',
  sparklineLabels,
  status,
  ariaLabel,
  className,
}: {
  label: string
  value: string
  unit?: string | null
  context: ReactNode
  onClick: () => void
  sparkline?: number[]
  sparklineTone?: 'accent' | 'success' | 'warning' | 'danger' | 'info'
  sparklineLabels?: Array<string | undefined>
  status?: { kind: StatusKind; label: string }
  ariaLabel: string
  className?: string
}): ReactElement {
  return (
    <button
      type="button"
      className={cx('kpi', className)}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <span className="kpi__label-row">
        <span className="kpi__label">{label}</span>
        {status && <StatusIcon status={status.kind} label={status.label} size={14} />}
      </span>
      <span className="kpi__value-row">
        <span className="kpi__value">{value}</span>
        {unit && <span className="kpi__unit">{unit}</span>}
      </span>
      <span className="kpi__context">{context}</span>
      {sparkline && sparkline.length > 0 ? (
        <Sparkline
          values={sparkline}
          tone={sparklineTone}
          height={28}
          barLabels={sparklineLabels}
          label={`${label} over the latest ${sparkline.length} requests`}
        />
      ) : (
        <span className="sparkline sparkline--empty" aria-hidden="true" />
      )}
    </button>
  )
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  title,
  onClick,
  href,
  ariaLabel,
  className,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'bad'
  icon?: IconName
  title?: string
  onClick?: () => void
  href?: string
  ariaLabel?: string
  className?: string
}): ReactElement {
  const content = (
    <>
      <div className="stat__label">
        <span className="stat__label-text">{label}</span>
        {tone !== 'default' && (
          <span className={cx('stat__dot', `stat__dot--${tone}`)} aria-hidden="true" />
        )}
      </div>
      <div className="stat__value">{value}</div>
      {hint && (
        <div
          className="stat__hint"
          title={typeof hint === 'string' ? hint : undefined}
        >
          {hint}
        </div>
      )}
    </>
  )
  if (href) {
    return (
      <a
        className={cx('card stat stat--button', className)}
        title={title}
        href={href}
        aria-label={ariaLabel ?? `${label}: ${String(value)}`}
      >
        {content}
      </a>
    )
  }
  if (onClick) {
    return (
      <button
        type="button"
        className={cx('card stat stat--button', className)}
        title={title}
        onClick={onClick}
        aria-label={ariaLabel ?? `${label}: ${String(value)}`}
      >
        {content}
      </button>
    )
  }
  return (
    <div className={cx('card stat', className)} title={title}>
      {content}
    </div>
  )
}

export function StatStrip({
  children,
  five = false,
  three = false,
}: {
  children: ReactNode
  five?: boolean
  three?: boolean
}): ReactElement {
  return (
    <div
      className={cx(
        'stat-strip',
        five && 'stat-strip--five',
        three && 'stat-strip--three',
      )}
    >
      {children}
    </div>
  )
}

export function StatGridSkeleton({
  count = 4,
  five = false,
}: {
  count?: number
  five?: boolean
}): ReactElement {
  return (
    <div
      className={cx('stat-strip', five && 'stat-strip--five')}
      role="status"
      aria-label="Loading summary"
    >
      {Array.from({ length: count }, (_, index) => (
        <div className="card stat stat--skeleton" key={index} aria-hidden="true">
          <span className="skeleton stat-skeleton__label" />
          <span className="skeleton stat-skeleton__value" />
          <span className="skeleton stat-skeleton__hint" />
        </div>
      ))}
      <span className="sr-only">Loading summary</span>
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
  description?: ReactNode
  icon?: IconName
  action?: ReactNode
  compact?: boolean
}): ReactElement {
  return (
    <div className={cx('empty', compact && 'empty--compact')}>
      <Icon name={icon} size={20} className="empty__icon" />
      <h3 className="empty__title">{title}</h3>
      {description && <div className="empty__description">{description}</div>}
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
    <div className={cx('error-state', compact && 'error-state--compact')} role="alert">
      <Icon name="errors" size={16} />
      <div className="error-state__text">
        <strong>Could not load data</strong>
        <span>{message}</span>
      </div>
      {onRetry && (
        <button type="button" className="button button--secondary button--small" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

export function Loading({
  rows = 5,
  label = 'Loading telemetry',
}: {
  rows?: number
  label?: string
}): ReactElement {
  return (
    <div className="loading" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="loading__row" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  )
}

export interface ListTableSkeletonColumn {
  key: string
  label: string
  className?: string
  width?: string
  secondaryWidth?: string
}

/**
 * Table-shaped loading state. The first column can show two bars so identity
 * rows keep the same rhythm as their loaded rows; metric bars align with the
 * column's numeric alignment.
 */
export function ListTableSkeleton({
  label,
  columns,
  rows = 8,
  tableClassName,
}: {
  label: string
  columns: ListTableSkeletonColumn[]
  rows?: number
  tableClassName?: string
}): ReactElement {
  return (
    <div className="table-scroll" role="status" aria-label={label}>
      <table
        className={cx('table list-table list-table--skeleton', tableClassName)}
        aria-hidden="true"
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.className} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => (
                <td key={column.key} className={column.className}>
                  {column.width &&
                    (column.secondaryWidth ? (
                      <span className="list-skeleton__stack">
                        <span
                          className="skeleton list-skeleton__bar"
                          style={{ width: column.width }}
                        />
                        <span
                          className="skeleton list-skeleton__bar list-skeleton__sub"
                          style={{ width: column.secondaryWidth }}
                        />
                      </span>
                    ) : (
                      <span
                        className={cx(
                          'skeleton list-skeleton__bar',
                          column.className?.includes('numeric') &&
                            'list-skeleton__bar--end',
                        )}
                        style={{ width: column.width }}
                      />
                    ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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

export interface DataTableColumn {
  key: string
  label?: ReactNode
  align?: 'left' | 'right'
  width?: string
  className?: string
}

/**
 * Shared list table. Column widths are declared once so the regression tabs
 * line up, and the first cell keeps one inset across every page.
 */
export function DataTable({
  label,
  columns,
  children,
  empty,
  className,
}: {
  label: string
  columns: DataTableColumn[]
  children: ReactNode
  empty?: ReactNode
  className?: string
}): ReactElement {
  return (
    <div className="table-scroll data-table-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className={cx('table data-table', className)}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} style={column.width ? { width: column.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cx(column.align === 'right' && 'numeric', column.className)}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children}
          {empty && (
            <tr>
              <td className="table-empty muted" colSpan={columns.length}>
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export function Toolbar({
  children,
  aside,
  label,
  className,
}: {
  children: ReactNode
  aside?: ReactNode
  label?: string
  className?: string
}): ReactElement {
  return (
    <div className={cx('list-toolbar toolbar', className)} role="toolbar" aria-label={label}>
      <div className="list-toolbar__controls">{children}</div>
      {aside && <div className="list-toolbar__aside">{aside}</div>}
    </div>
  )
}

export function TableFooter({
  total,
  limit,
  offset,
  onChange,
  note,
}: {
  total: number
  limit: number
  offset: number
  onChange: (offset: number) => void
  note?: ReactNode
}): ReactElement {
  const pages = Math.max(1, Math.ceil(total / limit))
  const page = total === 0 ? 1 : Math.min(pages, Math.floor(offset / limit) + 1)
  const start = total === 0 ? 0 : offset + 1
  const end = total === 0 ? 0 : Math.min(total, offset + limit)
  return (
    <div className="table-footer">
      <div className="table-footer__summary">
        {note && <span className="table-footer__note">{note}</span>}
        <span className="table-footer__count">
          Showing {formatNumber(start)}–{formatNumber(end)} of {formatNumber(total)}
        </span>
      </div>
      <div className="table-footer__nav">
        <span className="table-footer__page">
          {page} / {pages}
        </span>
        <button
          type="button"
          className="button button--ghost button--icon"
          onClick={() => onChange(Math.max(0, offset - limit))}
          disabled={offset === 0 || total === 0}
          aria-label="Previous page"
        >
          <Icon name="chevron-left" size={16} />
        </button>
        <button
          type="button"
          className="button button--ghost button--icon"
          onClick={() => onChange(Math.min((pages - 1) * limit, offset + limit))}
          disabled={page >= pages || total === 0}
          aria-label="Next page"
        >
          <Icon name="chevron-right" size={16} />
        </button>
      </div>
    </div>
  )
}

const ID_DISPLAY_LENGTH = 12

export function shortId(value: string): string {
  return value.length > ID_DISPLAY_LENGTH
    ? `${value.slice(0, ID_DISPLAY_LENGTH)}…`
    : value
}

export function Id({
  value,
  className,
}: {
  value: string
  className?: string
}): ReactElement {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      // Clipboard permission can fail; the full value stays in the tooltip.
    }
  }
  return (
    <button
      type="button"
      className={cx('id-text mono muted', className)}
      title={copied ? 'Copied' : `${value} — click to copy`}
      onClick={(event) => {
        event.stopPropagation()
        void copy()
      }}
    >
      {shortId(value)}
    </button>
  )
}

export function IdLink({
  value,
  onClick,
  label = 'Open',
  className,
}: {
  value: string
  onClick: () => void
  label?: string
  className?: string
}): ReactElement {
  return (
    <button
      type="button"
      className={cx('link mono id-text', className)}
      title={`${value} — ${label.toLowerCase()}`}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {shortId(value)}
    </button>
  )
}

export function CopyButton({
  value,
  label = 'Copy',
  className,
  small = false,
  primary = false,
  iconOnly = false,
}: {
  value: string
  label?: string
  className?: string
  small?: boolean
  primary?: boolean
  iconOnly?: boolean
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
    <>
      <button
        type="button"
        className={cx(
          'button',
          primary ? 'button--primary' : 'button--secondary',
          small && 'button--small',
          iconOnly && 'button--icon',
          className,
        )}
        onClick={() => void copy()}
        aria-label={copied ? 'Copied' : label}
        title={copied ? 'Copied' : label}
      >
        <Icon name={copied ? 'check' : 'copy'} size={small ? 14 : 16} />
        {!iconOnly && (copied ? 'Copied' : label)}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? `${label}: copied to clipboard` : ''}
      </span>
    </>
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
      <Icon name="search" size={14} />
      <input
        type="search"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button
          type="button"
          className="search__clear"
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </label>
  )
}

interface SelectMenuStyle {
  top: string
  left: string
  minWidth: string
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
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuStyle, setMenuStyle] = useState<SelectMenuStyle | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLUListElement | null>(null)
  const typeaheadRef = useRef({ query: '', timestamp: 0 })
  const listboxId = useId()
  const selectedIndex = options.findIndex((option) => option.value === value)
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value

  const openMenu = useCallback((): void => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    setMenuStyle({
      top: `${rect.bottom + 4}px`,
      left: `${rect.left}px`,
      minWidth: `${rect.width}px`,
    })
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }, [selectedIndex])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const position = (): void => {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return
      const triggerRect = trigger.getBoundingClientRect()
      const menuRect = menu.getBoundingClientRect()
      const margin = 8
      const gap = 4
      let top = triggerRect.bottom + gap
      if (top + menuRect.height > window.innerHeight - margin) {
        top = triggerRect.top - menuRect.height - gap
      }
      top = Math.max(margin, Math.min(top, window.innerHeight - menuRect.height - margin))
      let left = triggerRect.left
      if (left + menuRect.width > window.innerWidth - margin) {
        left = triggerRect.right - menuRect.width
      }
      left = Math.max(margin, Math.min(left, window.innerWidth - menuRect.width - margin))
      setMenuStyle({
        top: `${top}px`,
        left: `${left}px`,
        minWidth: `${triggerRect.width}px`,
      })
    }
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    document.getElementById(`${listboxId}-option-${activeIndex}`)?.scrollIntoView({
      block: 'nearest',
    })
  }, [activeIndex, listboxId, open])

  const choose = useCallback(
    (index: number): void => {
      const option = options[index]
      if (!option) return
      onChange(option.value)
      setOpen(false)
      triggerRef.current?.focus()
    },
    [onChange, options],
  )

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (
      event.key.length === 1 &&
      event.key !== ' ' &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      const now = Date.now()
      const typeahead = typeaheadRef.current
      if (now - typeahead.timestamp > 500) typeahead.query = ''
      typeahead.query += event.key.toLowerCase()
      typeahead.timestamp = now
      let match = options.findIndex((option) =>
        option.label.toLowerCase().startsWith(typeahead.query),
      )
      if (match < 0) {
        typeahead.query = event.key.toLowerCase()
        match = options.findIndex((option) =>
          option.label.toLowerCase().startsWith(typeahead.query),
        )
      }
      if (match >= 0) {
        event.preventDefault()
        if (!open) openMenu()
        setActiveIndex(match)
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (open) {
        setActiveIndex((index) => Math.min(index + 1, Math.max(options.length - 1, 0)))
      } else {
        openMenu()
      }
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (open) {
        setActiveIndex((index) => Math.max(index - 1, 0))
      } else {
        openMenu()
      }
      return
    }
    if (event.key === 'Home' && open) {
      event.preventDefault()
      setActiveIndex(0)
      return
    }
    if (event.key === 'End' && open) {
      event.preventDefault()
      setActiveIndex(Math.max(options.length - 1, 0))
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) {
        choose(activeIndex)
      } else {
        openMenu()
      }
      return
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
      return
    }
    if (event.key === 'Tab') setOpen(false)
  }

  return (
    <div className={cx('select', open && 'select--open')}>
      <button
        type="button"
        ref={triggerRef}
        className="select__trigger"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="select__value">{selectedLabel}</span>
        <Icon name="chevron-down" size={14} className="select__chevron" />
      </button>
      {open &&
        menuStyle &&
        createPortal(
          <ul
            ref={menuRef}
            id={listboxId}
            className="select__menu"
            role="listbox"
            aria-label={label}
            style={menuStyle}
          >
            {options.map((option, index) => {
              const selected = option.value === value
              return (
                <li
                  key={option.value}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={selected}
                  className={cx(
                    'select__option',
                    index === activeIndex && 'select__option--active',
                    selected && 'select__option--selected',
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(index)}
                >
                  <span className="select__option-check" aria-hidden="true">
                    <Icon name="check" size={14} />
                  </span>
                  <span className="select__option-label">{option.label}</span>
                </li>
              )
            })}
          </ul>,
          document.body,
        )}
    </div>
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

export interface BackLink {
  label: string
  onClick: () => void
  trail?: ReactNode
}

function BreadcrumbSeparator(): ReactElement {
  return <Icon name="chevron-right" size={14} className="topbar__separator" />
}

export function PageLayout({ children }: { children: ReactNode }): ReactElement {
  return <div className="page-layout">{children}</div>
}

export function PageHeader({
  eyebrow,
  eyebrowOnClick,
  title,
  description,
  info,
  actions,
  detail = false,
  back,
  detailAside,
}: {
  eyebrow?: string
  /** Turns the parent breadcrumb segment into a navigation control. */
  eyebrowOnClick?: () => void
  title: ReactNode
  description?: ReactNode
  info?: string
  actions?: ReactNode
  detail?: boolean
  back?: BackLink
  detailAside?: ReactNode
}): ReactElement {
  const chrome = useContext(PageChromeContext)

  if (detail) {
    const breadcrumb = (
      <>
        {back && (
          <>
            <button type="button" className="topbar__back" onClick={back.onClick}>
              <Icon name="chevron-left" size={14} />
              {back.label}
            </button>
            <span className="topbar__slash" aria-hidden="true">
              /
            </span>
            {back.trail && <span className="topbar__crumb mono">{back.trail}</span>}
          </>
        )}
      </>
    )
    return (
      <>
        {chrome.breadcrumb ? createPortal(breadcrumb, chrome.breadcrumb) : breadcrumb}
        <header className="page-head page-head--detail">
          <div className="page-head__main detail-head">
            <div className="detail-title-row">
              <h1 className="detail-title">{title}</h1>
              {detailAside}
            </div>
            {(eyebrow || description) && (
              <div className="detail-meta">
                {eyebrow && <span className="detail-eyebrow">{eyebrow}</span>}
                {description && <span className="meta-line">{description}</span>}
              </div>
            )}
          </div>
          {actions && <div className="page-head__actions">{actions}</div>}
        </header>
      </>
    )
  }

  const breadcrumb = (
    <>
      {eyebrow && eyebrow !== chrome.projectName && (
        <>
          {eyebrowOnClick ? (
            <button
              type="button"
              className="topbar__crumb topbar__crumb--link"
              onClick={eyebrowOnClick}
              title={`Open ${eyebrow}`}
            >
              {eyebrow}
            </button>
          ) : (
            <span className="topbar__crumb">{eyebrow}</span>
          )}
          <BreadcrumbSeparator />
        </>
      )}
      <span className="topbar__title">{title}</span>
    </>
  )

  return (
    <>
      {chrome.breadcrumb ? createPortal(breadcrumb, chrome.breadcrumb) : breadcrumb}
      <header className="page-head">
        <div className="page-head__main">
          <div className="page-head__title-row">
            <h1 className="page-head__title">{title}</h1>
            {info && (
              <InfoHint label={info}>
                {info}
              </InfoHint>
            )}
          </div>
          {description && <p className="page-head__description">{description}</p>}
        </div>
        {actions && <div className="page-head__actions">{actions}</div>}
      </header>
    </>
  )
}

export interface KeyValueEntry {
  label: string
  value: ReactNode
  /** Full value or explanation shown on hover. */
  title?: string
  /** Explain an intentionally empty value instead of showing a bare dash. */
  emptyReason?: string
  /** Show a hover copy affordance for this exact value. */
  copyValue?: string
  mono?: boolean
  numeric?: boolean
}

export function KeyValue({ entries }: { entries: KeyValueEntry[] }): ReactElement {
  return (
    <dl className="key-values">
      {entries.map((entry) => {
        const empty =
          entry.value === null ||
          entry.value === undefined ||
          entry.value === '' ||
          entry.value === '—'
        return (
          <div key={entry.label} className="key-values__row">
            <dt title={entry.label}>{entry.label}</dt>
            <dd
              className={cx(
                entry.mono && 'mono',
                entry.numeric && 'numeric tabular',
              )}
              title={entry.title}
            >
              {empty ? (
                <span
                  className="muted"
                  title={entry.emptyReason ?? 'This value was not captured.'}
                >
                  —
                </span>
              ) : (
                entry.value
              )}
              {entry.copyValue && !empty && (
                <CopyButton
                  value={entry.copyValue}
                  label={`Copy ${entry.label}`}
                  small
                  iconOnly
                  className="key-values__copy"
                />
              )}
            </dd>
          </div>
        )
      })}
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

export function Banner({
  tone = 'muted',
  icon,
  title,
  role,
  children,
}: {
  tone?: Tone
  icon?: IconName
  title?: ReactNode
  role?: 'note' | 'alert'
  children: ReactNode
}): ReactElement {
  return (
    <div className={cx('banner', `banner--${tone}`)} role={role}>
      {icon && <Icon name={icon} size={16} className="banner__icon" />}
      <div className="banner__body">
        {title && <div className="banner__title">{title}</div>}
        <div className="banner__text">{children}</div>
      </div>
    </div>
  )
}

export function PropertiesRail({ children }: { children: ReactNode }): ReactElement {
  return <aside className="properties-rail">{children}</aside>
}

export function PropertySection({
  title,
  description,
  entries,
  code,
  children,
}: {
  title: string
  description?: ReactNode
  entries?: Array<{ label: string; value: ReactNode }>
  code?: string
  children?: ReactNode
}): ReactElement {
  return (
    <section className="card">
      <header className="card__header">
        <div className="card__heading">
          <h2 className="card__title">{title}</h2>
        </div>
      </header>
      <div className="card__body">
        <div className="stack">
          {description && <p className="muted">{description}</p>}
          {entries && <KeyValue entries={entries} />}
          {code && <pre className="code-block code-block--scroll">{code}</pre>}
          {children}
        </div>
      </div>
    </section>
  )
}
