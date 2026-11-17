'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  INSTALL_COMMANDS,
  PACKAGE_MANAGERS,
  type PackageManager,
} from '@/content/site'
import { BunIcon, NpmIcon, PnpmIcon, YarnIcon } from './icons'

const DEFAULT_MANAGER: PackageManager = 'pnpm'

const PACKAGE_MANAGER_ICONS = {
  pnpm: PnpmIcon,
  npm: NpmIcon,
  bun: BunIcon,
  yarn: YarnIcon,
}

function PackageManagerIcon({ manager }: { manager: PackageManager }): React.ReactElement {
  const Icon = PACKAGE_MANAGER_ICONS[manager]
  return (
    <Icon
      className="mr-2 size-4 flex-none text-code-foreground max-380:hidden"
      data-manager={manager}
    />
  )
}

function CopyCommandIcon(): React.ReactElement {
  return (
    <svg
      className="size-4 flex-none"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  )
}

function CheckCommandIcon(): React.ReactElement {
  return (
    <svg
      className="size-4 flex-none"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function splitCommand(command: string): { prefix: string; packages: string } {
  const targetStart = command.indexOf('@stacknext/')
  if (targetStart < 0) return { prefix: command, packages: '' }
  return {
    prefix: command.slice(0, targetStart),
    packages: command.slice(targetStart),
  }
}

export function InstallCommand({
  className,
}: {
  className?: string
} = {}): React.ReactElement {
  const [manager, setManager] = useState<PackageManager>(DEFAULT_MANAGER)
  const [copied, setCopied] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const uid = useId()
  const panelId = `install-panel-${uid}`
  const command = INSTALL_COMMANDS[manager]
  const { prefix, packages } = splitCommand(command)

  useEffect(() => {
    return () => {
      if (timeout.current) clearTimeout(timeout.current)
    }
  }, [])

  const select = (next: PackageManager): void => {
    setManager(next)
    setCopied(false)
  }

  const focusTab = (index: number): void => {
    const nextIndex = (index + PACKAGE_MANAGERS.length) % PACKAGE_MANAGERS.length
    select(PACKAGE_MANAGERS[nextIndex] ?? DEFAULT_MANAGER)
    tabRefs.current[nextIndex]?.focus()
  }

  const navigate = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const current = PACKAGE_MANAGERS.indexOf(manager)
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusTab(current + 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusTab(current - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusTab(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusTab(PACKAGE_MANAGERS.length - 1)
    }
  }

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      if (timeout.current) clearTimeout(timeout.current)
      timeout.current = setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      className={['mx-auto w-full max-w-xl text-left', className].filter(Boolean).join(' ')}
      data-slot="install-command"
    >
      <div className="relative overflow-hidden rounded-[10px] bg-code text-sm text-code-foreground">
        <div className="flex items-center gap-2 border-b border-white/5 px-3 py-1">
          <div
            className="inline-flex h-9 w-fit items-center justify-center"
            role="tablist"
            aria-label="Package manager"
            aria-orientation="horizontal"
            onKeyDown={navigate}
          >
            <PackageManagerIcon manager={manager} />
            {PACKAGE_MANAGERS.map((item, index) => {
              const active = item === manager
              return (
                <button
                  key={item}
                  ref={(node) => {
                    tabRefs.current[index] = node
                  }}
                  type="button"
                  role="tab"
                  id={`install-tab-${uid}-${item}`}
                  aria-selected={active}
                  aria-controls={panelId}
                  data-state={active ? 'active' : 'inactive'}
                  tabIndex={active ? 0 : -1}
                  className="inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] border border-transparent px-2 pt-0.5 pb-1 text-sm font-medium transition-[color,background-color,border-color,box-shadow] duration-150 ease-soft outline-none focus-visible:border-[#737373] focus-visible:ring-[3px] focus-visible:ring-[#737373]/50 data-[state=active]:border-white/15 data-[state=active]:bg-white/[0.045] data-[state=active]:text-[#fafafa] max-380:px-1.5"
                  onClick={() => select(item)}
                >
                  {item}
                </button>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          className="absolute top-2 right-2 z-10 grid size-7 place-items-center rounded-[8px] bg-code opacity-70 transition-[color,background-color,opacity] duration-150 ease-soft outline-none hover:bg-code-accent/50 hover:text-[#fafafa] hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-[#737373]/50 focus-visible:opacity-100"
          onClick={copy}
        >
          <span className="sr-only" aria-live="polite">
            {copied ? 'Install command copied' : 'Copy install command'}
          </span>
          {copied ? <CheckCommandIcon /> : <CopyCommandIcon />}
        </button>

        <pre
          id={panelId}
          role="tabpanel"
          aria-labelledby={`install-tab-${uid}-${manager}`}
          tabIndex={0}
          className="m-0 -translate-y-px overflow-x-auto px-4 py-3.5 font-mono text-sm leading-5 text-code-foreground outline-none [scrollbar-width:thin]"
        >
          <code className="block text-left font-mono text-sm leading-5 max-sm:leading-6">
            <span className="block sm:inline-block">
              <span className="select-none">$ </span>
              {prefix}
              <span className="select-none sm:hidden" aria-hidden="true">
                \
              </span>
            </span>
            <span className="inline-flex gap-[1ch] text-[#fafafa] max-380:flex-col max-380:gap-0">
              {packages.split(' ').map((item) => (
                <span key={item}>{item}</span>
              ))}
            </span>
          </code>
        </pre>
      </div>
    </div>
  )
}
