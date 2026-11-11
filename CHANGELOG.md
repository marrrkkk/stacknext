# Changelog

All notable changes to StackNext are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added App Router SEO plumbing to the website: `robots.txt`, a static
  `sitemap.xml`, canonical and social metadata, and JSON-LD for the
  organization, website, free software application, landing-page FAQ and page
  breadcrumbs. Canonical and sitemap URLs stay omitted unless
  `NEXT_PUBLIC_SITE_URL` is set, so a local build never invents a domain.
- Added generated 1200×630 Open Graph and Twitter cards for the landing page
  and every content route, built with `next/og` from a shared layout.

## [0.11.1] - 2026-11-10

## [0.11.0] - 2026-11-10

## [0.10.0] - 2026-11-09

Packaged documentation, a browsable documentation site and release automation
that keeps generated docs current.

### Added

- Added canonical `docs/` directories to every package archive. The CLI ships
  command, configuration, agent-setup and skill references; core ships schemas,
  redaction, transport and snapshot docs; and the Next.js, Drizzle, Prisma,
  Playwright and regression packages ship reference and troubleshooting
  guides.
- Documented the dashboard, diagnostics and MCP packages, completing reference
  coverage for both public and internal packages.
- Added a Mintlify documentation site with overview, getting-started, guide,
  security, AI-agent, contributing and reference sections, plus local
  `pnpm docs:dev` preview.
- Added `pnpm docs:sync` and `pnpm docs:check` tooling to generate the CLI
  package index and Mintlify package pages, and to validate generated docs,
  links and navigation in CI.

### Fixed

- Release PRs now regenerate versioned package documentation before committing,
  so generated copies match the release.
- Release verification now waits up to five minutes per package for npm
  registry propagation, configurable with `STACKNEXT_REGISTRY_WAIT_MS`, to
  tolerate replicas that serve stale 404s.
- Release PRs are opened with a GitHub App token or `RELEASE_PR_TOKEN` and
  queued for auto-merge after required checks, so generated pull requests run
  normal CI.

## [0.9.0] - 2026-11-09

Opt-in agent instructions for projects that use coding agents.

### Added

- Added opt-in `stacknext init --agents`, which creates or updates only the
  managed StackNext block in `AGENTS.md`. It lists the package documentation
  that resolves from the project, preserves user content and CRLF line endings,
  is idempotent, and refuses duplicate or partial marker blocks. Default
  `stacknext init` behavior is unchanged.

## [0.8.0] - 2026-11-08

A rebuilt example app that shares the dashboard's interface language and walks
through every supported evidence path.

### Changed

- Replaced `apps/example-next-app` with `apps/example`, a Next.js 16 App Router
  task tracker built on Drizzle and better-sqlite3, with an overview, project
  list and detail pages, reset controls and the dashboard's design tokens,
  shell, cards, tables and chips.
- Added `/scenarios`, which maps each demo route to the telemetry it produces
  and can generate traffic with one click, plus `/actions-demo` for successful,
  failing, redirect, not-found and concurrent Server Actions.
- Kept the slow, error, N+1, slow-DB, repeated-fetch and custom-work routes,
  expanded the annotated Playwright suite to cover traffic generation and task
  mutations, and documented warm-up, capture and baseline commands.

## [0.7.0] - 2026-11-07

Saved snapshots, diagnostics rule set v2, a bundled Agent Skill and a
redesigned dashboard.

### Added

- Added saved snapshots: a redacted, versioned freeze of the current sample
  under `.stacknext/snapshots`. Save manually from the dashboard or
  `stacknext snapshot save`, automatically on a graceful `stacknext dev` exit
  and on the first error with a 60-second cooldown, or import an existing export.
  Snapshots browse read-only traces, errors, database queries and raw export
  without replaying into the live store. Automatic exit/error snapshots keep the
  newest 10 by default; manual and imported snapshots are never auto-deleted.
  Each snapshot is capped at 64 MiB and oversized saves fail instead of
  truncating.
- Added three read-only MCP snapshot tools: `stacknext_list_snapshots`,
  `stacknext_get_snapshot` and `stacknext_get_snapshot_trace`. Snapshot data is
  frozen evidence and carries no live diagnostics or coverage.
