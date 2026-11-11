# AGENTS.md

StackNext is an MIT-licensed, local-first debugging center for Next.js App
Router apps. It collects OpenTelemetry spans, Drizzle/Prisma query events and
Next.js errors over loopback, stores them in memory, and exposes a dashboard,
CLI and read-only MCP server. It also derives deterministic diagnostics,
freezes redacted snapshots and compares Playwright captures against baselines
under `.stacknext`. There is no cloud service, account, AI API client or
outbound telemetry.

This file is the working contract for coding agents. It stays short on purpose:
the detail lives in `docs/`. Package-specific rules live in the nearest
`AGENTS.md` under `packages/` or `apps/`; `apps/docs/` is the public product
guide and `docs/` is the contributor knowledge base. Read the linked page before
changing that area.

## Read first

| Area | Canonical page |
| --- | --- |
| Architecture, data flow and where to change what | [docs/architecture/overview.md](docs/architecture/overview.md) |
| Invariants and review boundaries | [docs/architecture/boundaries.md](docs/architecture/boundaries.md) |
| Package graph and build topology | [docs/architecture/packages.md](docs/architecture/packages.md) |
| Conventions, compatibility, commits and pull requests | [docs/development/repository-conventions.md](docs/development/repository-conventions.md) |
| Test layers, selection and redaction checks | [docs/testing/testing-strategy.md](docs/testing/testing-strategy.md) |
| Documentation surfaces and generated files | [docs/development/documentation.md](docs/development/documentation.md) |
| Release and versioning | [docs/deployment/release-process.md](docs/deployment/release-process.md) |

If a change crosses a boundary or touches captured data, stop and read the
linked page first.

## Commands

Run from the repository root. `pnpm build` is required before e2e and
benchmarks.

```bash
pnpm install
pnpm exec playwright install chromium
pnpm build
```

Useful scoped commands:

```bash
pnpm --filter @stacknext/core build
pnpm --filter @stacknext/example dev
pnpm exec stacknext doctor
```

The example app runs on port 4402; the collector and dashboard use 4400.
`stacknext dev` writes and removes `<app>/.stacknext/run.json`. See
[README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/tooling/scripts.md](docs/tooling/scripts.md) for the full reference.

## Hard rules

[Architecture boundaries](docs/architecture/boundaries.md) is the full contract.
These are review gates, not suggestions.

- **Local-only, native runtime.** Bind to `127.0.0.1`/`localhost` and reject
  other hosts. Ingest requires the bearer token; reads accept the token or
  session cookie. Keep Host/Origin/`Sec-Fetch-Site` checks, CSP and security
  headers. The collector and dashboard run in the `stacknext dev` Node process;
  no managed container runtime, `runtime.mode` or `--docker`/`--native`. No
  remote transport, cloud service or outbound telemetry.
- **Validated, bounded and redacted.** Zod-validate ingest envelopes, cap
  bodies and counts, and keep store limits and drop counters. Never block a
  request on network I/O. Redact in the app before enqueueing and again in the
  collector. Never capture bodies, headers, cookies, URL query values or
  fragments, SQL bind parameters, Playwright artifacts or machine/user
  identifiers. A new captured field needs both layers, privacy docs and
  secret-leak tests.
- **Evidence, not guesses.** Coverage has no composite score; `not-observed`
  and `unknown` do not prove breakage. Diagnostics are deterministic, bounded
  and never confirmed root causes. A regression sample is verified only by the
  injected trace id plus a server span parented to the injected span id; there
  is no time-window fallback. Ambiguous correlation becomes `incomplete` and
  forces `inconclusive`; comparisons are deterministic, report-only and gate
  only through `--fail-on`. No LLM provider, source edits, SQL/EXPLAIN, index
  advice or alerting.
- **Immutable local storage.** Runs, baselines, comparisons and snapshots live
  under `.stacknext` with `0700`/`0600`, atomic writes and explicit caps. Never
  auto-delete manual records, upload them or overwrite a record without an
  explicit request. Snapshots are frozen, redacted copies, not replays.
- **Read-only MCP.** All tools stay `readOnlyHint: true`; the client only GETs
  loopback URLs; stdout is protocol-only. Keep tool names, arguments and
  annotations stable; response metadata is additive.
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:9344069b4ea4cc0b52baff5c3952491e4ad844f627ad6abd2b12bc0f969a4610 -->

- **Optional, sequential Playwright.** `@stacknext/playwright` is inert outside
  an active capture run. Captured runs use one worker. Prefer the optional
  `stacknext.scenario` annotation for identity; without it, identity falls back
  to Playwright’s `testId`, file, title and project.


<!-- /coderabbit-ai-generated:v1 -->

- **Support only the documented surface.** Next.js 15/16 App Router on the
  Node.js runtime. Do not patch undocumented internals or claim Edge/production
  support. Keep the span allowlist aligned with supported versions;
  `NEXT_OTEL_VERBOSE=1` is the only verbose switch. Preserve `instrumentation.ts`,
  middleware, proxy and `next.config`. `registerStackNext()` yields to an
  existing OpenTelemetry provider; manual helpers must not create a second SDK.
- **Additive compatibility.** CLI names/flags/JSON/exit codes, MCP tools,
  package exports, wire/storage formats, config fields and public URLs are
  consumed surfaces. Change them additively or bump the format/engine version;
  keep old records readable or report them invalid.
