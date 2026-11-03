# StackNext

**Local-first runtime inspection for Next.js App Router applications.**

StackNext is a free, MIT-licensed debugging center for Next.js. It collects
OpenTelemetry spans from your dev server, adds Drizzle/Prisma query events and
server errors, and shows them in a local dashboard, CLI and read-only MCP
server. It also derives deterministic diagnostic findings and compares
Playwright-linked runtime captures against saved baselines. There is no cloud
account, no hosted backend, no AI API client and no telemetry upload.

![StackNext overview](docs/screenshots/overview.png)

## Quick start

Add StackNext to an existing Next.js 15/16 App Router project:

```bash
npm install --save-dev @stacknext/cli @stacknext/next
npx stacknext init
npx stacknext dev
```

Or with pnpm:

```bash
pnpm add -D @stacknext/cli @stacknext/next
pnpm exec stacknext init
pnpm exec stacknext dev
```

`init` writes `stacknext.config.json` and creates `instrumentation.ts` (or
`instrumentation.js` for a JavaScript project) only when no instrumentation file
exists. `dev` starts the loopback collector and your app's own `dev` script.
Open the dashboard URL it prints, usually `http://127.0.0.1:4400`, and make a
request to your app.

Already have `instrumentation.ts`, middleware, a proxy or an OpenTelemetry
provider? StackNext preserves them and prints the hook to add manually. It yields
to an existing tracer provider instead of replacing it.

Installation, upgrade and cleanup: [docs/installation.md](docs/installation.md)
and [docs/uninstall.md](docs/uninstall.md). Supported combinations:
[docs/compatibility.md](docs/compatibility.md).

## Try the example app

From a checkout of this repository:

```bash
nvm use                  # or the equivalent for fnm, asdf or mise
corepack enable          # activates the pnpm version from package.json
pnpm install
pnpm build
cd apps/example-next-app
pnpm exec stacknext dev --open
```

Node 24 is pinned in `.nvmrc`; `.devcontainer/` provides the same toolchain and
Playwright browsers for VS Code Dev Containers and Codespaces. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the full development setup, including
Playwright browser dependencies on Linux.

Then visit the demo routes listed below. This path is for contributors; the
package quick start above is the normal user path.

## Why it exists

Next.js ships useful OpenTelemetry spans, but turning them into an everyday
debugging workflow usually means adopting a hosted APM. StackNext keeps the
feedback loop local: start your app with one command, make a request, and see
the request, waterfall, database queries and errors on your machine.

- **Requests** — route, method, status, duration, span/error/query counts,
  slow-request filtering and live updates.
- **Traces** — category-aware parent/child waterfall for framework, app,
  database and fetch spans, with attributes, events, warnings and missing parent
  detection.
- **Instrumentation coverage** — evidence-based `observed`, `active`,
  `configured`, `not-observed`, `unknown` and `unsupported` statuses for
  framework spans, adapters, custom spans and Server Actions. No misleading
  percentage.
- **Database** — redacted Drizzle and Prisma SQL, operation, success state,
  trace correlation and null-duration labeling where the adapter cannot measure.
- **Errors** — grouped fingerprints, redacted messages and stacks, and
  correlation to the request trace that produced them.
- **Custom spans and Server Actions** — optional helpers add application work
  and successful action spans to the same request trace.
- **Diagnostics** — deterministic, evidence-backed findings for repeated queries,
  slow spans, repeated external HTTP calls and error fingerprints. The same
  findings feed the CLI, dashboard, export and MCP; none of them is presented as
  a confirmed root cause.
- **Runtime regression testing** — Playwright scenarios correlate to verified
  server traces, capture runs save the evidence, and saved baselines are
  compared with deterministic medians and thresholds. Statuses are `improved`,
  `regressed`, `unchanged` or `inconclusive`; there is no significance claim.
- **MCP** — seventeen read-only tools for coding agents, over local stdio, with
  structured output, response metadata, coverage summary, diagnostic findings,
  regression records and optional guided prompts.
- **Agent Skill** — a portable `stacknext-debugging` skill with evidence-first
  workflows for errors, latency, database activity, traces, diagnostic findings,
  coverage gaps and runtime regression evidence.
