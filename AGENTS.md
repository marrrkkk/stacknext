# AGENTS.md

Repository conventions and invariants for StackNext. Read
[docs/architecture.md](docs/architecture.md) before changing package boundaries.

## What this is

StackNext is an MIT-licensed, local-first debugging center for Next.js App
Router apps. It collects OpenTelemetry spans plus Drizzle/Prisma query events
and Next.js errors over loopback, stores them in memory, and exposes a
dashboard, CLI and read-only MCP server. It also derives deterministic,
evidence-backed diagnostic findings from the same sample, freezes samples into
redacted local snapshots, and compares Playwright-linked runtime captures
against saved baselines stored under `.stacknext`. There is no cloud service,
account, AI API client or outbound telemetry.

## Commands

Run from the repository root:

```bash
pnpm install
pnpm exec playwright install chromium # required for captured Playwright scenarios
pnpm build          # topological build; required before e2e/benchmark
pnpm lint           # eslint over the whole repo
pnpm typecheck      # per-package tsc --noEmit against source paths
pnpm test           # vitest unit/integration tests
pnpm test:e2e       # real CLI + collector + example app + dashboard + MCP + regression flow
pnpm benchmark      # synthetic ingest and read API benchmark (docs/benchmark.md)
pnpm benchmark:diagnostics # synthetic findings + diagnostics read benchmark
pnpm benchmark:verbose # real-app verbose-tracing overhead comparison
pnpm docs:sync      # regenerate package docs in the CLI and Mintlify tree
pnpm docs:check     # generated docs + website changelog + links + navigation
pnpm changelog:sync # regenerate website changelog data from CHANGELOG.md
pnpm changelog:check # fail when the generated website changelog is stale
pnpm docs:dev       # local Mintlify preview from docs/
```

Useful scoped commands:

```bash
pnpm --filter @stacknext/core build
pnpm --filter @stacknext/regression build
pnpm --filter @stacknext/playwright build
pnpm --filter @stacknext/cli build
pnpm --filter @stacknext/example dev
pnpm exec stacknext dev --open       # from an app directory after build
pnpm exec stacknext doctor
pnpm exec stacknext coverage [--json]
pnpm exec stacknext diagnose [--json]
pnpm exec stacknext snapshot save [--label <text>] [--json]
pnpm exec stacknext snapshot list [--json]
pnpm exec stacknext snapshot show <snapshot-id> [--json]
pnpm exec stacknext snapshot export <snapshot-id> [-o <file> | --stdout]
pnpm exec stacknext snapshot import <file> [--label <text>] [--json]
pnpm exec stacknext snapshot delete <snapshot-id> --yes [--json]
pnpm exec stacknext capture --name <name> -- pnpm exec playwright test --workers=1
pnpm exec stacknext runs list
pnpm exec stacknext baseline list
pnpm exec stacknext compare <baseline-id> <candidate-run-id>
```

The example app listens on `http://127.0.0.1:4402`; the collector/dashboard
uses `http://127.0.0.1:4400` by default. `stacknext dev` writes
`<app>/.stacknext/run.json` and cleans it up on exit.

## Repository layout

| Path | Responsibility |
| --- | --- |
| `packages/core` | Wire types, Zod schemas, redaction, normalization, config, bounded store, async transport, diagnostic wire types, snapshot storage. |
| `packages/diagnostics` | Deterministic fingerprinting, six diagnostic rules, report filtering, overview and detail evidence. |
| `packages/regression` | Capture/run/baseline/comparison schemas, stable scenario and trace identities, environment snapshots, deterministic comparison, private atomic storage. |
| `packages/playwright` | Optional Playwright fixture, W3C trace-context propagation, trace probing, correlation submission. |
| `packages/next` | `instrumentation.ts` registration, OTel provider/exporter, error hook. |
| `packages/drizzle` | Drizzle `Logger` adapter. |
| `packages/prisma` | Prisma `$on('query')` adapter. |
| `packages/cli` | `stacknext` binary, collector HTTP server, regression and snapshot commands, dashboard hosting. |
| `packages/dashboard` | React/Vite static dashboard, including run/baseline/comparison and snapshot views. |
| `packages/mcp` | Read-only stdio MCP server, output schemas, prompts, telemetry, regression and snapshot metadata. |
| `skills/stacknext-debugging` | Portable Agent Skill with tool reference and evidence-first workflows. |
| `apps/example` | StackNext Example demo with Drizzle/better-sqlite3, slow, error, N+1, slow-DB and repeated-fetch routes plus annotated Playwright scenarios. |
| `apps/www` | Private marketing website: landing page plus privacy, license, limitations and generated changelog pages. Not published. |
| `scripts/` | Real e2e and benchmark scripts, including the capture → baseline → candidate → compare flow. |