- **Docs are distributed; generated files are read-only.** Package reference is
  canonical in `packages/<package>/docs/`, ships in the archive and is listed in
  `DOCUMENTED_PACKAGES`; do not copy it into `apps/docs/`. The Agent Skill is
  canonical in `skills/stacknext-debugging` and copied into the CLI archive at
  pack time; only claim clients tested end to end in
  [agent compatibility](docs/testing/agent-compatibility.md). Never hand-edit
  `packages/cli/docs/packages.md`,
  `apps/www/content/changelog.generated.ts`, `packages/cli/skills/` or build
  output. Edit the canonical source and run the documented sync command.

## Workflow

1. Read this file, relevant docs and canonical package docs, then inspect the
   code and tests. Do not invent commands, paths, APIs or compatibility claims.
2. Make the smallest change that preserves the boundaries and the strict
   TypeScript ESM style (`.js` relative imports; avoid `any`); do not mix a
   refactor with a behavior change unless it is required.
3. Add or update tests. Prefer real transport, collector or fixtures over mocks.
4. Update canonical docs, navigation and `CHANGELOG.md` for user-visible
   changes; run `pnpm docs:sync`/`changelog:sync` when inputs change.
5. Run verification, record exact commands/results, and review `git diff` for
   generated output, secrets, unrelated changes and stale links.
6. Report what changed, what was verified, what could not run and remaining
   manual configuration. Never claim a check passed without running it.

## Verification

Default gate for every change:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:docs
```

Add the checks that match the change: `pnpm test:e2e` after build for runtime,
CLI, collector, dashboard, MCP, regression or snapshot changes;
`pnpm test:packages` for package metadata, exports, docs or archives;
`pnpm test:consumer --next 16.4.3 --pm npm --skip-build` for external installs;
Mintlify `validate`/`broken-links` from `apps/docs/` for public docs; and the
benchmarks for performance-sensitive runtime code. The full matrix is in
[testing strategy](docs/testing/testing-strategy.md#test-selection).

Before a baseline capture, warm `/`, `/projects/1` and `/api/n-plus-one`; use
one Playwright worker and at least three samples. Captured-data changes must
pass [redaction verification](docs/testing/testing-strategy.md#redaction-verification)
and keep `demo-url-secret`, `super-secret-demo-token`, `hunter2`,
`action-attribute-secret`, `custom-attribute-secret`, `custom-url-secret` and
`e2e-url-secret` out of every output.

Runtime verification used Node.js 24 and Next.js 16.4.3; CI covers Node.js 22,
24 and 26. Keep `engines` at Node `>=20.9.0` unless the support policy changes.
Stop `stacknext dev` with SIGINT/SIGTERM so it removes `.stacknext/run.json`,
then check for orphaned `next dev` processes on ports 4400-4425.

## Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org/) and squash
merge. The pull request title becomes the commit on `main`, and the release
planner parses it, so the title must be valid even when individual branch
commits are not.

```text
<type>(<scope>)!: <imperative summary>
```

- Types: `feat`, `fix`, `perf`, `revert`, `docs`, `test`, `chore`, `ci`,
  `build`, `refactor`.
- Scope is optional but preferred (`cli`, `core`, `dashboard`, `docs`, `release`,
  `www`). Use the imperative mood, lowercase after the colon, no trailing
  period and a subject of 72 characters or fewer.
- Add `!` or a `BREAKING CHANGE:` footer for incompatible changes. Release
  impact: `feat` → minor; `fix`/`perf`/`revert` → patch; breaking → minor before
  1.0.0 and major after; other types do not release. `Release-As: x.y.z` forces
  a version.

Examples: `feat(cli): add snapshot export command` and
`fix(core): keep redacted query values out of exports`.

Open one focused pull request per change and fill
[`.github/pull_request_template.md`](.github/pull_request_template.md). List
the exact verification commands and results; call out checks that could not
run, compatibility or privacy implications, and follow-up work. Never commit
`dist`, `.next`, `.stacknext`, `release`, logs, local databases or secrets.

## Versioning and changelog

StackNext follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
All public packages, `CLI_VERSION`, `STACKNEXT_SDK_VERSION`, the diagnostics and
regression engine constants and the Agent Skill metadata share one version; never
bump a single package or constant on its own.

- Bump **patch** for compatible `fix`, `perf` and `revert` changes. Bump
  **minor** for `feat` changes, and for breaking changes while the major version
  is `0`. Bump **major** from `1.0.0` for removed or renamed APIs, changed wire
  or storage formats, changed comparison semantics, dropped runtime support or a
  privacy-boundary change. `docs`, `chore`, `test`, `ci`, `build` and
  `refactor` do not release on their own.
- Record every user-visible change in the `## [Unreleased]` section of
  [`CHANGELOG.md`](CHANGELOG.md) with Keep a Changelog groups (`### Added`,
  `### Changed`, `### Fixed`, `### Removed`, `### Security`). The website parser
  accepts paragraphs, one level of bullets with indented wrapped lines, inline
  code, bold text and absolute `https://` links. Do not add nested lists,
  fenced code blocks or relative links.
- The release PR moves `[Unreleased]` under the new version, updates every
  manifest and constant, and regenerates
  `apps/www/content/changelog.generated.ts`. Never edit that generated module by
  hand; edit `CHANGELOG.md` and run `pnpm changelog:sync`.
- Use `Release-As: x.y.z` only when the commit-derived version is wrong.
  Published versions are immutable: ship a patch and deprecate the broken
  version instead of unpublishing it.

## Privacy and security

Never capture or commit bodies, headers, cookies, query values, SQL bind
parameters, Playwright artifacts, tokens or machine/user identifiers. Tokens
live in `.stacknext/run.json` (`0600`). Report vulnerabilities through
[SECURITY.md](SECURITY.md), not a public issue. Captured-data changes update
[`apps/docs/privacy.mdx`](apps/docs/privacy.mdx), the config schema and the
secret-leak tests.
