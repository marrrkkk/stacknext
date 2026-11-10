'use client'

import { useRef, useState } from 'react'
import { TOUR } from '@/content/site'
import { ArrowUpRight } from './icons'
import { ProductFrame, Screenshot, TextLink } from './primitives'

export function ProductTour(): React.ReactElement {
  const [activeId, setActiveId] = useState(TOUR[0]!.id)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const active = TOUR.find((item) => item.id === activeId) ?? TOUR[0]!

  const focusTab = (index: number): void => {
    const bounded = (index + TOUR.length) % TOUR.length
    setActiveId(TOUR[bounded]!.id)
    tabRefs.current[bounded]?.focus()
  }

  return (
    <div data-reveal>
      <div
        className="mb-[18px] flex gap-1 overflow-x-auto rounded-frame border border-line bg-[#080808] p-[5px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-720:justify-start"
        role="tablist"
        aria-label="Dashboard views"
      >
        {TOUR.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => {
              tabRefs.current[index] = element
            }}
            type="button"
            role="tab"
            id={`tour-tab-${item.id}`}
            aria-selected={activeId === item.id}
            aria-controls={`tour-panel-${item.id}`}
            tabIndex={activeId === item.id ? 0 : -1}
            className="group flex h-[46px] min-w-[128px] flex-1 items-center gap-[10px] rounded-[10px] px-[14px] text-[13px] font-medium text-ink-2 transition-[background,color] duration-[180ms] ease-soft hover:bg-[rgba(255,255,255,0.04)] hover:text-ink aria-selected:bg-[#f3f3f3] aria-selected:text-[#141414] max-720:flex-none max-720:min-w-[138px] max-560:h-[42px] max-560:min-w-[126px]"
            onClick={() => setActiveId(item.id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault()
                focusTab(index + 1)
              } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault()
                focusTab(index - 1)
              } else if (event.key === 'Home') {
                event.preventDefault()
                focusTab(0)
              } else if (event.key === 'End') {
                event.preventDefault()
                focusTab(TOUR.length - 1)
              }
            }}
          >
            <span className="font-mono text-[11px] text-current opacity-[0.52]" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span>{item.label}</span>
            <ArrowUpRight
              className="ml-auto opacity-0 transition-opacity duration-[180ms] ease-soft group-aria-selected:opacity-[0.55]"
              width={12}
              height={12}
              aria-hidden
            />
          </button>
        ))}
      </div>

      {TOUR.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`tour-panel-${item.id}`}
          aria-labelledby={`tour-tab-${item.id}`}
          hidden={activeId !== item.id}
          className="grid animate-[panel-in_420ms_var(--ease-soft)_both] grid-cols-[minmax(0,1fr)_342px] items-start gap-[clamp(24px,3vw,48px)] [&[hidden]]:hidden max-1240:grid-cols-[minmax(0,1fr)_310px] max-940:grid-cols-1 max-940:gap-[26px]"
        >
          <div className="min-w-0">
            <ProductFrame
              label={`StackNext / ${item.label}`}
              meta="WINDOWS CHROME · DARK"
            >
              <Screenshot base={item.image} alt={item.alt} />
            </ProductFrame>
          </div>

          <div className="sticky top-[calc(var(--header-h)+30px)] pt-[6px] max-940:static max-940:max-w-[620px]">
            <span className="block font-mono text-[11px] tracking-[0.14em] uppercase text-ink-3">
              {String(TOUR.indexOf(item) + 1).padStart(2, '0')} / {item.label}
            </span>
            <h3 className="mt-4 text-balance text-[clamp(1.45rem,2vw,1.8rem)] font-medium leading-[1.12] tracking-[-0.03em] max-720:text-2xl">
              {item.title}
            </h3>
            <p className="mt-[14px] text-[13.5px] leading-[1.65] text-ink-2">{item.description}</p>
            <ul className="mt-[22px] grid gap-[10px] border-t border-line pt-5 max-940:grid-cols-2 max-940:gap-x-6 max-940:gap-y-[10px] max-720:grid-cols-1">
              {item.bullets.map((bullet) => (
                <li
                  key={bullet}
                  className="grid grid-cols-[12px_1fr] items-start gap-[10px] text-[13px] leading-[1.55] text-[#b8b8b8]"
                >
                  <span
                    className="mt-[7px] size-[5px] rotate-45 border border-[#777] bg-[#1a1a1a]"
                    aria-hidden="true"
                  />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            <TextLink href={item.href} external className="mt-6">
              Read the {item.label} docs
            </TextLink>
            <p className="mt-5 font-mono text-[11px] tracking-[0.1em] uppercase text-[#585858]">
              Windows Chrome · dark · 1600 × 1000
            </p>
          </div>
        </div>
      ))}

      <p className="sr-only" aria-live="polite">
        <span aria-hidden="true" />
        Showing {active.label}: {active.title}
      </p>
    </div>
  )
}
