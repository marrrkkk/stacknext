# AGENTS.md — @stacknext/dashboard

Scope: the React/Vite dashboard served by the CLI collector. Read the root
[`AGENTS.md`](../../AGENTS.md) first; repository-wide rules still apply.

## Boundary

The dashboard is a static read-only client. It reads the collector API with the
dashboard session cookie or bearer token and never collects telemetry, runs
diagnostics or writes regression/snapshot records. It has no runtime exports
other than `./package.json`.

## Rules

- Preserve loopback-only behavior and the session-cookie boundary. Do not add
  outbound analytics, remote fonts, third-party scripts or telemetry calls.
- Keep documented routes and deep links stable. The route table is in
  `docs/routes.md`; update it and the e2e deep-link checks when a route changes.
- Show coverage, diagnostics and regression limitations in the UI. Never
  present `possible`, `not-observed` or `inconclusive` as a confirmed outcome.
- The dashboard reads already-redacted data. Do not add a raw request/response,
  header, cookie, query value or SQL bind parameter to a view.
- Keep the Open Span brand symbol, `currentColor`, shared tokens and dark/light
  behavior consistent. Do not introduce a second brand accent or remote asset.
- `@stacknext/dashboard` must build before `@stacknext/cli` is served. The
  production build writes `packages/dashboard/dist`.
- Vite proxies `/api` to the collector. Open the collector first on the same
  hostname so the session cookie is present.

## Verification

```bash
pnpm --filter @stacknext/dashboard typecheck
pnpm exec vitest run packages/dashboard/test
pnpm test
pnpm build
pnpm test:e2e
```

Update `docs/routes.md` or `docs/development.md` for user-visible changes, then
run `pnpm docs:sync` and `pnpm check:docs`. Exercise the affected pages against
the example app, not only the unit tests.
