# AGENTS.md — @stacknext/playwright

Scope: the optional Playwright fixture. Read the root
[`AGENTS.md`](../../AGENTS.md) first; repository-wide rules still apply.

## Boundary

The fixture is inert outside an active `stacknext capture` run. It must not
replace Playwright, change assertions, capture screenshots/videos/traces or
affect a normal `playwright test` run.

## Rules

- Inject W3C `traceparent` only for loopback and `baseURL` requests. Do not
  inject into unrelated third-party traffic.
- A sample is submitted only after the collector finds the injected trace id
  and a server span parented to the injected span id. Ambiguous correlation
  stays `incomplete`; there is no time-window fallback.
- Prefer the explicit `stacknext.scenario` annotation for stable identity.
  Captured runs use one worker until parallel correlation is verified.
- Capture configuration comes from the environment supplied by
  `stacknext capture`. Do not invent a second config surface.
- `@playwright/test >=1.40.0 <2` is an optional peer dependency. Do not make it
  a hard runtime dependency.
- Never send collector credentials to a non-loopback URL or write Playwright
  artifacts into `.stacknext`.

## Verification

```bash
pnpm --filter @stacknext/playwright typecheck
pnpm exec vitest run packages/playwright/test
pnpm test
pnpm build
pnpm test:e2e
```

Update `docs/fixture.md` and `docs/correlation.md` when the fixture or
verification rules change. Keep the public Playwright guides in `apps/docs/`
consistent.