- **Privacy boundary** — no bodies, headers, cookies, query values or SQL bind
  parameters. Redaction happens in the app and again in the collector.
- **Real local UX** — SSE updates, dark/light themes, responsive layout and
  useful empty states.

## Requirements

- Node.js **20.9+**. Public package validation runs on Node.js 22 and 24; see the
  [compatibility matrix](docs/compatibility.md) for the current tested set.
- npm, pnpm, yarn or bun to install the CLI and run your app.
- Next.js **15 or 16** with the **App Router**, on the **Node.js runtime**.
- Playwright **1.40+** only if you use runtime regression testing.

> 0.6 is the first public package release. All ten packages are published under
> `@stacknext/cli` and `@stacknext/*`; the dashboard and regression packages are
> installed automatically as CLI dependencies. Next.js runtime verification in
> this repository used **Next.js 16.4.3** and **15.5.28**.

## Demo routes

From the repository checkout, open `http://127.0.0.1:4400` after the example
app starts, then visit:

| URL | What it demonstrates |
| --- | --- |
| `http://127.0.0.1:4402/` | Server render with Drizzle queries |
| `http://127.0.0.1:4402/api/projects` | JSON route |
| `http://127.0.0.1:4402/api/slow?delay=350` | Slow request |
| `http://127.0.0.1:4402/api/error?token=demo-url-secret` | Failing route with a fake secret |
| `http://127.0.0.1:4402/api/custom-work` | Custom async and sync spans |
| `http://127.0.0.1:4402/actions-demo` | Server Action helper demo |
| `http://127.0.0.1:4402/api/n-plus-one` | Eight repeated task queries |
| `http://127.0.0.1:4402/api/n-plus-one-fixed` | Batched counterpart |
| `http://127.0.0.1:4402/api/slow-db` | Slow recursive database query |
| `http://127.0.0.1:4402/api/repeated-fetch` | Three uncached fetches |

The example app is a small task tracker called Tasklight. It uses
better-sqlite3 and Drizzle, seeds itself on first run, and includes deliberate
slow, throwing, custom-span and Server Action routes so every dashboard view has
real data.

With `stacknext dev` running, inspect the same sample from the CLI:

```bash
pnpm exec stacknext coverage
pnpm exec stacknext coverage --json
pnpm exec stacknext diagnose
pnpm exec stacknext diagnose --json
```

## Dashboard

| Request detail | Database |
| --- | --- |
| ![Request detail](docs/screenshots/request-detail.png) | ![Database queries](docs/screenshots/database.png) |

More captures: [dark overview](docs/screenshots/overview-dark.png),
[traces](docs/screenshots/traces.png),
[errors](docs/screenshots/errors.png),
[error detail](docs/screenshots/error-detail.png),
[settings](docs/screenshots/settings.png),
[mobile overview](docs/screenshots/overview-mobile.png).

Routes: `/`, `/requests`, `/requests/:traceId`, `/traces`,
`/traces/:traceId`, `/database`, `/errors`, `/errors/:errorId`, `/diagnostics`,
`/diagnostics/:id`, `/runs`, `/runs/:id`, `/baselines`, `/baselines/:id`,
`/comparisons`, `/comparisons/:id`, `/settings`.

## Integrations and manual setup

`init` detects Next.js and the App Router, writes `stacknext.config.json`,
creates `instrumentation.ts` (or `instrumentation.js` for a JavaScript project),
and prints adapter setup for Drizzle/Prisma. It **never overwrites an existing
instrumentation file**; it prints a manual hook instead. StackNext also yields to
an already-registered OpenTelemetry provider rather than replacing existing
monitoring. See [installation](docs/installation.md) for upgrade and
configuration details.

Drizzle:

```ts
import { createStackNextDrizzleLogger } from '@stacknext/drizzle'

const db = drizzle(client, {
  logger: createStackNextDrizzleLogger({ databaseSystem: 'sqlite' }),
})
```

Prisma:

```ts
import { instrumentPrismaClient } from '@stacknext/prisma'

const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'query' }],
})
instrumentPrismaClient(prisma, { databaseSystem: 'postgresql' })
```

