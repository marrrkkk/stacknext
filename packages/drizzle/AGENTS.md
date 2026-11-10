# AGENTS.md — @stacknext/drizzle

Scope: the Drizzle query logger adapter. Read the root
[`AGENTS.md`](../../AGENTS.md) first; repository-wide rules still apply.

## Rules

- The adapter implements Drizzle's `Logger` shape (`logQuery(query, params)`).
  Do not import `drizzle-orm` at runtime; keep it an optional peer.
- Query text is redacted. Bind-parameter values are counted only and never
  read, stored or transmitted.
- Drizzle does not expose a measured query duration through this logger.
  Report `durationMs: null` / `db.duration.measured: false`; never substitute
  zero or a wall-clock estimate.
- With no active StackNext transport the logger is a no-op. Telemetry failures
  are caught and may call `onError`; they must never break the application.
- Keep `source: 'drizzle'`, the operation inference and the bounded metadata
  fields stable. A new field needs both redaction layers and privacy docs.

## Verification

```bash
pnpm --filter @stacknext/drizzle typecheck
pnpm exec vitest run packages/drizzle/test
pnpm test
pnpm build
```

Update `docs/index.md`, `docs/configuration.md` or `docs/troubleshooting.md`
when the API or recorded fields change, then run `pnpm docs:sync`.