## Documentation architecture

Documentation is part of the package distribution, not only a website.

- Canonical developer documentation for a package lives in
  `packages/<package>/docs/`. It is plain Markdown with `title` and
  `description` frontmatter, relative links and no Mintlify-only components.
- Published packages include `docs` in `files`. Public packages also pass the
  archive checks in `scripts/lib/release.mjs`.
- `scripts/sync-docs.mjs` generates the CLI index
  (`packages/cli/docs/packages.md`) and the Mintlify copies under
  `docs/packages/<slug>/`. Do not edit either output; edit the canonical file
  and run `pnpm docs:sync`.
- `docs/docs.json` is the Mintlify configuration and hand-authored navigation.
  Every navigation entry must resolve, and every generated package page must be
  in it. `docs/` is the Mintlify root, so site URLs stay extensionless.
- `docs/` hand-authored pages are the cross-package, conceptual website. They
  must not duplicate package API reference; link to the package docs instead.
- `CHANGELOG.md` is the canonical changelog. The website module
  `apps/www/content/changelog.generated.ts` is generated by
  `scripts/sync-changelog.mjs` and verified by `pnpm changelog:check`. Never
  edit the generated module by hand.
- Consumer agent instructions are opt-in via `stacknext init --agents` and are
  managed between the `BEGIN/END STACKNEXT AGENT RULES` markers. The root
  `AGENTS.md` is for contributors only and is never installed into consumers.
- `skills/stacknext-debugging` stays procedural and points at local
  `node_modules/@stacknext/*/docs`; API reference belongs in package docs.
- Mintlify is a documentation development/deployment concern. It is not a
  runtime dependency and does not affect `stacknext dev`.

Dependency direction: `core` is the base. `diagnostics`, `next`, `drizzle`,
`prisma`, `mcp` and `cli` may depend on `core`; `regression` depends on `core`
and `diagnostics`; `playwright` depends on `regression` and has
`@playwright/test` as a peer; `cli`, `dashboard` and `mcp` may depend on
`regression`. `cli` also depends on `dashboard`, `mcp` and `diagnostics`. Never
import CLI, Next.js, React, Playwright or adapter code from `core`.

## Architecture invariants

- **Supported surface only.** Next.js 15/16 App Router, Node.js runtime.
  Do not patch undocumented Next.js internals and do not claim Edge or
  production support.
- **Never overwrite `instrumentation.ts`.** `stacknext init` must preserve an
  existing file and print manual instructions. `registerStackNext()` must yield
  to an already-registered OpenTelemetry provider instead of replacing it.
- **Local-only network.** Bind the collector to `127.0.0.1`/`localhost` and
  reject other hosts. Ingestion requires the bearer token; read APIs/SSE accept
  the bearer token or the dashboard session cookie. Keep Host/Origin/
  `Sec-Fetch-Site` checks, CSP and security headers intact.
- **Native-only runtime.** The collector and dashboard run as a Node process
  started by the CLI. Do not add a managed container runtime, a `runtime.mode`
  configuration field or `--docker`/`--native` peer flags. See
  `docs/adr/0001-native-only-runtime.md`.
- **Validate at the boundary.** Every ingest envelope is Zod-validated, body
  size is capped, and counts are bounded before entering the store.
- **Bounded memory.** The store is in memory with capacity/retention limits and
  drop counters. Instrumentation must never block a request on network I/O.
- **Two-layer redaction.** Redact in the app process before enqueueing and
  again in the collector before storing. A new field is not done until both
  layers and the privacy docs are updated.
- **Coverage is evidence, not a score.** Coverage statuses come from the current
  store sample plus collector config/connection state. Never invent a composite
  percentage or treat `not-observed`/`unknown` as proof that a feature is broken.
  Keep the sample window and item limitations visible in CLI, dashboard and MCP.
