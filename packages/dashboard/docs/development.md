---
title: Development
description: Build and run the StackNext dashboard locally.
---

# Development

## Commands

From the repository root:

```bash
pnpm --filter @stacknext/dashboard dev
pnpm --filter @stacknext/dashboard build
pnpm --filter @stacknext/dashboard typecheck
```

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:e709ca5d57ab669d93f2bd198a2a99d16ff5ce21ca82ffcd40a4255595e2af80 -->

`vite` serves the dashboard for UI work at `http://localhost:4401`.
With the collector running, first open `http://localhost:4400/` in the same
browser session to establish its dashboard session cookie, then open Vite.
Use the same hostname for both URLs: if using `127.0.0.1` for Vite, first visit
`http://127.0.0.1:4400/`. Cookies are shared across ports, but not between
`localhost` and `127.0.0.1`. Vite proxies `/api` to the collector; opening Vite
alone in a fresh browser session does not issue the cookie needed for API reads. The production build writes to
`packages/dashboard/dist`, which `@stacknext/cli` serves.

<!-- /coderabbit-ai-generated:v1 -->

To exercise the full app, build first and run the example:

```bash
pnpm build
cd apps/example
pnpm exec stacknext dev --open
```

## Performance benchmark

The dashboard has a Playwright-based runtime benchmark that exercises the built
collector and dashboard with synthetic ingest at 10 events per second:

```bash
pnpm build
pnpm benchmark:dashboard
pnpm benchmark:dashboard -- --enforce --verbose
```

It reports read requests per settled 10-second window for every route, long
tasks, hidden-tab requests, heap and DOM counters after forced GC, and gzip
sizes for the initial and route JavaScript chunks. `--verbose` also prints the
per-endpoint request counts. `--enforce` fails on the plan budgets: at most 60
read requests per window, no long task above 100 ms, no hidden-tab reads, less
than 10 MiB heap growth, no more than 500 extra DOM nodes or 100 extra listeners,
a largest initial chunk at or below 120 KiB gzip and a largest route chunk at or
below 40 KiB gzip.

The hidden-tab check overrides `document.hidden` because headless Chromium keeps
every page visible. Treat the numbers as machine-specific comparisons, not a CI
promise. See the repository
[benchmark documentation](../../../docs/testing/benchmarks.md#dashboard-benchmark)
for the method and recorded results.

## Data

The dashboard has no fixtures of its own for normal development. It reads the
live collector API. Make requests to the example app to populate requests,
traces, errors, queries and diagnostics.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:fe2e5cd58634599f440f5b6916ee13ff23255fc02f0504d3802bf6802183c664 -->

`packages/dashboard/test` contains component and route tests. Run the root test
command for the Vitest unit/integration suite (including dashboard tests):

<!-- /coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:b657bace04c0c901ec21e7f21bfe46c03b25678d4b7b434aa6767695ce855557 -->

```bash
pnpm test
```

Browser end-to-end checks run separately with `pnpm test:e2e`. Build first
with `pnpm build` and stop the example runtime before running them so the
script can start and stop its own runtime.

<!-- /coderabbit-ai-generated:v1 -->

## Assets

- The app icon and favicon live in `public/`.
- The Open Span symbol is inlined with `currentColor`.
- Fonts use `@fontsource-variable/inter`.
- There are no remote assets or telemetry calls.

## Packaging

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:177db3123e6955b864904efe7428f3891e8c562d1bd2751311031b63641a3fc3 -->

`@stacknext/dashboard` publishes both `dist` and `docs`. The CLI depends on it and resolves
the built dashboard directory at runtime. If the dashboard build is missing,
`stacknext doctor` reports a warning and the collector cannot serve the UI.

<!-- /coderabbit-ai-generated:v1 -->

## Review checklist

- Preserve loopback-only behavior and the session-cookie boundary.
- Do not add outbound analytics or remote fonts.
- Keep deep links and the documented routes stable.
- Show coverage, diagnostics and regression limitations in the UI.
- Do not present `possible`, `not-observed` or `inconclusive` as confirmed
  outcomes.
