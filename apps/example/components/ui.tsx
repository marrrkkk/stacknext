import type { ReactNode } from 'react'

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
}): React.ReactElement {
  return (
    <header className="page-head">
      <div className="page-head__main">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-head__title">{title}</h1>
        {description && <p className="page-head__description">{description}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </header>
  )
}

export function Card({
  title,
  subtitle,
  meta,
  actions,
  footer,
  children,
  padded = true,
  className,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  children: ReactNode
  padded?: boolean
  className?: string
}): React.ReactElement {
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
      <div className={cx('card__body', !padded && 'card__body--flush')}>{children}</div>
      {footer && <footer className="card__footer">{footer}</footer>}
    </section>
  )
}

export type BadgeTone = 'good' | 'warn' | 'bad' | 'muted' | 'accent'

export function Badge({
  children,
  tone = 'muted',
  title,
}: {
  children: ReactNode
  tone?: BadgeTone
  title?: string
}): React.ReactElement {
  return (
    <span className={cx('chip', `chip--${tone}`)} title={title}>
      <span className="chip__dot" aria-hidden="true" />
      <span className="chip__label">{children}</span>
    </span>
  )
}

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'bad'
}): React.ReactElement {
  return (
    <div className="stat">
      <div className="stat__label">
        <span className="stat__label-text">{label}</span>
        {tone !== 'default' && (
          <span className={cx('stat__dot', `stat__dot--${tone}`)} aria-hidden="true" />
        )}
      </div>
      <div className="stat__value">{value}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  )
}

export function StatStrip({ children }: { children: ReactNode }): React.ReactElement {
  return <div className="stat-strip">{children}</div>
}

export function Progress({
  value,
  label,
  small = false,
}: {
  value: number
  label: string
  small?: boolean
}): React.ReactElement {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div
      className={cx('progress', small && 'progress--small')}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
    >
      <span style={{ width: `${clamped}%` }} />
    </div>
  )
}
