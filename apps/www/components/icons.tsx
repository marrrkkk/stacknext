import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function iconProps(props: IconProps): IconProps {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
    ...props,
  }
}

export function ArrowUpRight(props: IconProps): React.ReactElement {
  return (
    <svg {...iconProps(props)}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  )
}

export function ArrowRight(props: IconProps): React.ReactElement {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  )
}

export function ArrowDown(props: IconProps): React.ReactElement {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 4v15" />
      <path d="m6 13 6 6 6-6" />
    </svg>
  )
}

export function GitHubIcon(props: IconProps): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z" />
    </svg>
  )
}

export function CopyIcon(props: IconProps): React.ReactElement {
  return (
    <svg {...iconProps(props)}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

export function CheckIcon(props: IconProps): React.ReactElement {
  return (
    <svg {...iconProps(props)}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

export function DashboardIcon(props: IconProps): React.ReactElement {
  return (
    <svg {...iconProps(props)}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  )
}

export function TerminalIcon(props: IconProps): React.ReactElement {
  return (
    <svg {...iconProps(props)}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="m7 9 3 3-3 3M13 15h4" />
    </svg>
  )
}

export function McpIcon(props: IconProps): React.ReactElement {
  return (
    <svg {...iconProps(props)}>
      <circle cx="6" cy="12" r="2.3" />
      <circle cx="18" cy="6" r="2.3" />
      <circle cx="18" cy="18" r="2.3" />
      <path d="M8.2 11 15.7 6.8M8.2 13l7.5 4.2" />
    </svg>
  )
}

export function LockIcon(props: IconProps): React.ReactElement {
  return (
    <svg {...iconProps(props)}>
      <rect x="5" y="10" width="14" height="11" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </svg>
  )
}

export function MenuIcon(props: IconProps): React.ReactElement {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

export function CloseIcon(props: IconProps): React.ReactElement {
  return (
    <svg {...iconProps(props)}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

export function BrandSymbol({ size = 32, ...props }: IconProps & { size?: number }): React.ReactElement {
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      role="img"
      aria-label="StackNext symbol"
      focusable="false"
      {...props}
    >
      <g fill="currentColor">
        <path d="M168 34H68A34 34 0 0 0 34 68V188A34 34 0 0 0 68 222H188A34 34 0 0 0 222 188V88H194V188A6 6 0 0 1 188 194H68A6 6 0 0 1 62 188V68A6 6 0 0 1 68 62H168Z" />
        <rect x="88" y="128" width="40" height="40" rx="6" />
      </g>
    </svg>
  )
}

export function AccessIcon({
  name,
  ...props
}: IconProps & { name: 'dashboard' | 'terminal' | 'mcp' }): React.ReactElement {
  if (name === 'terminal') return <TerminalIcon {...props} />
  if (name === 'mcp') return <McpIcon {...props} />
  return <DashboardIcon {...props} />
}
