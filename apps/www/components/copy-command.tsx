'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckIcon, CopyIcon } from './icons'

export function CopyCommand({
  value,
  label = 'Copy commands',
  className,
}: {
  value: string
  label?: string
  className?: string
}): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeout.current) clearTimeout(timeout.current)
    }
  }, [])

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (timeout.current) clearTimeout(timeout.current)
      timeout.current = setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      className={[
        'mx-auto mt-[34px] max-w-[570px] overflow-hidden rounded-[14px] border border-line-2 bg-[#080808] text-left shadow-[0_24px_70px_rgba(0,0,0,0.5)] max-720:mt-7',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex h-10 items-center gap-3 border-b border-line bg-[#0b0b0b] pr-[10px] pl-[14px]">
        <span className="flex gap-[5px]" aria-hidden="true">
          <i className="size-[6px] rounded-full border border-[#444] bg-[#333]" />
          <i className="size-[6px] rounded-full border border-[#444] bg-[#333]" />
          <i className="size-[6px] rounded-full border border-[#444] bg-[#333]" />
        </span>
        <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-ink-3">terminal</span>
        <button
          type="button"
          className="ml-auto inline-flex h-[26px] items-center gap-[6px] rounded-[6px] border border-line px-2 text-[12px] text-ink-2 transition-[background,color] duration-[160ms] ease-soft hover:bg-[#1a1a1a] hover:text-ink data-[copied=true]:border-live/30 data-[copied=true]:text-live"
          onClick={copy}
          aria-label={copied ? 'Copied' : label}
          data-copied={copied ? 'true' : 'false'}
        >
          {copied ? <CheckIcon width={14} height={14} /> : <CopyIcon width={14} height={14} />}
          <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre
        className="m-0 overflow-x-auto p-[16px_18px] text-[13px] leading-[2] [scrollbar-color:#333_#0b0b0b] max-720:p-[14px] max-720:text-[12.5px]"
        tabIndex={0}
      >
        <code className="grid">
          {value.split('\n').map((line, index) => (
            <span
              className="block whitespace-pre text-[#d0d0d0] max-560:whitespace-pre-wrap max-560:[overflow-wrap:anywhere]"
              key={`${line}-${index}`}
            >
              <span className="inline-block w-[18px] select-none text-[#555]" aria-hidden="true">
                $
              </span>
              <span>{line}</span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}
