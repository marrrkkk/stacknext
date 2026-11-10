import { FOOTER_GROUPS, LINKS } from '@/content/site'
import { BrandSymbol } from './icons'

export function SiteFooter(): React.ReactElement {
  return (
    <footer className="border-t border-line bg-[#020202]">
      <div className="mx-auto w-frame border-x border-line px-pad pt-[clamp(56px,7vw,84px)] max-720:w-[calc(100%_-_24px)] max-720:pt-12">
        <div className="flex justify-between gap-[clamp(36px,6vw,100px)] max-940:flex-col">
          <div className="flex max-w-[320px] items-start gap-3">
            <span className="grid size-[42px] flex-none place-items-center rounded-[11px] border border-line bg-[#0c0c0c] text-[#d8d8d8]">
              <BrandSymbol size={26} />
            </span>
            <div>
              <p className="text-[14px] font-semibold tracking-[-0.01em]">StackNext</p>
              <p className="mt-[6px] text-[13px] leading-[1.55] text-ink-3">
                Local debugging for Next.js App Router apps.
              </p>
            </div>
          </div>

          <nav
            className="grid grid-cols-[repeat(3,minmax(110px,150px))] gap-[clamp(28px,5vw,64px)] max-940:w-full max-940:grid-cols-3 max-720:grid-cols-2 max-720:gap-x-5 max-720:gap-y-7 max-560:grid-cols-1"
            aria-label="Footer"
          >
            {FOOTER_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-[14px] font-mono text-[11px] tracking-[0.14em] uppercase text-ink-3">
                  {group.label}
                </p>
                <ul className="grid gap-[9px]">
                  {group.links.map((link) => {
                    const external = link.href.startsWith('http')
                    return (
                      <li key={link.label}>
                        <a
                          className="text-[13px] text-ink-2 transition-colors duration-[160ms] ease-soft hover:text-ink"
                          href={link.href}
                          target={external ? '_blank' : undefined}
                          rel={external ? 'noreferrer' : undefined}
                        >
                          {link.label}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div
          className="pointer-events-none mt-[clamp(48px,7vw,84px)] overflow-hidden [mask-image:linear-gradient(180deg,#000_40%,rgba(0,0,0,0.25)_100%)] [-webkit-mask-image:linear-gradient(180deg,#000_40%,rgba(0,0,0,0.25)_100%)] max-720:mt-11"
          aria-hidden="true"
        >
          <img
            className="block h-auto w-full opacity-10 grayscale"
            src="/brand/stacknext-wordmark-white.svg"
            alt=""
            width={1406}
            height={256}
            loading="lazy"
          />
        </div>

        <div className="-mt-[14px] flex items-center justify-between gap-6 border-t border-line py-[22px] pb-[26px] font-mono text-[11px] tracking-[0.08em] uppercase text-ink-3 max-720:mt-0 max-720:flex-col max-720:items-start max-720:gap-[14px] max-720:pb-[30px]">
          <p>MIT licensed · Contributions welcome</p>
          <div className="flex gap-5 [&_a]:transition-colors [&_a]:duration-[160ms] [&_a:hover]:text-ink">
            {[
              { label: 'Privacy', href: LINKS.privacy },
              { label: 'License', href: LINKS.license },
              { label: 'GitHub', href: LINKS.github },
            ].map((link) => {
              const external = link.href.startsWith('http')
              return (
                <a
                  key={link.label}
                  href={link.href}
                  target={external ? '_blank' : undefined}
                  rel={external ? 'noreferrer' : undefined}
                >
                  {link.label}
                </a>
              )
            })}
          </div>
        </div>
      </div>
    </footer>
  )
}
