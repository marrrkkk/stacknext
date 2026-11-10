# AGENTS.md — @stacknext/prisma

Scope: the Prisma query event adapter. Read the root
[`AGENTS.md`](../../AGENTS.md) first; repository-wide rules still apply.

## Rules

- Subscribe through Prisma's `$on('query', listener)`. Do not import
  `@prisma/client` at runtime; keep it an optional peer.
- Prisma must emit query events (`log: [{ emit: 'event', level: 'query' }]`).
  Without that configuration the adapter receives nothing; document it rather
  than polling or patching the client.
- Query text is redacted and parameters are never read. Record a duration only
  when Prisma supplies a finite, non-negative value; otherwise report it as
  unmeasured.
- Registration is idempotent for the same client instance and returns a
  cleanup function. A second call must not attach a second listener.
- Telemetry failures are caught and may call `onError`; they must never break
  the application.
- Keep `source: 'prisma'` and the bounded target metadata stable. A new field
  needs both redaction layers and privacy docs.

## Verification

```bash
pnpm --filter @stacknext/prisma typecheck
pnpm exec vitest run packages/prisma/test
pnpm test
pnpm build
```

Update `docs/index.md`, `docs/configuration.md` or `docs/troubleshooting.md`
when the API or recorded fields change, then run `pnpm docs:sync`.
