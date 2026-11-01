# AGENTS.md

Repository conventions and invariants for NextScope. Read
[docs/architecture.md](docs/architecture.md) before changing package boundaries.

## What this is

NextScope is an MIT-licensed, local-first debugging center for Next.js App
Router apps. It collects OpenTelemetry spans plus Drizzle/Prisma query events
and Next.js errors over loopback, stores them in memory, and exposes a
dashboard, CLI and read-only MCP server. There is no cloud service, account or
outbound telemetry.

## Commands

Run from the repository root:

```bash
pnpm install
pnpm build          # topological build; required before e2e/benchmark
pnpm lint           # eslint over the whole repo
pnpm typecheck      # per-package tsc --noEmit against source paths
pnpm test           # vitest unit/integration tests
pnpm test:e2e       # real CLI + collector + example app + dashboard + MCP
pnpm benchmark      # synthetic ingest and read API benchmark (docs/benchmark.md)
```

Useful scoped commands:

```bash
pnpm --filter @nextscope/core build
pnpm --filter nextscope build
pnpm --filter @nextscope/example-next-app dev
pnpm exec nextscope dev --open       # from an app directory after build
pnpm exec nextscope doctor
```

The example app listens on `http://127.0.0.1:4402`; the collector/dashboard
uses `http://127.0.0.1:4400` by default. `nextscope dev` writes
`<app>/.nextscope/run.json` and cleans it up on exit.

## Repository layout

| Path | Responsibility |
| --- | --- |
| `packages/core` | Wire types, Zod schemas, redaction, normalization, config, bounded store, async transport. |
| `packages/next` | `instrumentation.ts` registration, OTel provider/exporter, error hook. |
| `packages/drizzle` | Drizzle `Logger` adapter. |
| `packages/prisma` | Prisma `$on('query')` adapter. |
| `packages/cli` | `nextscope` binary, collector HTTP server, dashboard hosting. |
| `packages/dashboard` | React/Vite static dashboard. |
| `packages/mcp` | Read-only stdio MCP server. |
| `apps/example-next-app` | Tasklight demo with Drizzle/better-sqlite3, slow and error routes. |
| `scripts/` | Real e2e and benchmark scripts. |

Dependency direction: `core` is the base. `next`, `drizzle`, `prisma`, `mcp`
and `cli` may depend on `core`; `cli` also depends on `dashboard` and `mcp`.
Never import CLI, Next.js, React or adapter code from `core`.

## Architecture invariants

- **Supported surface only.** Next.js 15/16 App Router, Node.js runtime.
  Do not patch undocumented Next.js internals and do not claim Edge or
  production support.
- **Never overwrite `instrumentation.ts`.** `nextscope init` must preserve an
  existing file and print manual instructions. `registerNextScope()` must yield
  to an already-registered OpenTelemetry provider instead of replacing it.
- **Local-only network.** Bind the collector to `127.0.0.1`/`localhost` and
  reject other hosts. Ingestion requires the bearer token; read APIs/SSE accept
  the bearer token or the dashboard session cookie. Keep Host/Origin/
  `Sec-Fetch-Site` checks, CSP and security headers intact.
- **Validate at the boundary.** Every ingest envelope is Zod-validated, body
  size is capped, and counts are bounded before entering the store.
- **Bounded memory.** The store is in memory with capacity/retention limits and
  drop counters. Instrumentation must never block a request on network I/O.
- **Two-layer redaction.** Redact in the app process before enqueueing and
  again in the collector before storing. A new field is not done until both
  layers and the privacy docs are updated.
- **Read-only MCP.** All tools stay `readOnlyHint: true`; the API client only
  performs GETs and refuses non-loopback URLs. stdout is protocol-only.

## Privacy and security rules

Never capture, transmit or store:

- request/response bodies, headers or cookies;
- URL query values or fragments;
- SQL bind parameters;
- machine/user identifiers.

URLs keep path only. Sensitive keys become `[redacted]`. Error messages and
stacks go through text redaction. Resource attributes use an allowlist. If a
change touches captured data, update `docs/privacy.md`, the config schema and
the tests that assert secrets do not appear in API/export output.

Tokens live in `.nextscope/run.json` with mode `0600`. Do not log tokens, put
them in fixtures, commit runtime state or add a remote transport.

## Build and typecheck layout

- `tsconfig.base.json` contains strict compiler options only and **no**
  workspace `paths`.
- Package `tsconfig.json` files map `@nextscope/*` to source for typechecking
  before a build exists.
- Package `tsconfig.build.json` files set `"paths": {}` and emit `src` to
  `dist`. Build-time resolution must use built `dist` types, never source.
- This split exists because Turbopack otherwise bundles `packages/next/src` and
  fails on `./exporter.js` imports.
- Never emit `.js`, `.d.ts` or `.map` files into `src/`. If they appear, delete
  them; output belongs in `dist/`.
- `pnpm -r build` handles topology (`core` before dependents, `dashboard`
  before `cli` serves it). Do not reorder around it manually unless necessary.

## Code style

- TypeScript strict mode, ESM, `.js` extensions in relative imports.
- Keep dependencies minimal and justified. Prefer Node built-ins and existing
  packages.
- Match surrounding naming and structure. Avoid `any`; validate external data
  with Zod and use the inferred types.
- Tests should exercise real behavior (real transport/collector where
  practical), not mocks of the code under test.
- No generated build output, logs, local databases or runtime state in commits.

## Verification workflow

Before declaring a change complete:

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm build`
5. `pnpm test:e2e` (after build). It reuses a live runtime if one exists,
   otherwise it starts and stops the example app itself.
6. For user-facing changes, exercise `nextscope dev` manually and check the
   dashboard, request detail, database, errors and MCP.
7. If captured data changed, verify the example error route still redacts
   `demo-url-secret`, `super-secret-demo-token` and `hunter2`.

Runtime verification in this repository used Node.js 24 and Next.js 16.4.3;
CI uses Node.js 22. Keep `engines` at Node `>=20.9.0` unless the support policy
changes.

When stopping a dev server, send SIGINT/SIGTERM to the `nextscope dev`
process so it can close the collector and remove `.nextscope/run.json`. Check
for orphaned `next dev` processes on ports 4400-4425 afterwards.
