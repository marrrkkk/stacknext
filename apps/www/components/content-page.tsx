import type { ReactNode } from 'react'
import { breadcrumbJsonLd } from '@/content/structured-data'
import { JsonLd } from './json-ld'
import { Eyebrow } from './primitives'
import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'
import { contentProseClass, frameClass, skipLinkClass } from './styles'

export interface ContentSection {
  id: string
  label: string
}

export function ContentPage({
  eyebrow,
  title,
  lede,
  updated,
  sections,
  breadcrumb,
  path,
  children,
}: {
  eyebrow: string
  title: string
  lede: string
  updated: string
  sections: readonly ContentSection[]
  breadcrumb: string
  path: string
  children: ReactNode
}): React.ReactElement {
  return (
    <>
      <a className={skipLinkClass} href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <div className={frameClass}>
          <article className="px-pad pt-[clamp(120px,15vh,180px)] pb-[clamp(80px,9vw,120px)] max-560:pt-[118px]">
            <header className="max-w-[900px]">
              <nav
                className="mb-6 font-mono text-[11px] tracking-[0.12em] uppercase text-ink-3"
                aria-label="Breadcrumb"
              >
                <ol className="flex flex-wrap items-center gap-2">
                  <li>
                    <a
                      className="rounded-[3px] transition-colors duration-[160ms] ease-soft hover:text-ink"
                      href="/"
                    >
                      Home
                    </a>
                  </li>
                  <li aria-hidden="true" className="text-ink-4">
                    /
                  </li>
                  <li aria-current="page" className="text-ink-2">
                    {breadcrumb}
                  </li>
                </ol>
              </nav>
              <JsonLd
                data={breadcrumbJsonLd([
                  { name: 'Home', path: '/' },
                  { name: breadcrumb, path },
                ])}
              />
              <Eyebrow>{eyebrow}</Eyebrow>
              <h1 className="mt-[18px] text-balance text-[clamp(2.7rem,6.2vw,5.2rem)] font-[450] leading-[1.02] tracking-[-0.055em] max-560:text-[clamp(2.4rem,11vw,3.4rem)]">
                {title}
              </h1>
              <p className="mt-6 max-w-[66ch] text-pretty text-[clamp(1rem,1.2vw,1.1rem)] leading-[1.62] text-ink-2">
                {lede}
              </p>
              <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
                Last updated {updated}
              </p>
            </header>

            <div className="mt-[clamp(48px,6vw,76px)] grid grid-cols-[minmax(160px,0.28fr)_minmax(0,1fr)] gap-[clamp(36px,6vw,100px)] border-t border-line pt-[clamp(32px,4vw,48px)] max-940:grid-cols-1 max-940:gap-[30px]">
              <nav
                className="sticky top-[calc(var(--header-h)+28px)] self-start max-940:static max-940:rounded-xl max-940:border max-940:border-line max-940:p-[18px]"
                aria-label="On this page"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
                  On this page
                </p>
                <ol className="mt-4 grid gap-[9px] max-940:grid-cols-2 max-940:gap-[10px_18px] max-560:grid-cols-1">
                  {sections.map((section, index) => (
                    <li key={section.id}>
                      <a
                        className="flex gap-[10px] text-[13px] leading-[1.45] text-ink-3 transition-colors duration-[160ms] ease-soft hover:text-ink"
                        href={`#${section.id}`}
                      >
                        <span className="flex-none pt-px font-pixel text-[11px]" aria-hidden="true">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        {section.label}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>

              <div className={`max-w-[780px] ${contentProseClass}`}>{children}</div>
            </div>
          </article>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
