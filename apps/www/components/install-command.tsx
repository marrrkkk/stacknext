'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import {
  INSTALL_COMMANDS,
  PACKAGE_MANAGERS,
  type PackageManager,
} from '@/content/site'

export function InstallCommand(): React.ReactElement {
  const [manager, setManager] = useState<PackageManager>('npm')
  const [copied, setCopied] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const command = INSTALL_COMMANDS[manager]

  useEffect(() => {
    return () => {
      if (timeout.current) clearTimeout(timeout.current)
    }
  }, [])

  const select = (next: PackageManager): void => {
    setManager(next)
    setCopied(false)
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
    <div className="@container mx-auto mt-[34px] w-full max-w-[560px] animate-[rise_820ms_var(--ease-soft)_both_340ms] text-left max-720:mt-7">
      <div className="flex w-full items-stretch overflow-hidden border border-line-2 bg-[rgba(8,9,10,0.82)] backdrop-blur-[6px] [-webkit-backdrop-filter:blur(6px)] @min-[548px]:w-max @min-[548px]:min-w-full max-430:flex-wrap">
        <pre
          className="m-0 min-w-0 flex-1 overflow-x-auto px-[19px] py-[14px] font-mono text-[13.5px] leading-[1.65] whitespace-pre text-ink [scrollbar-color:var(--color-ink-4)_transparent] [scrollbar-width:thin] max-560:px-[14px] max-560:py-3 max-560:text-[13px] max-430:flex-[1_1_100%] max-430:whitespace-pre-wrap max-430:[overflow-wrap:anywhere]"
          tabIndex={0}
          aria-label={`${manager} installation command: ${command}`}
        >
          <code className="[font:inherit]">
            <span className="mr-[11px] select-none text-ink-3" aria-hidden="true">
              $
            </span>
            {command}
          </code>
        </pre>
        <button
          type="button"
          className="flex-none border-l border-line-2 bg-transparent px-4 py-[14px] font-mono text-[12px] leading-[1.65] tracking-[0.1em] uppercase text-ink-3 transition-[background,color] duration-[160ms] ease-soft hover:bg-[rgba(255,255,255,0.035)] hover:text-ink data-[copied=true]:text-live max-560:px-[13px] max-560:py-3 max-430:flex-[1_1_100%] max-430:border-l-0 max-430:border-t max-430:border-line-2 max-430:px-[14px] max-430:py-[11px] max-430:text-left"
          onClick={copy}
          aria-label={
            copied ? 'Installation command copied' : `Copy ${manager} installation command`
          }
          data-copied={copied ? 'true' : 'false'}
        >
          <span aria-live="polite">{copied ? 'copied' : 'copy'}</span>
        </button>
      </div>

      <div className="mt-5 font-mono text-[12.5px] leading-[1.65] tracking-[0.04em] text-ink-2 max-380:grid max-380:justify-items-start max-380:gap-2">
        <span className="inline" role="group" aria-label="Package manager">
          {PACKAGE_MANAGERS.map((item, index) => (
            <Fragment key={item}>
              {index > 0 ? (
                <span className="text-ink-4" aria-hidden="true">
                  {' · '}
                </span>
              ) : null}
              <button
                type="button"
                className="cursor-pointer border-0 bg-none p-0 font-[inherit] tracking-[inherit] text-ink-3 transition-colors duration-[160ms] ease-soft hover:text-ink-2 aria-pressed:text-ink"
                aria-pressed={manager === item}
                onClick={() => select(item)}
              >
                {item}
              </button>
            </Fragment>
          ))}
        </span>
        <span className="text-ink-4 max-380:hidden" aria-hidden="true">
          {' · '}
        </span>
        <a
          className="whitespace-nowrap text-ink-2 transition-colors duration-[160ms] ease-soft hover:text-ink"
          href="#install"
        >
          Full setup <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  )
}