- **Diagnostics are deterministic evidence.** The six rules are conservative
  heuristics over the current store sample. Keep finding ids deterministic,
  evidence bounded and re-sanitized, and expose the same report through CLI,
  dashboard, export, MCP and the Agent Skill. Never present `possible` or
  `observed` as a confirmed root cause. No LLM/AI provider, source edits, SQL or
  EXPLAIN execution, index advice, alerting or long-term anomaly detection.
- **Regression evidence is proven, not guessed.** A Playwright sample is
  verified only when the collector finds the injected trace id and a server span
  parented to the injected span id. Never fall back to a time window, nearest
  request or synthetic sample. Ambiguous correlation becomes `incomplete` and
  forces the affected comparison to `inconclusive`.
- **Regression comparisons are deterministic and report-only.** Match scenarios
  by stable scenario id and traces/spans by normalized keys, never by ids or
  timestamps. Use medians and explicit thresholds; never claim statistical
  significance or causality. Report `improved`, `regressed`, `unchanged` or
  `inconclusive` with severity separately. `--fail-on` is the only CI gate.
- **Regression storage is local and immutable.** Write runs, baselines and
  comparisons under `.stacknext/{runs,baselines,comparisons}` with strict
  versioned schemas, `0700`/`0600` permissions, atomic writes and a 16 MiB cap.
  Never auto-delete, never upload, and never overwrite an existing record
  without an explicit overwrite request. Keep invalid ids and incomplete
  records visible rather than repairing them.
- **Snapshots are frozen, redacted evidence.** A snapshot is a versioned copy of
  one sample under `.stacknext/snapshots`, never a replay into the live store.
  Save manually, on graceful exit and on the first error with a 60-second
  cooldown; rotate only automatic snapshots beyond `snapshots.autoKeep`
  (default 10). Manual and imported snapshots are never auto-deleted. Write
  atomically with `0700`/`0600` permissions, refuse implicit overwrite, cap each
  snapshot at `snapshots.maxBytes` (default 64 MiB) and fail oversized saves
  instead of truncating. Re-normalize and re-redact imports. Snapshot reads use
  a detached store and carry no live diagnostics or coverage.
- **Playwright stays optional and sequential.** `@stacknext/playwright` must be
  inert outside an active capture run and must not replace Playwright or change
  assertions. Use one worker for captured runs until parallel correlation is
  explicitly verified. Prefer the explicit `stacknext.scenario` annotation for
  identity; never use time windows to link browser and server activity.
- **Documented Next.js telemetry only.** Keep the standard span allowlist in
  `core/framework.ts` aligned with the supported Next.js versions. Preserve
  documented `next.*` and HTTP attributes and parent ids; retain unknown span
  types as verbose evidence instead of guessing. `NEXT_OTEL_VERBOSE=1` is the
  only verbose switch; do not use `NEXT_PRIVATE_*` or patch internals.
- **Manual helpers stay optional.** `withStackNextSpan`,
  `withStackNextSpanSync` and `withStackNextAction` use the existing OTel
  context/provider, preserve return values and errors, sanitize attributes, and
  must not create a second SDK. Never claim automatic Server Component or
  Server Action tracing.
- **Package documentation is distributed.** A public package is not complete
  until its `docs/` directory is present in the npm archive, listed in
  `DOCUMENTED_PACKAGES`, reachable from `docs/docs.json`, and validated by
  `pnpm check:docs` and `pnpm test:packages`. Never edit generated copies under
  `docs/packages` or `packages/cli/docs/packages.md`.
- **Read-only MCP.** All tools stay `readOnlyHint: true`; the API client only
  performs GETs and refuses non-loopback URLs. stdout is protocol-only. Prompts
  and the Agent Skill shape investigations but cannot add capabilities, mutate
  data or bypass redaction. Keep tool names and arguments stable; response
  metadata is additive. The six regression tools read runs, baselines and
  comparisons only, and the three snapshot tools read snapshots only; they
  cannot capture, save, compare, import, delete or edit.
- **Portable skill.** `skills/stacknext-debugging` follows the Agent Skills
  specification and is the canonical source. It is copied into the
  `@stacknext/cli` archive at pack time and installed with `stacknext skill
  install --client opencode|codex|claude-code`. Keep `SKILL.md` concise, put
  details in `references/`, and do not claim a client is supported without a
  real end-to-end test recorded in `docs/agent-testing.md`.

## Privacy and security rules

Never capture, transmit or store:

- request/response bodies, headers or cookies;
- URL query values or fragments;
- SQL bind parameters;
- Playwright screenshots, videos or trace archives;
- machine/user identifiers.

