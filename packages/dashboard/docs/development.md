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

`vite` serves the dashboard for UI work. The production build writes to
`packages/dashboard/dist`, which `@stacknext/cli` serves.

To exercise the full app, build first and run the example:

```bash
pnpm build
cd apps/example
pnpm exec stacknext dev --open
```

## Data

The dashboard has no fixtures of its own for normal development. It reads the
live collector API. Make requests to the example app to populate requests,
traces, errors, queries and diagnostics.

`packages/dashboard/test` contains component and route tests. Run the root test
command for the full suite:

```bash
pnpm test
```

## Assets

- The app icon and favicon live in `public/`.
- The Open Span symbol is inlined with `currentColor`.
- Fonts use `@fontsource-variable/inter`.
- There are no remote assets or telemetry calls.

## Packaging

`@stacknext/dashboard` publishes `dist` only. The CLI depends on it and resolves
the built dashboard directory at runtime. If the dashboard build is missing,
`stacknext doctor` reports a warning and the collector cannot serve the UI.

## Review checklist

- Preserve loopback-only behavior and the session-cookie boundary.
- Do not add outbound analytics or remote fonts.
- Keep deep links and the documented routes stable.
- Show coverage, diagnostics and regression limitations in the UI.
- Do not present `possible`, `not-observed` or `inconclusive` as confirmed
  outcomes.
