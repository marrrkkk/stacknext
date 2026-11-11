import type { Metadata } from 'next'
import { ContentPage } from '@/components/content-page'
import { contentNoteClass } from '@/components/styles'
import { pageMetadata } from '@/content/metadata'
import { LINKS } from '@/content/site'
import { POLICY_UPDATED, formatUpdatedDate } from '@/content/updates'

export const metadata: Metadata = pageMetadata({
  title: 'Limitations',
  description:
    'The intentional boundaries of StackNext telemetry, diagnostics, regression evidence, snapshots and coding-agent support.',
  path: '/limitations',
})

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'runtime', label: 'Runtime and framework' },
  { id: 'tracing', label: 'Trace coverage' },
  { id: 'coverage', label: 'Instrumentation coverage' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'regression', label: 'Regression testing' },
  { id: 'snapshots', label: 'Saved snapshots' },
  { id: 'databases', label: 'Databases' },
  { id: 'storage', label: 'Storage and scale' },
  { id: 'privacy', label: 'Privacy and security' },
  { id: 'agents', label: 'Coding agents' },
  { id: 'operations', label: 'Operations' },
] as const

export default function LimitationsPage(): React.ReactElement {
  return (
    <ContentPage
      eyebrow="Product / Limitations"
      title="What StackNext does not do."
      lede="StackNext is a local development tool, not a production APM. These are intentional boundaries, not claims of completeness. Read them before treating a sample, finding or comparison as proof."
      updated={formatUpdatedDate(POLICY_UPDATED)}
      sections={SECTIONS}
      breadcrumb="Limitations"
      path="/limitations"
    >
      <section id="overview">
        <h2>Start here</h2>
        <p>
          StackNext observes the current in-memory sample and reports evidence from it. It
          does not have a historical database, a production deployment model or a model of
          your source code. A missing signal is not proof that a feature is broken, and a
          finding is not a confirmed root cause.
        </p>
        <p className={contentNoteClass}>
          The canonical boundary list lives in the{' '}
          <a href={LINKS.limitationsSource} target="_blank" rel="noreferrer">
            limitations documentation
          </a>
          . This page summarises the limits that matter most when interpreting a sample.
        </p>
      </section>

      <section id="runtime">
        <h2>Runtime and framework</h2>
        <ul>
          <li>
            <strong>Node.js runtime only.</strong> Edge runtime and middleware running on
            Edge are not supported.
          </li>
          <li>
            <strong>Next.js 15 and 16, App Router only.</strong> The Pages Router is not
            supported. Run <code>stacknext doctor</code> to confirm your local setup.
          </li>
          <li>
            <strong>Development use only.</strong> There is no multi-user authentication,
            TLS, clustering or production hardening. Do not expose the collector or
            dashboard to a network.
          </li>
          <li>
            <strong>No browser tracing.</strong> Server-side Next.js spans and database
            events are in scope. Client-side React renders and browser performance are not.
          </li>
          <li>
            <strong>No source maps, replay or profiling.</strong> Stacks point at server
            build output. Requests cannot be replayed, and bodies are never captured.
          </li>
          <li>
            <strong>OpenTelemetry SDK packages stay on 2.12.</strong> StackNext keeps the
            SDK on the 2.x line while its Node.js floor is 20.9. Upstream marks these
            packages deprecated in favour of SDK 3, which requires Node.js 22.15 or newer.
          </li>
        </ul>
      </section>

      <section id="tracing">
        <h2>Trace coverage</h2>
        <ul>
          <li>
            Span coverage is limited to documented Next.js telemetry. StackNext does not
            patch undocumented internals or use <code>NEXT_PRIVATE_*</code> settings.
          </li>
          <li>
            Server Components are not traced individually. Route and render spans from
            Next.js are captured instead. <code>withStackNextSpan</code> measures only the
            work you wrap.
          </li>
          <li>
            Server Actions are not automatically identified by name. Successful actions
            are visible only when wrapped with <code>withStackNextAction</code>; failures
            may still appear through <code>onRequestError</code>.
          </li>
          <li>
            Custom application spans exist only where a manual helper is used. StackNext
            does not infer application functions or database drivers automatically.
          </li>
          <li>
            Fetch spans depend on Next.js instrumentation and are filtered when{' '}
            <code>instrumentation.captureFetch</code> is <code>false</code>.
          </li>
          <li>
            <code>NEXT_OTEL_VERBOSE=1</code> adds documented Next.js span types, but it
            still does not expose per-component or per-action names. It increases span
            volume and dev-server work.
          </li>
          <li>
            A trace is only as complete as the spans Next.js sends. Spans that arrive after
            retention or after a restart may be missing; missing parents are reported, not
            silently repaired.
          </li>
          <li>
            Error correlation uses the active span when available. Otherwise it falls back
            to route, method and a 30-second window, so ambiguous matches can remain
            uncorrelated or link to the wrong request.
          </li>
        </ul>
      </section>

      <section id="coverage">
        <h2>Instrumentation coverage</h2>
        <ul>
          <li>
            Coverage is computed from the current in-memory retention window, not a
            historical database or build-time analysis. Restarting the collector changes
            the result.
          </li>
          <li>
            There is no percentage or composite score. Features are independent and
            workload-dependent; one number would be misleading.
          </li>
          <li>
            <code>observed</code> proves matching evidence was present.{' '}
            <code>not-observed</code> and <code>unknown</code> do not prove a feature is
            broken; the sample may simply not have exercised it.
          </li>
          <li>
            Configuration flags are intent only. Setting <code>database.drizzle: true</code>{' '}
            does not register the Drizzle logger, and <code>database.prisma: true</code>{' '}
            does not attach the Prisma event handler.
          </li>
          <li>
            The coverage catalog can change between releases as supported Next.js span
            types change. Treat the current item list and these limitations as part of the
            result.
          </li>
        </ul>
      </section>

      <section id="diagnostics">
        <h2>Diagnostics</h2>
        <ul>
          <li>
            <strong>Findings are heuristics, not confirmed root causes.</strong>{' '}
            <code>possible</code> means the pattern is consistent with a problem;{' '}
            <code>observed</code> means the measurement exists. Neither proves why the app
            behaves that way.
          </li>
          <li>
            The current sample is the whole input. Findings can appear, disappear or change
            as telemetry ages out or new requests arrive.
          </li>
          <li>
            The report is capped. <code>diagnostics.maxFindings</code> defaults to 100, and
            evidence arrays are bounded. A capped report is not a complete inventory.
          </li>
          <li>
            N+1 is a SQL-shape signal. StackNext cannot see the calling code, prove a loop
            or recover bind parameters, and a batched query can still repeat for unrelated
            reasons.
          </li>
          <li>
            Slow requests and slow spans are different signals. Slow-span findings use self
            time and are suppressed when the request already exceeds{' '}
            <code>slowRequestMs</code>. Do not add overlapping span durations together.
          </li>
          <li>
            Detached traces are excluded. Spans without an attributable request root are
            noted in sample-integrity metadata instead of being guessed into a request.
          </li>
          <li>
            Repeated HTTP is endpoint-shape based. StackNext cannot tell an intentional
            retry from independent calls or a missing cache.
          </li>
          <li>
            A 5xx status is not a root cause. The app may have returned it intentionally,
            the error hook may not have run, or the error record may have aged out.
          </li>
          <li>
            No source or SQL execution. StackNext does not read source files, run SQL or{' '}
            <code>EXPLAIN</code>, inspect indexes, replay requests, edit code or provide
            index advice.
          </li>
        </ul>
      </section>

      <section id="regression">
        <h2>Regression testing</h2>
        <ul>
          <li>
            <strong>Playwright is the only supported runner.</strong> The fixture is
            optional and active only inside <code>stacknext capture</code>. Running{' '}
            <code>playwright test</code> directly does not capture or compare anything.
          </li>
          <li>
            <strong>Captured runs require one worker.</strong> Parallel correlation is not
            supported until it is explicitly documented and tested.
          </li>
          <li>
            <strong>Correlation is exact or incomplete.</strong> A sample is verified only
            when the collector finds the injected trace and a server span parented to the
            injected span id. There is no time-window or nearest-request fallback.
          </li>
          <li>
            Scenario identity depends on the explicit <code>stacknext</code> annotation or
            a stable test id. Changing it creates a new scenario with no baseline.
          </li>
          <li>
            A comparison needs enough verified samples. The default minimum is three per
            side; failed, skipped or interrupted samples without telemetry block a verdict.
          </li>
          <li>
            <strong>Comparisons are deterministic heuristics, not statistics.</strong>{' '}
            Medians and explicit thresholds produce <code>improved</code>,{' '}
            <code>regressed</code>, <code>unchanged</code> or <code>inconclusive</code>.
            StackNext does not compute p-values, confidence intervals or prove causality.
          </li>
          <li>
            <code>unchanged</code> is not proof of no change. <code>improved</code> is not
            automatically good: fewer spans or queries can mean missing instrumentation or
            skipped work.
          </li>
          <li>
            Environment mismatches are inconclusive by default. <code>--ignore-environment</code>{' '}
            computes a result with a warning but does not make environments equivalent.
          </li>
          <li>
            Null durations stay unmeasured. Drizzle query durations are <code>null</code>,
            never zero, and a metric with null evidence is reported as inconclusive.
          </li>
          <li>
            Structural changes are conservative. Changed trace, span or query shapes
            normally make a scenario inconclusive even when a regression metric is reported.
          </li>
          <li>
            Report-only by default. <code>compare</code> succeeds unless{' '}
            <code>--fail-on regression</code>, <code>--fail-on inconclusive</code> or{' '}
            <code>--fail-on any</code> matches.
          </li>
          <li>
            No browser artifacts. Screenshots, video and Playwright trace archives are
            never read or stored.
          </li>
          <li>
            Baselines are portable only across matching environments. A baseline captured
            on another OS, Node.js, Next.js or instrumentation setup is not a valid
            reference.
          </li>
        </ul>
      </section>

      <section id="snapshots">
        <h2>Saved snapshots</h2>
        <ul>
          <li>
            <strong>A snapshot is a frozen copy, not live state.</strong> It never updates.
            Do not describe a snapshot finding as current behavior without checking the
            live sample.
          </li>
          <li>
            Snapshots intentionally exclude diagnostics and coverage. Re-run diagnostics
            against the live sample if needed.
          </li>
          <li>
            Automatic snapshots are best effort. Exit snapshots need a graceful shutdown
            and a non-empty sample; error snapshots respect a 60-second cooldown. A crash
            or full disk can skip a save.
          </li>
          <li>
            Rotation only affects automatic snapshots. <code>snapshots.autoKeep</code>{' '}
            defaults to 10; manual and imported snapshots accumulate until deleted.
          </li>
          <li>
            Oversized snapshots fail. Each is capped at 64 MiB, and StackNext does not
            truncate silently.
          </li>
          <li>
            Import is not a trust-boundary bypass. Imported exports are re-normalized and
            re-redacted, and must match the versioned schema.
          </li>
          <li>
            Snapshots are local files. They contain redacted routes, error text, SQL
            fragments, attributes and timings. Review them before sharing.
          </li>
        </ul>
      </section>

      <section id="databases">
        <h2>Databases</h2>
        <ul>
          <li>
            Drizzle Logger does not expose query duration. Duration is <code>null</code>,
            never zero, and the UI and MCP mark it as unmeasured.
          </li>
          <li>
            Drizzle parameters are counted, not captured. This is intentional.
          </li>
          <li>
            Prisma requires event-based query logging. Without{' '}
            <code>{`log: [{ emit: 'event', level: 'query' }]`}</code> and{' '}
            <code>instrumentPrismaClient(prisma)</code>, no query events arrive.
          </li>
          <li>
            Prisma durations come from Prisma&apos;s query event and reflect its reported
            duration, not a StackNext timer.
          </li>
          <li>
            Query text is redacted, but literal secrets embedded directly in SQL can
            survive if they do not match a known pattern. Use bind parameters.
          </li>
        </ul>
      </section>

      <section id="storage">
        <h2>Storage and scale</h2>
        <ul>
          <li>
            Telemetry is in memory only and disappears when <code>stacknext dev</code>{' '}
            exits. <code>export</code> and saved snapshots are the persistence paths.
          </li>
          <li>
            Regression records and snapshots are explicit JSON files under{' '}
            <code>.stacknext</code>. They survive restarts, are never uploaded and are not
            pruned automatically unless they are automatic snapshots.
          </li>
          <li>
            The store is bounded. When full, the oldest spans, errors and queries are
            dropped. Drops are counted but not recoverable.
          </li>
          <li>
            Default retention is 10 minutes. Older data is pruned even if capacity is
            available.
          </li>
          <li>
            There is no sampling UI or tail-based sampling. The transport and collector
            accept all spans until their bounds are hit.
          </li>
          <li>
            Ingest payloads are capped at 2 MiB, with 500 spans, 25 errors and 100 queries
            per envelope.
          </li>
          <li>
            SSE is intended for one local dashboard. More than 50 concurrent streams are
            rejected.
          </li>
          <li>
            Only one collector is supported per app directory. Port fallback tries up to 25
            ports after the configured one.
          </li>
        </ul>
      </section>

      <section id="privacy">
        <h2>Privacy and security</h2>
        <ul>
          <li>
            Redaction is pattern-based and best effort, not a formal data-loss prevention
            system. Review exports and snapshots before sharing them.
          </li>
          <li>
            Any process or agent that can read your user&apos;s files can read the bearer
            token in <code>.stacknext/run.json</code>.
          </li>
          <li>
            The collector uses plain HTTP over loopback, not HTTPS. Host, Origin and
            Sec-Fetch checks and a CSP reduce browser-based attacks but do not make an
            untrusted machine safe.
          </li>
          <li>
            MCP data is available to whichever client you connect. That client may log or
            transmit tool results under its own policy.
          </li>
          <li>
            The dashboard session cookie is <code>HttpOnly</code> and{' '}
            <code>SameSite=Strict</code> but is not marked <code>Secure</code> because the
            local collector uses HTTP.
          </li>
        </ul>
      </section>

      <section id="agents">
        <h2>Coding agents</h2>
        <ul>
          <li>
            Client support varies. Prompts, structured content, output schemas and Agent
            Skills are optional protocol features; a client may call tools without showing
            prompts or loading the skill.
          </li>
          <li>
            A connected server is not a successful investigation. A model can ignore tools,
            overstate a fallback correlation or misread an unmeasured duration.
          </li>
          <li>
            Skill discovery is client-specific. Installing the skill does not configure
            MCP, and configuring MCP does not install the skill.
          </li>
          <li>
            No AI key or hosted model is bundled. The chosen client may require its own
            account, and its retention and logging policies apply to tool results.
          </li>
          <li>
            Compatibility is tested, not universal. The versions in the agent-testing
            record are a point-in-time snapshot.
          </li>
        </ul>
      </section>

      <section id="operations">
        <h2>Operations</h2>
        <ul>
          <li>
            The dashboard is a static build. A source change in{' '}
            <code>packages/dashboard</code> requires a dashboard build before the collector
            serves it.
          </li>
          <li>
            The CLI requires a <code>dev</code> script in <code>package.json</code>. Custom
            start commands that do not start Next.js will not produce Next.js spans.
          </li>
          <li>
            CLI commands that attach to a live runtime use <code>.stacknext/run.json</code>.
            If it is stale, remove it and restart.
          </li>
          <li>
            Captured Playwright runs need a browser installed, for example{' '}
            <code>pnpm exec playwright install chromium</code>.
          </li>
          <li>
            A capture attaches to <code>stacknext dev</code> when it is running, otherwise
            it starts an ephemeral loopback collector. <code>--attach</code> refuses the
            fallback.
          </li>
          <li>
            Manual span and action helpers depend on an OpenTelemetry provider. Without{' '}
            <code>registerStackNext()</code> or another provider, they are no-ops.
          </li>
          <li>
            There is no automatic update mechanism, cloud account, hosted dashboard or team
            sync.
          </li>
        </ul>
      </section>
    </ContentPage>
  )
}