Add optional application spans when the built-in framework spans are not
specific enough:

```ts
import { withStackNextSpan } from '@stacknext/next'

const project = await withStackNextSpan('project.load', () => loadProject(id))
```

```ts
'use server'

import { withStackNextAction } from '@stacknext/next'

export async function saveProject(formData: FormData) {
  return withStackNextAction('action/save-project', () =>
    saveProjectFromForm(formData),
  )
}
```

Full setup and configuration: [docs/getting-started.md](docs/getting-started.md).
Instrumentation coverage: [docs/instrumentation-coverage.md](docs/instrumentation-coverage.md).
Custom spans: [docs/custom-instrumentation.md](docs/custom-instrumentation.md).
Server Actions: [docs/server-actions.md](docs/server-actions.md).

## CLI

```bash
stacknext init [--install]
stacknext dev [--open] [--quiet] [--token <token>] [nextArgs...]
stacknext status [--json]
stacknext doctor [--json]
stacknext coverage [--json]
stacknext diagnose [--id <diagnostic-id>] [--trace-id <trace-id>] [--category <category>] [--severity <severity>] [--json]
stacknext capture [--name <name>] [--project <name>] [--attach] [--url <url> --token <token>] [--json] [--quiet] -- <test command...>
stacknext runs list [--limit <n>] [--offset <n>] [--json]
stacknext runs show <run-id> [--json]
stacknext baseline save <run-id> --name <name> [--notes <text>] [--json]
stacknext baseline list [--limit <n>] [--offset <n>] [--json]
stacknext baseline show <baseline-id> [--json]
stacknext baseline remove <baseline-id> --yes [--json]
stacknext compare <baseline-id> <candidate-run-id> [--json] [--fail-on regression|inconclusive|any]
stacknext export [-o <file> | --stdout] [--force]
stacknext uninstall [--yes] [--keep-config] [--remove-data] [--json]
stacknext mcp [--collector <url>] [--token <token>]
```

`dev` starts the loopback collector, writes runtime state to
`.stacknext/run.json` (`0600`), then runs the app's own `dev` script with the
collector URL and token in its environment. `status`, `doctor`, `coverage`,
`diagnose`, `export` and `mcp` use that runtime state. `doctor` is the first stop
when data is missing; `coverage` shows what the current sample actually observed;
`diagnose` lists or opens deterministic findings with filters. Set
`instrumentation.verbose` or `NEXT_OTEL_VERBOSE=1` for the documented expanded
Next.js span set; `dev` prints the effective state because verbose tracing adds
span volume and dev-server overhead.

## Runtime regression testing

`@stacknext/playwright` is optional. It injects W3C trace context into browser
requests, proves that the server trace is a child of the injected request, and
submits each Playwright sample to the active capture run. Correlation is never
guessed from a time window.

```ts
import { stackNextFixtures } from '@stacknext/playwright'

const { test, expect } = stackNextFixtures()

test(
  'renders the overview',
  { annotation: { type: 'stacknext.scenario', description: 'app.overview' } },
  async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
  },
)
```

With the app running through `stacknext dev`, capture a baseline and compare a
candidate:

```bash
pnpm exec stacknext capture --name "baseline" --quiet --json \
  -- pnpm exec playwright test --workers=1 --repeat-each=3 > baseline.json
RUN_ID=$(jq -r .run.id baseline.json)
pnpm exec stacknext baseline save "$RUN_ID" --name "baseline" --json > saved.json
BASELINE_ID=$(jq -r .baseline.id saved.json)

pnpm exec stacknext capture --name "candidate" --quiet --json \
  -- pnpm exec playwright test --workers=1 --repeat-each=3 > candidate.json
CANDIDATE_ID=$(jq -r .run.id candidate.json)
pnpm exec stacknext compare "$BASELINE_ID" "$CANDIDATE_ID" --json
```

The default is report-only. Add `--fail-on regression` in CI to exit non-zero
only for a regression. The dashboard has `/runs`, `/baselines` and
`/comparisons` views, and the MCP server exposes the same records read-only.
Captured runs use one Playwright worker; see
[docs/regression-testing.md](docs/regression-testing.md) for the full workflow,
[docs/playwright-integration.md](docs/playwright-integration.md) for fixture
setup, and [docs/comparison-methodology.md](docs/comparison-methodology.md) for
the thresholds and status rules.

