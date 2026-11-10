# AGENTS.md — @stacknext/core

Scope: the shared base package. Read the root [`AGENTS.md`](../../AGENTS.md)
first; repository-wide rules still apply.

## Boundary

`core` is the base of the dependency graph. Never import CLI, Next.js, React,
Playwright, dashboard, MCP or adapter code from this package. It must stay
usable in the app process, the collector and a plain Node script.

## Where changes belong

| Change | File |
| --- | --- |
| Wire fields and boundary validation | `src/schema.ts` |
| Diagnostic wire types | `src/diagnostics.ts` |
| App-side and collector-side sanitization | `src/redact.ts` |
| Span classification and Next.js allowlist | `src/framework.ts`, `src/normalize.ts` |
| Bounded in-memory storage | `src/store.ts` |
| Async transport and loopback resolution | `src/transport.ts` |
| Config schema and defaults | `src/config.ts`, `src/config-file.ts` |
| Snapshot payloads and storage | `src/snapshots.ts` |
| Coverage and verbose status | `src/coverage.ts`, `src/verbose.ts` |

## Invariants

- Every external payload is Zod-validated before it reaches the store.
- A captured field needs app-side and collector-side redaction, privacy docs
  and secret-leak tests before it is complete.
- Instrumentation must never block a request on network I/O. Keep transport
  queues bounded and batched.
- Defaults are 5,000 spans and a 600-second retention window. Capacity and
  retention drops must remain visible in health/status output.
- Snapshot writes are atomic, private and capped; imports are re-normalized and
  re-redacted. Never replay a snapshot into the live store.
- Keep the documented subpath exports (`./transport`, `./config-file`,
  `./snapshots`) compatible.
- Do not add a runtime dependency without a clear reason; prefer Node built-ins.

## Verification

```bash
pnpm --filter @stacknext/core typecheck
pnpm exec vitest run packages/core/test
pnpm test
pnpm build
```

Update [`docs/`](docs/index.md) and the public package page through
`pnpm docs:sync` when an exported type, limit or behavior changes. A schema
change also needs the collector, CLI, dashboard, MCP and regression checks
listed in the root verification workflow.
