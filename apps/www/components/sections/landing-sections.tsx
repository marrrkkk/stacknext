import {
  ACCESS_PATHS,
  COMPATIBILITY,
  FAQS,
  INSTALL_COMMANDS,
  LINKS,
  SPECS,
} from '@/content/site'
import { CodeTabs } from '../code-tabs'
import { CopyCommand } from '../copy-command'
import { AccessIcon, ArrowUpRight, LockIcon } from '../icons'
import { PrivacyBoundary } from '../illustrations'
import { RuntimeDiagram } from '../system-diagram'
import { ButtonLink, Eyebrow, LiveDot, SectionHead, TextLink } from '../primitives'
import { sectionClass, sectionCompactClass, sectionShellClass } from '../styles'

const PRODUCT_POINTS = [
  {
    number: '01',
    title: 'Collect',
    body: 'Next.js emits spans for routes, renders and fetches. StackNext picks them up and adds Drizzle or Prisma query events and server errors.',
  },
  {
    number: '02',
    title: 'Correlate',
    body: 'Queries and errors are attached to the request that produced them, so a slow route leads to the span or query inside it.',
  },
  {
    number: '03',
    title: 'Inspect',
    body: 'Open a request in the dashboard and move from route to span to query. The CLI and MCP server read the same data.',
  },
] as const

