import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { ArrowDown, ArrowRight, ArrowUpRight, GitHubIcon } from './icons'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'sm' | 'lg'

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: 'arrow-down' | 'arrow-right' | 'arrow-up-right' | 'github'
  external?: boolean
  children: ReactNode
}

const BUTTON_BASE =
  'group inline-flex items-center justify-between whitespace-nowrap border text-[13px] font-semibold leading-none transition-[background,border-color,color,transform,box-shadow] duration-[180ms] ease-soft'

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'h-[42px] gap-3 rounded-[12px] pl-[14px] pr-[6px]',
  lg: 'h-[50px] gap-[15px] rounded-frame pl-[18px] pr-[7px]',
}

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    'border-white bg-[#f3f3f3] text-[#171717] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] hover:-translate-y-px hover:bg-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_10px_30px_rgba(255,255,255,0.08)] active:translate-y-0',
  secondary:
    'border-[#383838] bg-[#141414] text-[#ddd] hover:-translate-y-px hover:border-[#4a4a4a] hover:bg-[#1b1b1b] active:translate-y-0',
  ghost: 'h-auto border-transparent p-0 text-ink',
}

const BUTTON_ICON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-[#dedede] text-[#191919]',
  secondary: 'bg-[#222] text-[#ddd]',
  ghost: '',
}

function ButtonIcon({ icon }: { icon: NonNullable<ButtonLinkProps['icon']> }): React.ReactElement {
  const props = { width: 14, height: 14 }
  if (icon === 'arrow-down') return <ArrowDown {...props} />
  if (icon === 'arrow-up-right') return <ArrowUpRight {...props} />
  if (icon === 'github') return <GitHubIcon {...props} />
  return <ArrowRight {...props} />
}

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'lg',
  icon = 'arrow-up-right',
  external = false,
  className,
  children,
  ...props
}: ButtonLinkProps): React.ReactElement {
  const classes = [BUTTON_BASE, BUTTON_SIZE[size], BUTTON_VARIANT[variant], className]
    .filter(Boolean)
    .join(' ')

  return (
    <a
      href={href}
      className={classes}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      {...props}
    >
      <span>{children}</span>
      {variant !== 'ghost' && (
        <span
          className={`grid size-[27px] flex-none place-items-center rounded-[9px] transition-transform duration-200 ease-soft group-hover:translate-x-px group-hover:-translate-y-px ${BUTTON_ICON_VARIANT[variant]}`}
          aria-hidden="true"
        >
          <ButtonIcon icon={icon} />
        </span>
      )}
    </a>
  )
}

export function TextLink({
  href,
  external = false,
  children,
  className,
}: {
  href: string
  external?: boolean
  children: ReactNode
  className?: string
}): React.ReactElement {
  return (
    <a
      className={[
        'group inline-flex w-fit items-center gap-[6px] border-b border-transparent pb-[2px] text-[13px] font-medium text-[#d4d4d4] transition-[color,border-color] duration-[160ms] ease-soft hover:border-white/40 hover:text-white',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
    >
      {children}
      {external ? (
        <ArrowUpRight
          className="transition-transform duration-[180ms] ease-soft group-hover:translate-x-[2px] group-hover:-translate-y-[2px]"
          width={13}
          height={13}
          aria-hidden
        />
      ) : (
        <ArrowRight
          className="transition-transform duration-[180ms] ease-soft group-hover:translate-x-[2px] group-hover:-translate-y-[2px]"
          width={13}
          height={13}
          aria-hidden
        />
      )}
    </a>
  )
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }): React.ReactElement {
  return (
    <p
      className={[
        'font-mono text-[12px] font-medium leading-[1.4] tracking-[0.16em] uppercase text-ink-2',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </p>
  )
}

export function LiveDot({ label }: { label?: string }): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] leading-none tracking-[0.12em] uppercase whitespace-nowrap text-ink-2">
      <span
        className="relative size-[5px] flex-none rounded-full bg-live shadow-[0_0_8px_rgba(74,222,128,0.55)] after:absolute after:-inset-1 after:rounded-full after:border after:border-[rgba(74,222,128,0.28)] after:content-[''] after:animate-[live-pulse_2.8s_var(--ease-soft)_infinite]"
        aria-hidden="true"
      />
      {label && <span>{label}</span>}
    </span>
  )
}