## MCP

```json
{
  "mcpServers": {
    "stacknext": {
      "command": "npx",
      "args": ["--no-install", "stacknext", "mcp"],
      "cwd": "/absolute/path/to/your-app"
    }
  }
}
```

Start `stacknext dev` before the MCP client. The server is stdio-only,
read-only, and refuses non-loopback collector URLs. With pnpm, use
`pnpm --dir /absolute/path/to/your-app exec stacknext mcp` instead. Tools:

`get_project_summary`, `list_requests`, `get_request`, `list_traces`,
`get_trace`, `list_errors`, `get_error`, `list_database_queries`,
`find_slow_requests`, `stacknext_list_diagnostics`,
`stacknext_get_diagnostic`, `stacknext_list_test_runs`,
`stacknext_get_test_run`, `stacknext_list_baselines`, `stacknext_get_baseline`,
`stacknext_list_comparisons`, `stacknext_get_comparison`.

Successful responses keep the existing JSON text content and add
`structuredContent`, output schemas and a `meta` object with pagination,
connection and completeness information. `get_project_summary` also returns the
instrumentation coverage report and a compact `meta.coverage` summary, so an
agent can separate missing instrumentation from an absent runtime problem. The
two diagnostics tools return the same findings as the CLI and dashboard;
`get_trace` adds references to related findings. The six regression tools read
capture runs, baselines and comparisons from `.stacknext` without capturing,
saving, deleting or mutating anything. Five optional prompts
(`diagnose-error`, `investigate-slow-request`, `inspect-database-activity`,
`investigate-trace`, `diagnose-runtime-issue`) provide guided entry points.

## AI coding agent integration

StackNext is designed to be used by coding agents without an AI API key or
subscription. The portable skill at
[`skills/stacknext-debugging`](skills/stacknext-debugging/SKILL.md) teaches six
evidence-first workflows:

- **A — runtime error:** find the error, read the stack, follow the correlated
  trace.
- **B — slow request:** rank slow requests, inspect the timeline and find the
  measured bottleneck.
- **C — database investigation:** inspect redacted SQL, failures, null durations
  and trace correlation.
- **D — general runtime investigation:** summarize the current state with
  explicit evidence and completeness caveats.
- **E — diagnostic findings:** list findings, open one, verify its evidence and
  report what remains unproven.
- **F — runtime regression evidence:** inspect a capture run, baseline or
  deterministic comparison without presenting it as statistical significance or
  a confirmed cause.

The skill also has a coverage-check workflow that uses `meta.coverage` and the
summary coverage report to distinguish a feature that was not exercised from one
that is missing or unsupported.

Install the whole skill directory into your client's project skill path:

```bash
pnpm exec stacknext skill install --client opencode
pnpm exec stacknext skill install --client codex
pnpm exec stacknext skill install --client claude-code
```

`stacknext skill path` prints the bundled directory, and `--force` replaces an
existing copy. The skill ships inside `@stacknext/cli`; the repository copy
remains the canonical source. Do not overwrite existing instruction files; add
the marked block from
[docs/integrations/agent-instructions.md](docs/integrations/agent-instructions.md)
to `AGENTS.md` or `CLAUDE.md` only after reviewing it.

Client setup:

- [OpenCode](docs/integrations/opencode.md)
- [Codex](docs/integrations/codex.md)
- [Claude Code](docs/integrations/claude-code.md)
- [MCP tools, prompts and response metadata](docs/mcp.md)
- [Agent compatibility suite and current results](docs/agent-testing.md)

The agent should start with `get_project_summary`, cite tool evidence, check
`meta.completeness`, and treat `null` Drizzle query durations as unmeasured, not
zero. StackNext never requires a hosted model; the client you choose may still
log or transmit tool results according to its own policy.

## Privacy