export function Compatibility(): React.ReactElement {
  return (
    <section className={sectionCompactClass} aria-label="Compatibility">
      <div
        className="mb-4 flex items-baseline justify-between gap-6 max-720:flex-col max-720:items-start max-720:gap-[6px]"
        data-reveal
      >
        <Eyebrow>Works with your existing stack</Eyebrow>
        <p className="text-right text-[12.5px] text-ink-3 max-720:text-left">
          Adapters for Drizzle, Prisma and Playwright are optional.
        </p>
      </div>
      <ul
        className="grid grid-cols-6 border-y border-line max-1040:grid-cols-3 max-720:grid-cols-2"
        data-reveal
      >
        {COMPATIBILITY.map((item) => (
          <li
            key={item.label}
            className="flex flex-col gap-1 border-r border-line px-[18px] py-[17px] last:border-r-0 max-1040:[&:nth-child(3)]:border-r-0 max-1040:[&:nth-child(-n+3)]:border-b max-1040:[&:nth-child(-n+3)]:border-line max-720:border-b max-720:border-line max-720:p-[14px] max-720:[&:nth-child(2n)]:border-r-0 max-720:[&:nth-last-child(-n+2)]:border-b-0"
          >
            <span className="whitespace-nowrap text-[13.5px] font-medium text-[#d6d6d6] max-720:text-[13px] max-560:whitespace-normal">
              {item.label}
            </span>
            <small className="font-mono text-[11px] tracking-[0.11em] uppercase text-ink-3">
              {item.note}
            </small>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Product(): React.ReactElement {
  return (
    <section className={sectionClass} id="product" aria-labelledby="product-title">
      <SectionHead
        label="01 / How it works"
        id="product-title"
        title={
          <>
            Follow one request
            <br />
            through the stack.
          </>
        }
        lede="Next.js already emits the spans. StackNext adds query events and errors, then ties everything to the request that produced it. The result is a fixed-size sample that stays in memory."
      />

      <div className="flow-root" data-reveal>
        <RuntimeDiagram />
      </div>

      <div
        className="mt-[clamp(30px,4vw,46px)] grid grid-cols-3 border-t border-line max-860:grid-cols-1"
        data-reveal
      >
        {PRODUCT_POINTS.map((point) => (
          <article
            key={point.number}
            className="pr-8 pt-6 [&+&]:border-l [&+&]:border-line [&+&]:pl-8 max-1040:pr-[22px] max-1040:[&+&]:pl-[22px] max-860:py-5 max-860:pr-0 max-860:[&+&]:border-l-0 max-860:[&+&]:border-t max-860:[&+&]:border-line max-860:[&+&]:pl-0"
          >
            <span className="mb-[18px] block font-pixel text-[12px] tracking-[0.08em] text-ink-3 max-860:mb-[10px]">
              {point.number}
            </span>
            <h3 className="text-[17px] font-medium tracking-[-0.015em]">{point.title}</h3>
            <p className="mt-2 max-w-[42ch] text-[13.5px] leading-[1.6] text-ink-2">{point.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export function Masthead(): React.ReactElement {
  return (
    <section className={sectionClass} aria-labelledby="system-title">
      <div
        className="flex items-center justify-between gap-6 max-720:flex-col max-720:items-start max-720:gap-3"
        data-reveal
      >
        <Eyebrow>02 / System</Eyebrow>
        <div className="flex flex-wrap items-center gap-[18px] font-mono text-[11px] tracking-[0.12em] uppercase text-ink-3 max-720:gap-3 max-560:[&_span_span]:hidden">
          <LiveDot label="One Node process" />
          <span className="max-560:hidden">127.0.0.1:4400</span>
          <span className="max-560:hidden">Memory only</span>
          <span className="max-560:hidden">Files under .stacknext</span>
        </div>
      </div>

      <div
        className="mt-[clamp(30px,5vw,62px)] mb-[clamp(34px,5vw,64px)] max-720:mt-[30px] max-720:mb-[34px]"
        data-reveal
      >
        <img
          className="mx-auto block h-auto w-full max-w-[1406px]"
          src="/brand/stacknext-wordmark-white.svg"
          alt="StackNext"
          width={1406}
          height={256}
        />
      </div>

      <div className="max-940:gap-[22px] grid grid-cols-2 items-start gap-[clamp(28px,5vw,80px)] border-t border-line pt-[clamp(28px,4vw,46px)] max-940:grid-cols-1">
        <h2
          className="max-w-[18ch] text-balance text-[clamp(1.7rem,2.6vw,2.45rem)] font-medium leading-[1.12] tracking-[-0.03em] max-940:max-w-[24ch]"
          id="system-title"
          data-reveal
        >
          The collector is one Node process.
        </h2>
        <p
          className="max-w-[54ch] text-pretty text-[clamp(0.94rem,1.1vw,1.02rem)] leading-[1.65] text-ink-2"
          data-reveal
        >
          It listens on loopback, keeps a fixed-size window in memory, and writes runs,
          baselines, comparisons and snapshots under .stacknext. There is no backend to
          deploy.
        </p>
      </div>

      <dl className="mt-[clamp(38px,5vw,58px)] border-t border-line" data-reveal>
        {SPECS.map((spec) => (
          <div
            className="grid grid-cols-[minmax(140px,0.34fr)_minmax(0,1fr)] gap-6 border-b border-line py-[15px] max-720:grid-cols-1 max-720:gap-[5px] max-720:py-[13px]"
            key={spec.label}
          >
            <dt className="font-mono text-[11px] tracking-[0.14em] uppercase text-ink-3">
              {spec.label}
            </dt>
            <dd className="justify-self-end text-right text-[13.5px] text-[#d0d0d0] max-720:justify-self-start max-720:text-left">
              {spec.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function Access(): React.ReactElement {
  return (
    <section className={sectionClass} aria-labelledby="access-title">
      <SectionHead
        label="03 / Access"
        id="access-title"
        title={
          <>
            Read it where
            <br />
            you work.
          </>
        }
        lede="The dashboard, CLI and MCP server all read the same local sample. Start in the browser, script a check, or hand the data to your coding agent."
      />

      <div className="grid grid-cols-3 gap-[14px] max-940:grid-cols-1" data-reveal>
        {ACCESS_PATHS.map((item) => {
          const external = item.href.startsWith('http')
          return (
            <a
              key={item.number}
              className="group flex min-h-[330px] flex-col rounded-frame border border-line bg-[#090909] bg-[linear-gradient(180deg,rgba(255,255,255,0.025),transparent_60%)] p-[26px] transition-[border-color,background,transform] duration-[220ms] ease-soft hover:-translate-y-[3px] hover:border-line-2 hover:bg-[#0c0c0c] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.045),transparent_60%)] max-1240:p-[22px] max-940:min-h-0"
              href={item.href}
              target={external ? '_blank' : undefined}
              rel={external ? 'noreferrer' : undefined}
            >
              <div className="flex items-start justify-between gap-4">
                <span className="font-pixel text-[12px] tracking-[0.08em] text-ink-3">
                  {item.number}
                </span>
                <span className="grid size-[38px] place-items-center rounded-full border border-line-2 bg-[#0e0e0e] text-[#cfcfcf]">
                  <AccessIcon name={item.icon} width={18} height={18} />
                </span>
              </div>
              <h3 className="mt-[52px] text-[22px] font-medium tracking-[-0.025em] max-940:mt-[30px] max-560:mt-6 max-560:text-[20px]">
                {item.title}
              </h3>
              <p className="mt-[10px] flex-1 text-[13.5px] leading-[1.6] text-ink-2">
                {item.description}
              </p>
              <code className="mt-5 inline-block w-fit rounded-[7px] border border-line bg-[#111] px-[9px] py-[7px] text-[12px] text-[#c4c4c4]">
                {item.command}
              </code>
              <span className="mt-[22px] inline-flex items-center gap-[5px] text-[13px] font-medium text-[#d4d4d4]">
                {item.linkLabel}
                <ArrowUpRight
                  className="transition-transform duration-[180ms] ease-soft group-hover:translate-x-[2px] group-hover:-translate-y-[2px]"
                  width={13}
                  height={13}
                  aria-hidden
                />
              </span>
            </a>
          )
        })}
      </div>
    </section>
  )
}

export function Setup(): React.ReactElement {
  return (
    <section className={sectionClass} id="install" aria-labelledby="setup-title">
      <SectionHead
        label="05 / Install"
        id="setup-title"
        title={
          <>
            Add it to your app.
            <br />
            Keep your instrumentation.
          </>
        }
        lede="Three commands from install to a live request sample."
      />

      <div
        className="grid grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] items-start gap-[clamp(28px,4vw,64px)] max-940:grid-cols-1 max-940:gap-8"
        data-reveal
      >
        <div className="min-w-0">
          <ol
            className="border-t border-line [&>li]:grid [&>li]:grid-cols-[42px_minmax(0,1fr)] [&>li]:gap-4 [&>li]:border-b [&>li]:border-line [&>li]:py-[22px] max-560:[&>li]:grid-cols-[32px_minmax(0,1fr)] max-560:[&>li]:gap-[10px]"
          >
            <li>
              <span className="pt-[2px] font-pixel text-[11px] tracking-[0.08em] text-ink-3">
                01
              </span>
              <div>
                <h3 className="text-[16.5px] font-medium tracking-[-0.015em]">Install the packages</h3>
                <p className="mt-[6px] text-[13px] leading-[1.6] text-ink-2">
                  Run this inside the Next.js app, not at the workspace root.
                </p>
                <code className="mt-[10px] block w-fit rounded-[7px] border border-line bg-[#101010] px-[9px] py-[6px] text-[12.5px] text-[#c6c6c6]">
                  npm install --save-dev @stacknext/cli @stacknext/next
                </code>
              </div>
            </li>
            <li>
              <span className="pt-[2px] font-pixel text-[11px] tracking-[0.08em] text-ink-3">
                02
              </span>
              <div>
                <h3 className="text-[16.5px] font-medium tracking-[-0.015em]">Run init</h3>
                <p className="mt-[6px] text-[13px] leading-[1.6] text-ink-2">
                  <code className="rounded-[4px] border border-line bg-[#101010] px-1 py-px text-[12.5px] text-[#c6c6c6]">
                    init
                  </code>{' '}
                  writes{' '}
                  <code className="rounded-[4px] border border-line bg-[#101010] px-1 py-px text-[12.5px] text-[#c6c6c6]">
                    stacknext.config.json
                  </code>{' '}
                  and creates{' '}
                  <code className="rounded-[4px] border border-line bg-[#101010] px-1 py-px text-[12.5px] text-[#c6c6c6]">
                    instrumentation.ts
                  </code>{' '}
                  if it doesn&apos;t exist.
                </p>
                <code className="mt-[10px] block w-fit rounded-[7px] border border-line bg-[#101010] px-[9px] py-[6px] text-[12.5px] text-[#c6c6c6]">
                  npx stacknext init
                </code>
              </div>
            </li>
            <li>
              <span className="pt-[2px] font-pixel text-[11px] tracking-[0.08em] text-ink-3">
                03
              </span>
              <div>
                <h3 className="text-[16.5px] font-medium tracking-[-0.015em]">Start the collector</h3>
                <p className="mt-[6px] text-[13px] leading-[1.6] text-ink-2">
                  <code className="rounded-[4px] border border-line bg-[#101010] px-1 py-px text-[12.5px] text-[#c6c6c6]">
                    dev
                  </code>{' '}
                  starts the collector, runs your app&apos;s dev script, and writes a
                  short-lived token to{' '}
                  <code className="rounded-[4px] border border-line bg-[#101010] px-1 py-px text-[12.5px] text-[#c6c6c6]">
                    .stacknext/run.json
                  </code>{' '}
                  with mode{' '}
                  <code className="rounded-[4px] border border-line bg-[#101010] px-1 py-px text-[12.5px] text-[#c6c6c6]">
                    0600
                  </code>
                  .
                </p>
                <code className="mt-[10px] block w-fit rounded-[7px] border border-line bg-[#101010] px-[9px] py-[6px] text-[12.5px] text-[#c6c6c6]">
                  npx stacknext dev
                </code>
              </div>
            </li>
          </ol>

          <div className="mt-[22px] flex items-start gap-3 rounded-[12px] border border-line bg-[#0a0a0a] p-4 text-ink-2 [&_p]:mt-[6px] [&_p]:text-[13px] [&_p]:leading-[1.6] [&_strong]:font-medium [&_strong]:text-[#dedede] [&_svg]:mt-px [&_svg]:flex-none [&_svg]:text-[#9b9b9b]">
            <LockIcon width={18} height={18} />
            <p>
              <strong>init never overwrites an existing instrumentation file.</strong> If
              another monitor already owns it, add StackNext inside it.
            </p>
          </div>

          <TextLink href={LINKS.quickstart} external className="mt-6">
            Read the quickstart
          </TextLink>
        </div>

        <CodeTabs />
      </div>
    </section>
  )
}

const PRIVACY_POINTS = [
  'Collector binds to 127.0.0.1 or localhost. Other hosts are rejected.',
  'Ingest needs a bearer token. The token file is mode 0600.',
  'URLs keep the path. Sensitive keys become [redacted].',
  'No bodies, headers, cookies, query values, fragments or SQL bind parameters.',
  'The store has fixed capacity and retention, and drop counters show when it fills.',
  'Snapshots are frozen local files. Playwright screenshots and trace archives are never stored.',
  'No cloud client, account, analytics or AI provider.',
] as const

export function Privacy(): React.ReactElement {
  return (
    <section className={sectionClass} id="privacy" aria-labelledby="privacy-title">
      <SectionHead
        label="06 / Privacy"
        id="privacy-title"
        title={
          <>
            What gets captured,
            <br />
            and what doesn&apos;t.
          </>
        }
        lede="The collector listens on loopback and requires a token for writes. Bodies, headers, cookies, query values and SQL bind parameters are dropped before anything is stored."
      />

      <div
        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)] items-start gap-[clamp(28px,3vw,48px)] max-1180:grid-cols-1 max-1180:gap-8"
        data-reveal
      >
        <div className="max-w-[620px] pt-[6px]">
          <span className="block font-mono text-[11px] tracking-[0.14em] uppercase text-ink-3">
            01 / Boundary
          </span>
          <h3 className="mt-4 text-balance text-[clamp(1.45rem,2vw,1.8rem)] font-medium leading-[1.12] tracking-[-0.03em] max-720:text-[1.5rem]">
            The short version.
          </h3>
          <p className="mt-[14px] text-[13.5px] leading-[1.65] text-ink-2">
            Request data is redacted in your app process, then again in the collector. Only
            the redacted result reaches the in-memory store.
          </p>
          <ul className="mt-[22px] grid gap-[10px] border-t border-line pt-5">
            {PRIVACY_POINTS.map((point) => (
              <li
                key={point}
                className="grid grid-cols-[12px_1fr] items-start gap-[10px] text-[13px] leading-[1.55] text-[#b8b8b8]"
              >
                <span
                  className="mt-[7px] size-[5px] rotate-45 border border-[#777] bg-[#1a1a1a]"
                  aria-hidden="true"
                />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <TextLink href={LINKS.privacy} className="mt-6">
            Read the privacy model
          </TextLink>
          <p className="mt-5 font-mono text-[11px] tracking-[0.1em] uppercase text-[#585858]">
            Loopback · token 0600 · two redaction passes
          </p>
        </div>

        <div className="grid min-w-0 max-720:min-h-0">
          <PrivacyBoundary />
        </div>
      </div>
    </section>
  )
}

export function Faq(): React.ReactElement {
  return (
    <section className={sectionClass} id="faq" aria-labelledby="faq-title">
      <SectionHead
        label="07 / FAQ"
        id="faq-title"
        title={
          <>
            Before you
            <br />
            install.
          </>
        }
        lede="Short answers about the supported stack, privacy and what StackNext leaves out."
      />

      <div
        className="grid grid-cols-[minmax(0,0.62fr)_minmax(0,1.38fr)] items-start gap-[clamp(28px,5vw,80px)] max-940:grid-cols-1 max-940:gap-8"
        data-reveal
      >
        <div>
          <p className="max-w-[30ch] text-[13px] leading-[1.65] text-ink-2">
            Still deciding? The limitations page covers the supported stack, how long
            data is kept and known gaps.
          </p>
          <TextLink href={LINKS.limitations} className="mt-[18px]">
            Read limitations
          </TextLink>
        </div>

        <div className="border-t border-line">
          {FAQS.map((item, index) => (
            <details className="group border-b border-line" key={item.question} name="stacknext-faq">
              <summary className="grid cursor-pointer list-none grid-cols-[34px_minmax(0,1fr)_18px] items-center gap-3 py-5 text-[15.5px] font-medium tracking-[-0.01em] text-[#dedede] transition-colors duration-[160ms] ease-soft hover:text-white [&::-webkit-details-marker]:hidden max-720:grid-cols-[26px_minmax(0,1fr)_18px] max-720:py-[17px] max-720:text-[14.5px] max-560:text-[14px]">
                <span className="font-mono text-[11px] tracking-[0.08em] text-ink-3">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>{item.question}</span>
                <span className="relative size-3 justify-self-end" aria-hidden="true">
                  <i className="absolute top-1/2 left-0 h-px w-3 bg-[#8a8a8a] transition-transform duration-[260ms] ease-soft" />
                  <i className="absolute top-1/2 left-0 h-px w-3 rotate-90 bg-[#8a8a8a] transition-transform duration-[260ms] ease-soft group-open:rotate-0" />
                </span>
              </summary>
              <p className="max-w-[72ch] animate-[faq-in_280ms_var(--ease-soft)_both] px-10 pb-[22px] pl-[46px] pt-0 text-[13.5px] leading-[1.65] text-ink-2 max-720:px-7 max-720:pb-[18px] max-720:pl-[38px] max-720:text-[13px]">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Cta(): React.ReactElement {
  return (
    <section
      className={`${sectionShellClass} overflow-hidden pt-[clamp(110px,14vw,180px)] pb-[clamp(110px,14vw,180px)] text-center max-720:pt-24 max-720:pb-24`}
      id="start"
      aria-labelledby="cta-title"
    >
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 h-[620px] w-[min(1000px,92%)] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse_at_50%_50%,rgba(255,255,255,0.07),rgba(255,255,255,0.015)_45%,transparent_68%)]"
        aria-hidden="true"
      />
      <div className="relative z-[1] mx-auto max-w-[900px]" data-reveal>
        <Eyebrow>08 / Start</Eyebrow>
        <h2
          className="mt-5 text-balance text-[clamp(2.6rem,5.4vw,5rem)] font-medium leading-[1.02] tracking-[-0.052em] max-720:text-[clamp(2.5rem,10.8vw,3.6rem)]"
          id="cta-title"
        >
          Run it on your
          <br />
          next request.
        </h2>
        <p className="mt-5 text-[15px] text-ink-2">
          Install the packages, run init, then start your app with stacknext dev. No account
          or API key.
        </p>
        <CopyCommand
          className="max-720:mt-7"
          value={INSTALL_COMMANDS.npm}
          label="Copy install command"
        />
        <div className="mt-7 flex flex-wrap justify-center gap-[10px] max-560:flex-col max-560:items-stretch">
          <ButtonLink
            href={LINKS.quickstart}
            external
            icon="arrow-up-right"
            className="max-560:w-full"
          >
            Read the quickstart
          </ButtonLink>
          <ButtonLink
            href={LINKS.github}
            external
            variant="secondary"
            icon="github"
            className="max-560:w-full"
          >
            View on GitHub
          </ButtonLink>
        </div>
      </div>
    </section>
  )
}
