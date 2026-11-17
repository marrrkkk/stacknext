'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  FileIcon,
} from './icons'

const SETUP_SKILL_PATH = '/agent-setup/SKILL.md'

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const AGENTS = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    logo: '/logos/agents/claude.svg',
    promptUrl: (prompt: string) =>
      `claude-cli://open?q=${encodeURIComponent(prompt)}`,
  },
  {
    id: 'codex',
    label: 'Codex',
    logo: '/logos/agents/codex.svg',
    promptUrl: (prompt: string) => `codex://new?prompt=${encodeURIComponent(prompt)}`,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    logo: '/logos/agents/cursor.svg',
    promptUrl: (prompt: string) =>
      `cursor://anysphere.cursor-deeplink/prompt?text=${encodeURIComponent(prompt)}`,
  },
] as const

type Agent = (typeof AGENTS)[number]

function setupPrompt(): string {
  return `Read and execute ${new URL(SETUP_SKILL_PATH, window.location.origin).href}`
}

export function SetupPrompt(): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom')
  const [menuMaxHeight, setMenuMaxHeight] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!open || event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [open])

  useIsomorphicLayoutEffect(() => {
    if (!open) return
    const updatePlacement = (): void => {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return
      const rect = trigger.getBoundingClientRect()
      const gap = 8
      const edge = 12
      const headerHeight =
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--header-h'),
        ) || 0
      const spaceBelow = window.innerHeight - rect.bottom - gap - edge
      const spaceAbove = rect.top - gap - edge - headerHeight
      const needsTop = menu.scrollHeight > spaceBelow && spaceAbove > spaceBelow
      setPlacement(needsTop ? 'top' : 'bottom')
      setMenuMaxHeight(Math.max(96, Math.floor(needsTop ? spaceAbove : spaceBelow)))
    }
    updatePlacement()
    window.addEventListener('resize', updatePlacement)
    window.addEventListener('scroll', updatePlacement, { passive: true })
    return () => {
      window.removeEventListener('resize', updatePlacement)
      window.removeEventListener('scroll', updatePlacement)
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (timeout.current) clearTimeout(timeout.current)
    }
  }, [])

  const flashCopied = (): void => {
    setCopied(true)
    if (timeout.current) clearTimeout(timeout.current)
    timeout.current = setTimeout(() => setCopied(false), 1800)
  }

  const copyPrompt = (prompt: string): void => {
    try {
      void navigator.clipboard.writeText(prompt).then(flashCopied, () => undefined)
    } catch {
      // Clipboard access is unavailable outside a secure context.
    }
  }

  const copy = async (): Promise<void> => {
    setOpen(false)
    try {
      await navigator.clipboard.writeText(setupPrompt())
      flashCopied()
    } catch {
      setCopied(false)
    }
  }

  const openIn = (agent: Agent): void => {
    setOpen(false)
    const prompt = setupPrompt()
    copyPrompt(prompt)
    window.location.assign(agent.promptUrl(prompt))
  }

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    )
    if (items.length === 0) return
    event.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLElement)
    const next =
      current === -1
        ? event.key === 'ArrowDown'
          ? 0
          : items.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) %
          items.length
    items[next]?.focus()
  }

  return (
    <div
      ref={containerRef}
      className="relative z-30 mx-auto mt-5 w-fit max-w-full animate-[rise_820ms_var(--ease-soft)_both_310ms]"
    >
      <div className="flex h-[42px] items-center rounded-[12px] border border-white bg-[#f3f3f3] text-[#171717] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_10px_30px_rgba(0,0,0,0.18)]">
        <button
          type="button"
          className="inline-flex h-full flex-none items-center gap-2 rounded-l-[11px] pl-[14px] pr-2 text-[13px] font-semibold leading-none transition-colors duration-[160ms] ease-soft hover:bg-[#e9e9e6] active:bg-[#e2e2df] data-[copied=true]:text-[#15803d] max-380:gap-1.5 max-380:pl-3"
          onClick={copy}
          aria-label="Copy setup prompt"
          data-copied={copied ? 'true' : 'false'}
        >
          {copied ? (
            <CheckIcon width={14} height={14} className="flex-none" />
          ) : (
            <CopyIcon width={14} height={14} className="flex-none" />
          )}
          <span className="grid text-left">
            <span
              className="invisible col-start-1 row-start-1 whitespace-nowrap"
              aria-hidden="true"
            >
              Copy setup prompt
            </span>
            <span className="col-start-1 row-start-1 whitespace-nowrap" aria-live="polite">
              {copied ? 'Copied' : 'Copy setup prompt'}
            </span>
          </span>
        </button>
        <button
          ref={triggerRef}
          type="button"
          className="inline-flex h-full flex-none items-center gap-[6px] rounded-r-[11px] pl-1 pr-[9px] transition-colors duration-[160ms] ease-soft hover:bg-[#e9e9e6] active:bg-[#e2e2df]"
          onClick={() => setOpen((value) => !value)}
          aria-label="Open setup prompt in a coding agent"
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <span className="flex flex-none items-center" aria-hidden="true">
            {AGENTS.map((agent, index) => (
              <span
                key={agent.id}
                className="-ml-[6px] grid size-[21px] flex-none place-items-center overflow-hidden rounded-full bg-white shadow-[0_0_0_1.5px_#f3f3f3] first:ml-0"
                style={{ zIndex: AGENTS.length - index }}
              >
                <img
                  src={agent.logo}
                  alt=""
                  width={15}
                  height={15}
                  className="size-[15px]"
                />
              </span>
            ))}
          </span>
          <ChevronDownIcon
            width={13}
            height={13}
            className={`flex-none text-[#595959] transition-transform duration-[160ms] ease-soft ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {open ? (
        <div
          ref={menuRef}
          className={`absolute right-0 z-20 flex w-[238px] flex-col gap-0.5 overflow-y-auto rounded-[14px] border border-[#d9d9d4] bg-[#f7f7f5] p-1.5 text-left text-[#1c1c1c] shadow-[0_18px_50px_rgba(0,0,0,0.38)] ${
            placement === 'top'
              ? 'bottom-[calc(100%+8px)] animate-[panel-in-up_180ms_var(--ease-soft)]'
              : 'top-[calc(100%+8px)] animate-[panel-in_180ms_var(--ease-soft)]'
          }`}
          style={menuMaxHeight === null ? undefined : { maxHeight: menuMaxHeight }}
          role="menu"
          aria-label="Set up StackNext in an agent"
          onKeyDown={handleMenuKeyDown}
        >
          <p
            className="px-[10px] pb-[6px] pt-[5px] font-mono text-[10px] font-medium tracking-[0.12em] uppercase text-[#8a8a85]"
            aria-hidden="true"
          >
            Open in
          </p>
          {AGENTS.map((agent) => (
            <button
              key={agent.id}
              type="button"
              className="group flex w-full items-center gap-[10px] rounded-[9px] px-[10px] py-[9px] text-left text-[13px] font-medium text-[#2d2d2d] transition-colors duration-[160ms] ease-soft hover:bg-[#e9e9e5] hover:text-[#111]"
              role="menuitem"
              aria-label={`Open the setup prompt in ${agent.label}`}
              onClick={() => openIn(agent)}
            >
              <span className="grid size-[18px] flex-none place-items-center">
                <img
                  src={agent.logo}
                  alt=""
                  width={16}
                  height={16}
                  className="size-[16px]"
                />
              </span>
              <span>{agent.label}</span>
              <ArrowUpRight
                width={13}
                height={13}
                className="ml-auto flex-none text-[#a0a09a] transition-colors duration-[160ms] ease-soft group-hover:text-[#5a5a55]"
              />
            </button>
          ))}
          <div className="my-[5px] h-px bg-[#e3e3de]" role="separator" />
          <a
            className="group flex items-center gap-[10px] rounded-[9px] px-[10px] py-[9px] text-[13px] font-medium text-[#2d2d2d] transition-colors duration-[160ms] ease-soft hover:bg-[#e9e9e5] hover:text-[#111]"
            href={SETUP_SKILL_PATH}
            target="_blank"
            rel="noreferrer"
            role="menuitem"
            aria-label="View the StackNext setup skill"
            onClick={() => setOpen(false)}
          >
            <FileIcon
              width={16}
              height={16}
              className="flex-none text-[#8a8a85] transition-colors duration-[160ms] ease-soft group-hover:text-[#4a4a45]"
            />
            <span>View SKILL.md</span>
          </a>
        </div>
      ) : null}
    </div>
  )
}