- Added `stacknext snapshot save|list|show|export|import|delete` and the
  collector snapshot APIs (`GET/POST /api/snapshots`, import, delete, export and
  scoped trace/error/database reads).
- Added dashboard `/snapshots` and `/snapshots/:id` pages with scoped trace,
  error and database routes, plus a topbar save dialog and sample countdown.
- Split the old Settings page into `/settings` and `/mcp`. Settings now covers
  collector, adapters, snapshots and appearance; `/mcp` documents client setup,
  the read-only tool catalog and the Agent Skill.
- Bundled the `stacknext-debugging` Agent Skill in the `@stacknext/cli`
  archive. `stacknext skill path` prints the bundled directory, and
  `stacknext skill install --client opencode|codex|claude-code` copies it into a
  project without overwriting an existing copy unless `--force` is passed.
- The release archive check now fails when the bundled skill is missing or its
  `metadata.version` does not match the package version.
- Added the `brand/` identity kit: Open Span SVG masters, lockups, wordmark,
  app-icon variants, PNG exports, web icons and usage guidelines.
- Added a command menu (`Cmd/Ctrl+K`) with grouped navigation,
  filtered request views and appearance/layout actions, plus a topbar search
  trigger.

### Changed

- Expanded deterministic diagnostics to rule set v2: grouped N+1 and repeated
  HTTP findings across traces, a route-level `slow-request` rule, self-time
  `slow-span` attribution with Next.js phases and contributors, route-aware
  single and repeated error findings, a `server-error-response` rule for 5xx
  responses without a correlated error, sample-integrity notes, and
  affected-trace/contributor/occurrence evidence in the CLI, dashboard, API and
  MCP output. Regression comparisons now treat different or unknown diagnostics
  rule-set versions as inconclusive.
- Added a `snapshots` config block with `autoOnExit`, `autoOnError`, `autoKeep`
  and `maxBytes` defaults, and documented snapshot storage, rotation and
  redaction alongside regression records.
- The Agent Skill now documents the twenty read-only MCP tools and a saved
  snapshot evidence workflow.
- Clarified the dashboard regression workflow. Test runs, Baselines and
  Comparisons now share a three-step Capture → Baseline → Compare strip, and
  each page has role-specific headers, stats, table labels and actions so
  capture history, immutable references and report-only comparisons are not
  mistaken for the same resource.
- Merged the Requests page into Traces. `/traces` is the canonical list and
  `/traces?view=requests` adds the HTTP-only view with method, status and slow
  filters; `/requests` and `/requests/:traceId` redirect to the equivalent
  traces URLs. Removed the duplicate request detail API in favour of
  `/api/traces/:traceId`; `/api/requests` remains as a compatibility projection
  and the MCP `get_request` tool remains as an alias for `get_trace`.
- Replaced the dashboard's placeholder gradient mark with the monochrome Open
  Span symbol and added the favicon SVG/ICO/PNG set, Apple touch icon and web
  manifest. The symbol inherits `currentColor`, so it follows both themes.
- Reworked the sidebar into Observe, Investigate, Test and Configure groups
  with direct links to Test runs, Baselines and Comparisons. The desktop
  sidebar collapses to a 64 px rail from its brand-row control or
  `Cmd/Ctrl+B`, persists in `localStorage`, and keeps its drawer, focus and
  inert behaviour on mobile. The collapsed rail replaces the logo with the
  expand control.
- Moved page titles, descriptions and actions into a shared content-level page
  header. The topbar now carries breadcrumbs, the command trigger and
  connection status, with the navigation trigger shown on mobile only.
- Added a Settings > Navigation section for the sidebar preference, command
  menu, sidebar shortcut and theme cycle.
- Tightened the dashboard's small-screen layouts: stat strips use a compact
  two-column grid, list tables keep only their primary columns below `640px`,
  coverage and regression evidence wrap cleanly, and Settings exposes
  Export/Refresh in the page header with Appearance and Navigation first.
- Redesigned the dashboard with a refreshed visual system without changing
  data, routes, visible copy, API behavior or local-only guarantees. The new
  shell uses a 244 px recessed sidebar, an 8 px-inset content panel and a 40 px
  header bar; screens use an Inter-based 11/12/13/15/20/24 px type scale,
  hairline borders, edge-to-edge tables and 360 px detail rails in dark and
  light themes.
