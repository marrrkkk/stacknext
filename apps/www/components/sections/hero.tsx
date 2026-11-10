import { BrandSymbol } from '../icons'
import { InstallCommand } from '../install-command'
import { Eyebrow, ProductFrame, Screenshot } from '../primitives'

export function Hero(): React.ReactElement {
  return (
    <section
      className="relative overflow-hidden px-pad pt-[clamp(148px,17vh,196px)] pb-[clamp(64px,7vw,96px)] text-center before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(rgba(255,255,255,0.11)_1px,transparent_1px)] before:bg-[length:26px_26px] before:opacity-[0.32] before:content-[''] before:[mask-image:radial-gradient(ellipse_58%_52%_at_50%_16%,#000_0%,transparent_72%)] before:[-webkit-mask-image:radial-gradient(ellipse_58%_52%_at_50%_16%,#000_0%,transparent_72%)] max-1040:pt-[clamp(132px,15vh,170px)] max-720:pt-[118px] max-720:pb-14"
      id="top"
      aria-labelledby="hero-title"
    >
      <div
        className="pointer-events-none absolute -top-[260px] left-1/2 h-[900px] w-[min(1200px,96%)] -translate-x-1/2 bg-[radial-gradient(ellipse_at_50%_32%,rgba(255,255,255,0.085),rgba(255,255,255,0.02)_42%,transparent_68%)]"
        aria-hidden="true"
      />
      <div className="relative z-[1] mx-auto max-w-[1120px]">
        <span
          className="mx-auto mb-6 grid size-14 animate-[rise_700ms_var(--ease-soft)_both_60ms] place-items-center rounded-[16px] border border-line-2 bg-[linear-gradient(180deg,#161616,#0a0a0a)] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_18px_50px_rgba(0,0,0,0.6)] max-720:mb-5 max-720:size-12"
          aria-hidden="true"
        >
          <BrandSymbol className="max-720:size-[29px]" size={34} />
        </span>
        <Eyebrow className="animate-[rise_700ms_var(--ease-soft)_both_130ms] max-560:text-[11px] max-560:tracking-[0.13em]">
          Open source · MIT
        </Eyebrow>
        <h1
          className="mx-auto mt-5 animate-[rise_820ms_var(--ease-soft)_both_190ms] text-balance text-[clamp(3.25rem,7.3vw,7rem)] font-[450] leading-[1.02] tracking-[-0.055em] max-720:mt-4 max-720:text-[clamp(2.85rem,11.4vw,4.5rem)] max-720:tracking-[-0.05em] max-560:text-[clamp(2.55rem,12.4vw,3.6rem)]"
          id="hero-title"
        >
          <span className="block">Debug Next.js requests</span>
          <span className="block bg-[linear-gradient(180deg,#ededed_12%,#7e7e7e_100%)] bg-clip-text text-transparent [-webkit-text-fill-color:transparent]">
            on your machine.
          </span>
        </h1>
        <p className="mx-auto mt-[26px] max-w-[690px] animate-[rise_820ms_var(--ease-soft)_both_270ms] text-pretty text-[clamp(1rem,1.24vw,1.14rem)] leading-[1.58] text-[#a6a6a6] max-720:mt-5 max-720:text-[15px] max-560:text-[14.5px]">
          StackNext collects the spans Next.js already emits, plus Drizzle and Prisma query
          events and server errors. Follow any request through the dashboard, CLI or a
          read-only MCP server.
        </p>
        <InstallCommand />
      </div>

      <div className="relative z-[1] mx-auto mt-[clamp(56px,7vw,92px)] max-w-[1280px] animate-[rise_1050ms_var(--ease-soft)_both_470ms] max-720:mt-12">
        <ProductFrame
          label="StackNext / Overview"
          meta={null}
          className="shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_50px_140px_rgba(0,0,0,0.8),0_0_90px_rgba(255,255,255,0.025)]!"
        >
          <Screenshot
            base="overview"
            alt="StackNext overview dashboard showing requests, latency, database activity, errors and diagnostics from the example app"
            priority
          />
        </ProductFrame>
      </div>
    </section>
  )
}
