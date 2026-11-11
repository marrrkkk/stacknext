import type { Metadata } from 'next'
import { ContentPage } from '@/components/content-page'
import { contentNoteClass, contentTableClass, contentTableWrapClass } from '@/components/styles'
import { pageMetadata } from '@/content/metadata'
import { LINKS } from '@/content/site'

export const metadata: Metadata = pageMetadata({
  title: 'Privacy',
  description:
    'How StackNext keeps telemetry on your machine: the loopback boundary, two-layer redaction, local records and what is never captured.',
  path: '/privacy',
})

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'collected', label: 'What is collected' },
  { id: 'never-collected', label: 'What is never captured' },
  { id: 'redaction', label: 'Redaction' },
  { id: 'local-files', label: 'Local files' },
  { id: 'network', label: 'Network boundary' },
  { id: 'ai', label: 'AI and MCP' },
  { id: 'website', label: 'This website' },
  { id: 'questions', label: 'Questions' },
] as const

export default function PrivacyPage(): React.ReactElement {
  return (
    <ContentPage
      eyebrow="Legal / Privacy"
      title="Your data stays on your machine."
      lede="StackNext is a local-first debugging tool. This page explains what the collector receives, what is redacted or dropped, where records are stored, and why nothing is uploaded."
      updated="November 10, 2026"
      sections={SECTIONS}
      breadcrumb="Privacy"
      path="/privacy"
    >
      <section id="overview">
        <h2>The short version</h2>
        <p>
          StackNext collects telemetry from your Next.js app over loopback, keeps a
          fixed-size sample in memory, and writes explicit records only under the
          project&apos;s <code>.stacknext</code> directory. There is no cloud service,
          account, analytics pipeline or outbound ingestion.
        </p>
        <ul>
          <li>No account, hosted backend, analytics endpoint or outbound telemetry.</li>
          <li>Instrumentation talks only to the collector on this machine.</li>
          <li>
            Captures, baselines, comparisons and snapshots are redacted local files and
            are never uploaded by StackNext.
          </li>
          <li>This website sets no cookies and loads no third-party tracking scripts.</li>
        </ul>
      </section>

      <section id="collected">
        <h2>What the collector receives</h2>
        <p>
          The collector accepts only the data needed to show a request, its database
          activity, its errors and deterministic diagnostic findings. Everything passes
          through validation and redaction before it enters the in-memory store.
        </p>
        <div className={contentTableWrapClass}>
          <table className={contentTableClass}>
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Handling</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Spans and timing</td>
                <td>
                  Span names, kinds, timing, status and documented Next.js attributes.
                  Sensitive attributes are redacted.
                </td>
              </tr>
              <tr>
                <td>Route and HTTP metadata</td>
                <td>
                  Path, HTTP method, status code and duration. Query values and fragments
                  are removed.
                </td>
              </tr>
              <tr>
                <td>Database events</td>
                <td>
                  Normalized SQL shape and timing from the optional Drizzle and Prisma
                  adapters. Bind parameters are never read.
                </td>
              </tr>
              <tr>
                <td>Errors</td>
                <td>
                  Error name, message, stack and digest after text redaction. Secret
                  patterns and query strings in stack URLs are replaced.
                </td>
              </tr>
              <tr>
                <td>Runtime metadata</td>
                <td>
                  A small allowlist such as service name, version, runtime, Next.js version
                  and environment.
                </td>
              </tr>
              <tr>
                <td>Diagnostics</td>
                <td>
                  Deterministic findings derived from the already-redacted sample. Evidence
                  is sanitized again before it is returned by the CLI, dashboard, export or
                  MCP server.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="never-collected">
        <h2>What is never captured</h2>
        <p>
          StackNext does not read, transmit or store the following, regardless of how the
          collector is configured:
        </p>
        <ul>
          <li>Request or response bodies.</li>
          <li>Request headers or cookies.</li>
          <li>URL query values or fragments.</li>
          <li>SQL bind parameters.</li>
          <li>
            Server Action arguments, <code>FormData</code> values or return values. The
            action helper records only the name and attributes you pass explicitly.
          </li>
          <li>Playwright screenshots, videos or trace archives.</li>
          <li>Machine or user identifiers.</li>
          <li>
            The collector bearer token in run, baseline, comparison or snapshot records.
            It exists only in <code>.stacknext/run.json</code> with mode <code>0600</code>.
          </li>
        </ul>
      </section>

      <section id="redaction">
        <h2>Two redaction passes</h2>
        <p>
          Redaction happens once in your application process before events are queued, and
          again in the collector before the data is stored. A bug in one layer does not
          automatically expose raw data through the other.
        </p>
        <ul>
          <li>
            <strong>URLs:</strong> <code>/path?token=secret#fragment</code> becomes{' '}
            <code>/path</code>.
          </li>
          <li>
            <strong>Sensitive keys:</strong> names containing authorization, cookie,
            password, secret, API key, token, credential or connection string become{' '}
            <code>[redacted]</code>.
          </li>
          <li>
            <strong>Headers:</strong> attribute maps with a header-shaped key are replaced
            wholesale.
          </li>
          <li>
            <strong>Secret patterns:</strong> bearer tokens, JWTs, common API key formats,
            credential-bearing connection strings and <code>key=value</code> password or
            token patterns are replaced.
          </li>
          <li>
            <strong>SQL and errors:</strong> redaction patterns are applied to query text,
            error messages and stacks. Bind parameters are never included.
          </li>
        </ul>
        <p className={contentNoteClass}>
          Redaction is pattern-based and deliberately conservative, not a formal secret
          scanner. If an application embeds an unrecognized secret in a SQL string, a URL
          path segment, a span attribute or an error message, it may still be stored. Keep
          credentials out of those places and review an export before sharing it.
        </p>
      </section>

      <section id="local-files">
        <h2>Local files and retention</h2>
        <p>
          The live sample is held in memory with fixed capacity and retention limits. Drop
          counters are surfaced in the dashboard, CLI and health endpoint when the store
          fills.
        </p>
        <ul>
          <li>
            Defaults are 5,000 spans and 10 minutes. Older events are dropped rather than
            written to a remote store.
          </li>
          <li>
            Snapshots, runs, baselines and comparisons are explicit JSON records under{' '}
            <code>.stacknext</code>. Directories use mode <code>0700</code> and files use{' '}
            <code>0600</code>.
          </li>
          <li>
            Automatic exit and first-error snapshots rotate beyond the newest ten by
            default. Manual and imported snapshots are never deleted automatically.
          </li>
          <li>
            Individual record files are capped at 16 MiB and snapshots at 64 MiB. Oversized
            saves fail instead of truncating data.
          </li>
          <li>
            Delete the <code>.stacknext</code> directory to remove local records. StackNext
            never uploads them.
          </li>
        </ul>
      </section>

      <section id="network">
        <h2>Loopback network boundary</h2>
        <p>
          The collector and dashboard share one Node process bound to{' '}
          <code>127.0.0.1</code> or <code>localhost</code>. Startup rejects any other host.
        </p>
        <ul>
          <li>
            Ingestion requires an <code>Authorization: Bearer</code> token generated by{' '}
            <code>stacknext dev</code>. The token is stored in{' '}
            <code>.stacknext/run.json</code> with mode <code>0600</code>.
          </li>
          <li>
            Read APIs and the live stream require the bearer token or an{' '}
            <code>HttpOnly</code>, <code>SameSite=Strict</code> dashboard session cookie.
            Sessions expire after 24 hours.
          </li>
          <li>
            Non-loopback <code>Host</code> headers, cross-origin requests and{' '}
            <code>Sec-Fetch-Site: cross-site</code> requests are rejected.
          </li>
          <li>
            The dashboard sends a restrictive content security policy,{' '}
            <code>nosniff</code>, <code>X-Frame-Options: DENY</code> and{' '}
            <code>Referrer-Policy: no-referrer</code>.
          </li>
          <li>The MCP client refuses collector URLs that are not loopback.</li>
        </ul>
      </section>

      <section id="ai">
        <h2>AI coding agents and MCP</h2>
        <p>
          StackNext does not bundle an AI provider, send telemetry to a hosted inference
          service or require an API key. Diagnostics are deterministic rules, not model
          output. The MCP server is read-only and uses GET requests over loopback, so a
          coding agent can inspect the sample without changing it.
        </p>
        <p>
          If you connect a hosted coding agent to the MCP server, that agent&apos;s own
          privacy policy applies to what it reads. StackNext does not control the agent or
          its retention.
        </p>
      </section>

      <section id="website">
        <h2>This website</h2>
        <p>
          This marketing site is a static Next.js application. It does not set cookies, run
          analytics, load ad networks or include third-party tracking scripts. Fonts and
          images are served from this origin.
        </p>
        <p>
          Links to GitHub, npm and the documentation take you to external services with
          their own privacy policies. The hosting provider may process standard request
          logs, such as IP address and user agent, under its own policy.
        </p>
        <p>
          The product itself does not disable or reconfigure any monitoring your app
          already uses. If another OpenTelemetry provider is registered, StackNext yields
          to it instead of starting a second SDK.
        </p>
      </section>

      <section id="questions">
        <h2>Changes and questions</h2>
        <p>
          This page is updated when captured data, the redaction model or the local
          boundary changes. For general questions, open an issue in the{' '}
          <a href={LINKS.github} target="_blank" rel="noreferrer">
            StackNext repository
          </a>
          . Report security concerns through the{' '}
          <a href={LINKS.security} target="_blank" rel="noreferrer">
            security policy
          </a>{' '}
          rather than a public issue.
        </p>
        <p>
          The full engineering detail lives in the{' '}
          <a href={LINKS.privacyDocs} target="_blank" rel="noreferrer">
            privacy and redaction documentation
          </a>
          .
        </p>
      </section>
    </ContentPage>
  )
}
