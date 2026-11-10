'use client'

import { useEffect, useRef, useState } from 'react'
import { NAV } from '@/content/site'
import { ButtonLink } from './primitives'
import { ArrowUpRight, CloseIcon, MenuIcon } from './icons'

const BRAND_IMAGE = 'block h-auto w-[92px] max-720:w-[84px]'

export function SiteHeader(): React.ReactElement {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.dataset.menuOpen = open ? 'true' : 'false'
    return () => {
      delete document.body.dataset.menuOpen
    }
  }, [open])

  const openMenu = (): void => {
    const dialog = dialogRef.current
    if (!dialog) return
    setOpen(true)
    dialog.showModal()
  }

  const closeMenu = (): void => {
    dialogRef.current?.close()
  }

  return (
    <>
      <header
        className="fixed inset-x-0 top-0 z-[100] h-(--header-h) border-b border-line bg-[rgba(8,8,8,0.78)] [-webkit-backdrop-filter:blur(18px)_saturate(115%)] data-[scrolled=true]:bg-[rgba(8,8,8,0.9)]"
        data-scrolled={scrolled ? 'true' : 'false'}
      >
        <div className="mx-auto grid h-full w-frame grid-cols-[1fr_auto_1fr] items-center gap-6 px-[clamp(16px,2.4vw,32px)] max-860:grid-cols-[1fr_auto] max-720:w-full max-720:px-4">
          <a
            className="inline-flex w-fit items-center rounded-[6px]"
            href="/#top"
            aria-label="StackNext home"
          >
            <img
              className={BRAND_IMAGE}
              src="/brand/stacknext-lockup-horizontal-white.svg"
              width={88}
              height={26}
              alt="StackNext"
            />
          </a>

          <nav className="flex items-center gap-[2px] justify-self-center max-1040:gap-0 max-860:hidden" aria-label="Primary">
            {NAV.map((item) => {
              const external = item.href.startsWith('http')
              return (
                <a
                  key={item.label}
                  className="inline-flex items-center gap-1 rounded-[9px] px-3 py-2 text-[13.5px] font-medium text-[#a3a3a3] transition-[background,color] duration-[160ms] ease-soft hover:bg-[rgba(255,255,255,0.06)] hover:text-ink max-1040:px-[10px]"
                  href={item.href}
                  target={external ? '_blank' : undefined}
                  rel={external ? 'noreferrer' : undefined}
                >
                  {item.label}
                  {external && <ArrowUpRight className="opacity-[0.55]" width={11} height={11} aria-hidden />}
                </a>
              )
            })}
          </nav>

          <div className="flex items-center gap-[10px] justify-self-end max-860:col-start-2">
            <ButtonLink href="/#install" size="sm" icon="arrow-down" className="max-560:hidden">
              Install
            </ButtonLink>
            <button
              type="button"
              className="hidden size-[38px] place-items-center rounded-[10px] border border-line-2 bg-[#111] text-ink transition-[background] duration-[160ms] ease-soft hover:bg-[#1a1a1a] max-860:grid"
              aria-label="Open menu"
              aria-haspopup="dialog"
              onClick={openMenu}
            >
              <MenuIcon width={18} height={18} />
            </button>
          </div>
        </div>
      </header>

      <dialog
        ref={dialogRef}
        className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-[#050505] p-0 text-ink backdrop:bg-black/65"
        aria-label="StackNext menu"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) closeMenu()
        }}
      >
        <div className="flex min-h-dvh flex-col px-pad pb-[30px]">
          <div className="mb-[26px] flex h-(--header-h) items-center justify-between border-b border-line">
            <a className="inline-flex w-fit items-center rounded-[6px]" href="/#top" onClick={closeMenu} aria-label="StackNext home">
              <img
                className={BRAND_IMAGE}
                src="/brand/stacknext-lockup-horizontal-white.svg"
                width={88}
                height={26}
                alt="StackNext"
              />
            </a>
            <button
              type="button"
              className="hidden size-[38px] place-items-center rounded-[10px] border border-line-2 bg-[#111] text-ink transition-[background] duration-[160ms] ease-soft hover:bg-[#1a1a1a] max-860:grid"
              aria-label="Close menu"
              onClick={closeMenu}
            >
              <CloseIcon width={18} height={18} />
            </button>
          </div>

          <nav
            className="flex flex-col [&_a]:grid [&_a]:grid-cols-[34px_1fr_auto] [&_a]:items-center [&_a]:gap-[10px] [&_a]:border-b [&_a]:border-line [&_a]:py-[22px] [&_a]:text-[clamp(1.65rem,7vw,2.2rem)] [&_a]:font-medium [&_a]:tracking-[-0.035em] [&_a]:transition-colors [&_a]:duration-[160ms] [&_a:hover]:text-ink-2"
            aria-label="Mobile primary"
          >
            {NAV.map((item, index) => {
              const external = item.href.startsWith('http')
              return (
                <a
                  key={item.label}
                  href={item.href}
                  target={external ? '_blank' : undefined}
                  rel={external ? 'noreferrer' : undefined}
                  onClick={closeMenu}
                >
                  <span className="font-mono text-[11px] tracking-[0.1em] text-ink-3">
                    0{index + 1}
                  </span>
                  <span>{item.label}</span>
                  <ArrowUpRight width={16} height={16} aria-hidden />
                </a>
              )
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-4 pt-10">
            <ButtonLink
              href="/#install"
              icon="arrow-down"
              className="w-full"
              onClick={closeMenu}
            >
              Install
            </ButtonLink>
            <p className="text-center font-mono text-[11px] tracking-[0.12em] uppercase text-ink-3">
              Open source · MIT · Contributions welcome
            </p>
          </div>
        </div>
      </dialog>
    </>
  )
}
