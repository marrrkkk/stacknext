# Changelog

All notable changes to StackNext are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Bundled the `stacknext-debugging` Agent Skill in the `@stacknext/cli`
  archive. `stacknext skill path` prints the bundled directory, and
  `stacknext skill install --client opencode|codex|claude-code` copies it into a
  project without overwriting an existing copy unless `--force` is passed.
- The release archive check now fails when the bundled skill is missing or its
  `metadata.version` does not match the package version.

### Fixed

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
