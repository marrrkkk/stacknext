---
title: "@stacknext/dashboard"
description: The static React dashboard served by the StackNext local collector.
---

# @stacknext/dashboard

`@stacknext/dashboard` is the React/Vite single-page dashboard. It is built to
static assets and served by the CLI collector at the loopback dashboard URL.

## Who should read this

Maintainers and UI contributors. This is an **internal implementation package**
and is not installed or imported directly by applications. It is a dependency
of `@stacknext/cli`, which serves the built `dist` directory.

## Package boundary

The dashboard has no runtime exports other than `./package.json`. It reads the
collector's read API with the dashboard session cookie or bearer token. It does
not collect telemetry, run diagnostics or write regression records; the
collector does.

`react`, `react-dom`, `vite` and the StackNext source packages are dev
dependencies. The published archive contains built assets plus the package
metadata.

## Views

The dashboard includes:

- Overview with counts, latency, recent errors, coverage and top diagnostics;
- Requests and request detail;
- Traces and trace waterfall;
- Database queries;
- Errors and error detail;
- Diagnostics list and detail;
- Runs, baselines and comparisons, including deep links;
- Snapshots;
- Settings.

It also provides a command menu and responsive layouts. The exact routes are in
[Routes](routes.md).

## Brand

The dashboard uses the Open Span symbol with `currentColor` and the shared
StackNext favicon/PWA icons. Brand rules live in
`brand/README.md`. Do not introduce gradients,
shadows or a brand accent.

## Development

See [Development](development.md). User-facing dashboard documentation belongs
on the public docs site, not in this package.

## Related packages

- `@stacknext/core` supplies wire types and coverage/diagnostic shapes.
- `@stacknext/regression` supplies run/baseline/comparison types.
- `@stacknext/cli` builds and serves the dashboard.
