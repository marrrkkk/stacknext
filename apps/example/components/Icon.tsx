import type { ReactElement } from 'react'

export type IconName =
  | 'overview'
  | 'projects'
  | 'scenarios'
  | 'actions'
  | 'external'
  | 'book'
  | 'menu'
  | 'close'
  | 'arrow-right'
  | 'chevron-right'
  | 'copy'
  | 'check'
  | 'reset'
  | 'play'
  | 'info'
  | 'database'
  | 'errors'
  | 'traces'
  | 'moon'
  | 'sun'

const PATHS: Record<IconName, ReactElement> = {
  overview: (
    <>
      <rect x="2.5" y="2.5" width="4.6" height="4.6" rx="1" />
      <rect x="8.9" y="2.5" width="4.6" height="4.6" rx="1" />
      <rect x="2.5" y="8.9" width="4.6" height="4.6" rx="1" />
      <rect x="8.9" y="8.9" width="4.6" height="4.6" rx="1" />
    </>
  ),
  projects: (
    <>
      <path d="M2.5 5.2 8 2.4l5.5 2.8L8 8 2.5 5.2Z" />
      <path d="m2.5 8.6 5.5 2.8 5.5-2.8" />
      <path d="m2.5 11.8 5.5 2.8 5.5-2.8" />
    </>
  ),
  scenarios: (
    <>
      <path d="M6 2.5h4" />
      <path d="M7 2.5v4.2l-3.4 5.6a1.4 1.4 0 0 0 1.2 2.2h6.4a1.4 1.4 0 0 0 1.2-2.2L9 6.7V2.5" />
      <path d="M4.9 10.4h6.2" />
    </>
  ),
  actions: <path d="M8.8 1.8 3 9h3.7l-.6 5.2L12.2 7H8.4l.4-5.2Z" />,
  external: (
    <>
      <path d="M9 2.5h4.5V7" />
      <path d="m13.5 2.5-6 6" />
      <path d="M12 9.2v3.1a1.2 1.2 0 0 1-1.2 1.2H3.7a1.2 1.2 0 0 1-1.2-1.2V5.2A1.2 1.2 0 0 1 3.7 4h3.1" />
    </>
  ),
  book: (
    <>
      <path d="M2.5 3.1A1.6 1.6 0 0 1 4.1 2.5H8v11H4.1a1.6 1.6 0 0 0-1.6 1.6V3.1Z" />
      <path d="M13.5 3.1a1.6 1.6 0 0 0-1.6-.6H8v11h3.9a1.6 1.6 0 0 1 1.6 1.6V3.1Z" />
    </>
  ),
  menu: (
    <>
      <path d="M2.5 4.5h11" />
      <path d="M2.5 8h11" />
      <path d="M2.5 11.5h11" />
    </>
  ),
  close: (
    <>
      <path d="m4 4 8 8" />
      <path d="m12 4-8 8" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M2.5 8h11" />
      <path d="m9.5 4 4 4-4 4" />
    </>
  ),
  'chevron-right': <path d="m6 3.5 4.5 4.5L6 12.5" />,
  copy: (
    <>
      <rect x="5.2" y="5.2" width="8.3" height="8.3" rx="1.4" />
      <path d="M10.8 5.2V3.6a1.1 1.1 0 0 0-1.1-1.1H3.6a1.1 1.1 0 0 0-1.1 1.1v6.1a1.1 1.1 0 0 0 1.1 1.1h1.6" />
    </>
  ),
  check: <path d="m3 8.4 3.2 3.2L13 4.8" />,
  reset: (
    <>
      <path d="M3.2 8a4.8 4.8 0 1 0 1.4-3.4" />
      <path d="M3 2.6v3.2h3.2" />
    </>
  ),
  play: <path d="M5 3.2 12.2 8 5 12.8V3.2Z" />,
  info: (
    <>
      <circle cx="8" cy="8" r="5.8" />
      <path d="M8 7.4v3.4" />
      <path d="M8 5.1h.01" />
    </>
  ),
  database: (
    <>
      <ellipse cx="8" cy="3.9" rx="5" ry="1.9" />
      <path d="M3 3.9v8.2c0 1 2.2 1.9 5 1.9s5-.9 5-1.9V3.9" />
      <path d="M3 8c0 1 2.2 1.9 5 1.9S13 9 13 8" />
    </>
  ),
  errors: (
    <>
      <path d="M8 2.2 14.3 13H1.7L8 2.2Z" />
      <path d="M8 6v3.2" />
      <path d="M8 11.2h.01" />
    </>
  ),
  traces: (
    <>
      <path d="M2.5 3.5h4" />
      <path d="M5 8h5" />
      <path d="M7.5 12.5h6" />
      <circle cx="9" cy="3.5" r="1.2" />
      <circle cx="4.6" cy="12.5" r="1.2" />
    </>
  ),
  moon: <path d="M13 9.6A5.4 5.4 0 0 1 6.4 3a5.6 5.6 0 1 0 6.6 6.6Z" />,
  sun: (
    <>
      <circle cx="8" cy="8" r="2.8" />
      <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
    </>
  ),
}

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName
  size?: number
  className?: string
}): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PATHS[name]}
    </svg>
  )
}