StackNext never captures request/response bodies, headers, cookies, URL query
values or SQL bind parameters. Every attribute map, including attributes passed
to custom span and Server Action helpers, passes through a redaction layer in
the app process and again in the collector. URLs lose their query strings and
fragments; passwords, tokens, cookies, authorization values, credential-bearing
URLs and known secret formats are replaced with `[redacted]`.

The collector binds to `127.0.0.1`, requires a bearer token for ingestion and
read APIs, issues a `HttpOnly`/`SameSite=Strict` dashboard session cookie,
validates payloads with Zod, rejects cross-site requests and enforces 2 MiB
ingest payloads. Telemetry is in memory, bounded and retention-pruned. Capture
runs, baselines and comparisons are redacted JSON records under `.stacknext`
with private permissions; they are not uploaded and are never pruned
automatically.

Read [docs/privacy.md](docs/privacy.md) for the full data table and caveats.
Redaction is pattern-based, not a formal secret scanner: review exports before
sharing them.

## Limitations

This is a local development tool. Edge runtime, the Pages Router, production
monitoring and multi-user hosting are out of scope. Server Components are not
individually traced, Server Actions require the explicit
`withStackNextAction()` helper, and Drizzle query durations are unavailable
through its logger API. Coverage describes only the current retention window;
`not-observed` and `unknown` are not proof of a broken app. Diagnostics are
deterministic heuristics over the same window, not confirmed root causes, and
they do not read source, run SQL/EXPLAIN or recommend indexes. Regression
comparisons use Playwright-linked samples, medians and explicit thresholds; they
are not statistical tests, do not prove causality and report `inconclusive` when
the environment or evidence is insufficient. See
[docs/limitations.md](docs/limitations.md).

## Repository layout

```
packages/core       wire types, schemas, redaction, store, transport
packages/diagnostics deterministic diagnostic rules and report
packages/regression capture records, baselines, comparisons, storage
packages/playwright optional Playwright fixture and trace correlation
packages/next       Next.js instrumentation + OpenTelemetry exporter
packages/drizzle    Drizzle logger adapter
packages/prisma     Prisma query adapter
packages/cli        stacknext binary + collector HTTP server
packages/dashboard  React/Vite dashboard served by the collector
packages/mcp        read-only stdio MCP server
skills/             portable Agent Skills for coding agents
apps/example-next-app  Tasklight demo
```

More detail: [architecture](docs/architecture.md).

## Development

```bash
pnpm install
pnpm exec playwright install chromium   # for the example Playwright scenarios
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e      # starts the built example app and checks the real stack
pnpm test:packages # packs and validates all ten public archives
pnpm test:consumer # installs archives in an external Next.js fixture
pnpm check:docs    # checks internal links and documented commands
pnpm benchmark     # synthetic ingest + read API benchmark
pnpm benchmark:diagnostics # synthetic findings + diagnostics read benchmark
pnpm benchmark:verbose # real-app standard vs verbose tracing comparison
```

`test:consumer` accepts `--next 15.5.28|16.4.3`, `--pm npm|pnpm`, `--skip-build`
and `--keep`. It installs the archives by file path with local overrides because
the `@stacknext/*` packages are not fetched from the registry during validation.

`test:e2e` needs the packages built, the example app installed and Playwright
Chromium available. It reuses a running StackNext instance when one is alive,
otherwise it starts and stops one. The e2e suite covers capture → baseline →
candidate → compare, the collector regression APIs, CLI records, secret
redaction, MCP regression tools and dashboard deep links. The benchmark and e2e
scripts both print their method and results; benchmark numbers are
machine-specific. See [docs/benchmark.md](docs/benchmark.md) for the measured
collector, diagnostics and verbose-tracing results and methodology.

GitHub Actions runs lint, typecheck, unit tests and build across Node.js 22, 24
and 26, validates real package archives, and runs the e2e and external-consumer
smoke tests. A separate scheduled compatibility workflow covers Next.js 15/16
with npm and pnpm, plus Windows and macOS smoke runs. See
[docs/releasing.md](docs/releasing.md) and
[docs/compatibility.md](docs/compatibility.md).

See [AGENTS.md](AGENTS.md) for the repository conventions, invariants and
verification workflow.

## License

MIT. See [LICENSE](LICENSE).