- Rebuilt the Overview around four interactive KPI tiles, a 24-request latency
  chart, grouped diagnostic and error previews, and a full-width evidence
  table. Shared status glyphs, cards, list rows, segmented summaries and
  container-query breakpoints are documented in `DESIGN.md`.
- Added a self-hosted `@fontsource-variable/inter` dependency so the dashboard
  font is served locally and the existing CSP still blocks external assets.
- Improved dashboard keyboard access: the mobile drawer now moves and restores
  focus, supports Escape, marks the main panel inert while open and keeps the
  closed sidebar out of the tab order. Search fields and filter selects draw
  the focus ring on their wrapper so the inner controls can suppress their own
  outline. Decorative separators and timeline branches are hidden from
  assistive technology, span rows expose their selected state, and all
  meaningful text meets WCAG AA contrast in both themes.
- Live tables hold buffered SSE refreshes while a row is under the pointer, so
  arriving requests cannot move the row being read. The refresh applies as soon
  as the pointer leaves the row.
- Motion follows the OS preference again: transitions and the skeleton shimmer
  run normally by default and collapse only under
  `prefers-reduced-motion: reduce`.

### Fixed

- Command-menu request filters now apply when the Requests page is already
  mounted, and browser back/forward keeps the visible filters in sync with the
  URL.
- Command-menu focus returns to a visible control after navigation, a collapsed
  desktop sidebar or a closed mobile drawer. IME composition no longer runs
  commands or interferes with candidate selection, and the command search
  field shows a focus indicator again.
- The mobile command menu labels its sidebar action as opening or closing the
  navigation drawer, the desktop-only sidebar preference is hidden below
  901 px, and the drawer uses the dynamic viewport height.
- Dashboard keyboard handling no longer collapses the sidebar while a text
  field is focused or the command menu is open, and opening the command menu
  closes the mobile drawer first.
- Comparison lists no longer paint a zero regressed count in the error colour.
- Request, trace and error tables now scroll horizontally inside their cards on
  narrow screens instead of clipping columns, and the duplicated occurrence
  table is hidden in the mobile error summary.
- Dashboard navigation now resets the inset content scroller instead of the
  non-scrolling window, so detail pages open at the top.
- Widening the mobile drawer to desktop moves focus to the active navigation
  item rather than dropping it to the document body.
- `JsonView` honours caller height limits again, and error groups no longer
  render empty occurrence tables on later result pages.
- Live refresh counts telemetry events locally so a reset collector sequence
  cannot stall updates.
- Two overlapping `stacknext dev` runs can no longer start duplicate
  collectors for the same project. A stale lock from a crashed run is reclaimed
  on the next start.
- Cleanup failures now keep the runtime state instead of reporting a successful
  shutdown, and `stacknext uninstall` preserves saved regression data while the
  recorded process is still alive.
- The `.stacknext/.gitignore` file is created before the runtime token is
  written and is kept while other runtime files remain, so `git add` cannot
  expose them.

## [0.6.1] - 2026-11-03

A packaging fix for the first public release.

### Fixed

- Corrected the install command in the published package READMEs to use
  `@stacknext/cli`. The `0.6.0` bootstrap archives still referenced the
  unavailable unscoped `stacknext` package.
- Aligned all ten package versions and rebuilt the archives so the published
  files match the tagged source.

## [0.6.0] - 2026-11-03

This is the first public package release. The project, packages, CLI, config,
runtime directory, cookies, MCP tools and agent skill are named **StackNext**.

### Added

- Ten publishable packages: `@stacknext/cli`, `@stacknext/core`,
  `@stacknext/diagnostics`, `@stacknext/regression`, `@stacknext/next`,
  `@stacknext/drizzle`, `@stacknext/prisma`, `@stacknext/playwright`,
  `@stacknext/mcp` and `@stacknext/dashboard`.
- Deterministic diagnostic findings for repeated SQL shapes, slow spans,
  repeated external HTTP calls and error fingerprints, shared by the CLI,
  dashboard, export and MCP.
- Instrumentation coverage statuses based on the current sample, with explicit
  `not-observed` and `unknown` semantics and no composite percentage.