export function SectionHead({
  label,
  title,
  lede,
  id,
  className,
}: {
  label: string
  title: ReactNode
  lede?: ReactNode
  id?: string
  className?: string
}): React.ReactElement {
  return (
    <header
      className={[
        'grid grid-cols-[minmax(150px,0.34fr)_minmax(0,1fr)] items-start gap-[clamp(24px,4vw,72px)] mb-[clamp(48px,6vw,80px)] max-940:grid-cols-1 max-940:gap-[18px]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="pt-[13px] max-940:pt-0">
        <Eyebrow>{label}</Eyebrow>
      </div>
      <div className="max-w-[940px]">
        <h2
          className="text-balance text-[clamp(2rem,3.2vw,3.1rem)] font-medium leading-[1.06] tracking-[-0.035em] text-ink max-560:text-[clamp(1.85rem,8.2vw,2.4rem)]"
          id={id}
        >
          {title}
        </h2>
        {lede && (
          <p className="mt-[22px] max-w-[62ch] text-pretty text-[clamp(0.95rem,1.1vw,1.02rem)] leading-[1.62] text-ink-2 max-940:mt-[18px] max-560:text-[14px]">
            {lede}
          </p>
        )}
      </div>
    </header>
  )
}

export function Screenshot({
  base,
  alt,
  priority = false,
  className,
}: {
  base: string
  alt: string
  priority?: boolean
  className?: string
}): React.ReactElement {
  const src = `/shots/${base}.webp`
  const src2x = `/shots/${base}@2x.webp`
  return (
    <picture className={['block bg-[#0a0a0a]', className].filter(Boolean).join(' ')}>
      <source
        media="(max-width: 720px)"
        srcSet={`/shots/${base}-mobile.webp 1x, /shots/${base}-mobile@2x.webp 2x`}
      />
      <img
        className="block aspect-[1600/1000] h-auto w-full max-720:aspect-[390/844]"
        src={src}
        srcSet={`${src} 1x, ${src2x} 2x`}
        alt={alt}
        width={1600}
        height={1000}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        fetchPriority={priority ? 'high' : 'auto'}
      />
    </picture>
  )
}

export function ProductFrame({
  children,
  caption,
  priority = false,
  label = 'StackNext',
  meta = 'LOCAL SAMPLE',
  className,
}: {
  children: ReactNode
  caption?: string
  priority?: boolean
  label?: string
  meta?: string | null
  className?: string
}): React.ReactElement {
  return (
    <figure
      className={[
        'relative m-0 overflow-hidden rounded-[18px] border border-line-2 bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_40px_120px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.02)] max-720:rounded-[13px]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex h-[44px] items-center gap-[14px] border-b border-line bg-[linear-gradient(180deg,#111,#0b0b0b)] px-4 max-720:h-10 max-720:gap-[10px] max-720:px-3">
        <span
          className="flex flex-none gap-[5px] [&_i]:size-[6px] [&_i]:rounded-full [&_i]:border [&_i]:border-[#444] [&_i]:bg-[#333]"
          aria-hidden
        >
          <i />
          <i />
          <i />
        </span>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] tracking-[0.1em] uppercase text-ink-2">
          {label}
        </span>
        {meta && (
          <span className="ml-auto flex items-center gap-[10px] whitespace-nowrap font-mono text-[11px] tracking-[0.1em] uppercase text-ink-3 max-720:hidden">
            <LiveDot />
            {meta}
          </span>
        )}
      </div>
      <div className="bg-[#0a0a0a]">{children}</div>
      {caption && (
        <figcaption className="border-t border-line bg-[#090909] px-4 py-3 text-center font-mono text-[11px] tracking-[0.06em] text-ink-3 max-720:px-3 max-720:py-[10px]">
          {caption}
        </figcaption>
      )}
      {priority && <span className="sr-only">Priority product screenshot</span>}
    </figure>
  )
}
