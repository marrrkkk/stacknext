# AGENTS.md — @stacknext/next

Scope: Next.js instrumentation and the OpenTelemetry exporter. Read the root
[`AGENTS.md`](../../AGENTS.md) first; repository-wide rules still apply.

## Boundary

This package runs only on the Next.js Node.js runtime. The `edge` export is an
inert module so Edge bundling stays safe; do not claim Edge support.

## Invariants

- `register()` yields to an already-registered OpenTelemetry provider instead
  of replacing it. Never create a second SDK.
- `stacknext init` never overwrites an existing `instrumentation.ts`/`.js`.
  Manual changes must preserve the user's registration and return values.
- Keep the documented Next.js span allowlist in
  `@stacknext/core` (`src/framework.ts`) aligned with Next.js 15/16. Retain
  unknown span types as verbose evidence rather than guessing.
- `NEXT_OTEL_VERBOSE=1` is the only verbose switch. Do not use
  `NEXT_PRIVATE_*` or patch undocumented internals. An explicit inherited
  value, including `0`, wins over `instrumentation.verbose`.
- The exporter redacts attributes, names, resources, events and status text
  before enqueueing. Network I/O stays on the transport timer, never the
  request path.
- `withStackNextSpan`, `withStackNextSpanSync` and `withStackNextAction` are
  optional helpers. They preserve return values and errors, sanitize
  attributes and are no-ops without an active provider.
- Do not claim automatic Server Component or Server Action tracing.

## Verification

```bash
pnpm --filter @stacknext/next typecheck
pnpm exec vitest run packages/next/test
pnpm test
pnpm build
pnpm test:e2e
```

Update `docs/instrumentation.md`, `docs/configuration.md` or
`docs/custom-spans.md` when behavior changes. Captured-data changes also need
both redaction layers and the secret-leak checks in the root workflow.