- Playwright-linked runtime regression capture with verified trace correlation,
  immutable runs and baselines, deterministic comparisons and optional
  `--fail-on` gating.
- `stacknext uninstall` with a dry-run plan, `--yes`, `--keep-config`,
  `--remove-data` and JSON output. Generated files are removed only when their
  contents still match the StackNext template.
- External consumer smoke validation that installs real archives in Next.js 15
  and 16 projects with npm and pnpm.
- Package archive validation for version alignment, exports and declarations,
  README/LICENSE, executable permissions, secret patterns, unresolved
  workspace ranges, forbidden files and size.
- Manual release workflow with npm trusted publishing, provenance, environment
  approval and a dry-run mode.
- Compatibility, installation, uninstall, troubleshooting and release docs,
  contributing/security/support/conduct policies and GitHub issue/PR templates.
- An edge-safe `@stacknext/next` export so Next.js 15 webpack can compile
  instrumentation without bundling Node-only transport code.

### Changed

- Renamed public packages to the `@stacknext/*` scope and the CLI package to
  `@stacknext/cli` (the command remains `stacknext`).
- Renamed configuration to `stacknext.config.json`, runtime state to
  `.stacknext`, environment variables to `STACKNEXT_*`, MCP tools to
  `stacknext_*` and the agent skill to `stacknext-debugging`.
- The CLI now writes `.stacknext/run.json` and `.stacknext` records with private
  permissions and removes runtime state on clean shutdown.
- `stacknext dev` starts the child in its own process group on Unix and uses
  `taskkill /T /F` on Windows, so shutdown stops the Next.js child as well as the
  CLI.
- JavaScript projects receive `instrumentation.js`; TypeScript projects receive
  `instrumentation.ts`. Existing instrumentation is never overwritten.
- `init` reports `@stacknext/next` installation separately from the optional
  adapter packages and remains idempotent.
- Next.js 15 and 16 are both part of the compatibility matrix.
- Node.js engine remains `>=20.9.0`; release validation covers Node.js 22, 24
  and 26.

### Fixed

- Next.js 15 webpack `UnhandledSchemeError`/module resolution failures caused by
  Node built-ins in the instrumentation dependency graph.
- Stale `.stacknext/run.json` files and orphaned Next.js children after process
  shutdown.
- Generated instrumentation detection across TypeScript and JavaScript
  templates, including CRLF files.
- Inaccurate MCP prompt count and stale version references in documentation.

### Security

- Preserved the loopback-only collector, bearer-token ingestion, dashboard
  session cookie, Host/Origin/`Sec-Fetch-Site` checks, CSP and security headers.
- Preserved two-layer redaction and the prohibition on request/response bodies,
  headers, cookies, URL query values, SQL bind parameters and Playwright
  artifacts.
- Added package archive secret scanning and forbidden-path checks.
- Added explicit guidance for reporting vulnerabilities privately.

### Breaking changes

- The package scope is `@stacknext/*` and the CLI is `stacknext`.
- Configuration and runtime paths are `stacknext.config.json` and `.stacknext`.
- Environment variables use the `STACKNEXT_*` prefix.
- MCP tool names and the agent skill directory changed accordingly.
- CommonJS consumers are not supported. All packages are ESM-only.
- Next.js 14 and earlier are not supported.

### Known limitations

- Next.js Edge runtime and the Pages Router are unsupported.
- Drizzle query durations are unavailable through its logger API and are
  reported as `null`, not zero.
- Captured Playwright runs require one worker; parallel correlation is not
  verified.
- Regression comparisons are deterministic evidence, not statistical tests, and
  `inconclusive` is not a pass.
- Redaction is pattern-based, not a formal secret scanner.
- `@opentelemetry/sdk-trace-base` and `@opentelemetry/sdk-trace-node` remain on
  2.12.0. Upstream deprecates them in favor of `@opentelemetry/sdk-trace@3.0.0`,
  which requires Node.js 22.15 or newer; StackNext keeps its Node.js 20.9 floor
  for this release. There is no known vulnerability or runtime defect.
- `0.6.0` is bootstrapped from a local authenticated npm session because npm
  cannot configure trusted publishing before a package exists. It therefore has
  no provenance; trusted publishing and provenance apply from `0.6.1` onward.