URLs keep path only. Sensitive keys become `[redacted]`. Error messages and
stacks go through text redaction. Resource attributes use an allowlist. Capture
records, baselines, comparisons and snapshots are redacted local files under
`.stacknext`; they must never contain a token, raw body/header/query value, SQL
bind parameter or Playwright artifact. If a change touches captured data, update
`docs/privacy.md`, the config schema and the tests that assert secrets do not
appear in API/export/regression/snapshot output.

Tokens live in `.stacknext/run.json` with mode `0600`. Do not log tokens, put
them in fixtures, commit runtime state or add a remote transport.

## Build and typecheck layout

- `tsconfig.base.json` contains strict compiler options only and **no**
  workspace `paths`.
- Package `tsconfig.json` files map `@stacknext/*` to source for typechecking
  before a build exists.
- Package `tsconfig.build.json` files set `"paths": {}` and emit `src` to
  `dist`. Build-time resolution must use built `dist` types, never source.
- This split exists because Turbopack otherwise bundles `packages/next/src` and
  fails on `./exporter.js` imports.
- Never emit `.js`, `.d.ts` or `.map` files into `src/`. If they appear, delete
  them; output belongs in `dist/`.
- `pnpm -r build` handles topology (`core` before dependents, `dashboard`
  before `cli` serves it). Do not reorder around it manually unless necessary.

## Code style

- TypeScript strict mode, ESM, `.js` extensions in relative imports.
- Keep dependencies minimal and justified. Prefer Node built-ins and existing
  packages.
- Match surrounding naming and structure. Avoid `any`; validate external data
  with Zod and use the inferred types.
- Tests should exercise real behavior (real transport/collector where
  practical), not mocks of the code under test.
- No generated build output, logs, local databases or runtime state in commits.

## Verification workflow

Before declaring a change complete:

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm build`
5. `pnpm test:e2e` (after build, with Playwright Chromium installed). It reuses a
   live runtime if one exists, otherwise it starts and stops the example app
   itself. It must cover capture → baseline → candidate → compare, the
   collector regression APIs, CLI records, snapshot save/list/read/export/delete,
   MCP regression and snapshot tools and dashboard deep links.
6. Run `pnpm check:docs` (which includes `pnpm changelog:check`) and
   `pnpm test:packages` for documentation or package changes. After editing
   `CHANGELOG.md`, run `pnpm changelog:sync` so the website data matches. For
   user-facing changes, exercise `stacknext dev` manually and check the
   dashboard Overview coverage and diagnostics cards, request/trace timelines,
   database, errors, `/diagnostics` and `/diagnostics/:id`, `/runs`, `/runs/:id`,
   `/baselines`, `/baselines/:id`, `/comparisons`, `/comparisons/:id`, the
   `/actions-demo`, `/api/custom-work`, `/api/n-plus-one`,
   `/api/n-plus-one-fixed`, `/api/slow-db` and `/api/repeated-fetch` routes,
   `stacknext coverage`, `stacknext diagnose`, `stacknext capture`,
   `stacknext runs`, `stacknext baseline`, `stacknext compare` and the MCP
   summary/diagnostics/regression tools.
7. Warm `/`, `/projects/1` and `/api/n-plus-one` before a baseline capture.
   Cold route-module spans can appear on only one side and make a comparison
   inconclusive. Use one Playwright worker and at least three samples.
8. If captured data changed, verify the example error route still redacts
   `demo-url-secret`, `super-secret-demo-token` and `hunter2`, that action and
   custom-span attributes do not leak `action-attribute-secret`,
   `custom-attribute-secret`, `custom-url-secret` or `e2e-url-secret`, and that
   diagnostic evidence, regression records, comparisons and export output do not
   contain those values either.
9. Check explicit `NEXT_OTEL_VERBOSE=0` still overrides
   `instrumentation.verbose: true`, and that `NEXT_OTEL_VERBOSE=1` is reported
   with its performance caveat.

Runtime verification in this repository used Node.js 24 and Next.js 16.4.3;
CI uses Node.js 22. Keep `engines` at Node `>=20.9.0` unless the support policy
changes.

When stopping a dev server, send SIGINT/SIGTERM to the `stacknext dev`
process so it can close the collector and remove `.stacknext/run.json`. Check
for orphaned `next dev` processes on ports 4400-4425 afterwards.
