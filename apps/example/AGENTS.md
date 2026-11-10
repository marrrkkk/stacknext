# AGENTS.md — apps/example

Scope: the real Next.js example used by e2e, benchmarks and documentation
screenshots. Read the root [`AGENTS.md`](../../AGENTS.md) first; repository-wide
rules still apply.

## What this app is

A private Next.js 16 App Router task tracker wired to the local collector. It
is the integration fixture for:

- `@stacknext/next` instrumentation and the Drizzle logger;
- slow, error, N+1, slow-DB, repeated-fetch and custom-span routes;
- Server Action success, failure, redirect, not-found and concurrent cases;
- annotated Playwright scenarios used by capture/baseline/compare.

It is not a starter template and is not published.

## Rules

- Keep the App Router, Node.js runtime and the real Drizzle/better-sqlite3
  database. Do not replace it with mocks or a static fixture.
- Do not remove or rename documented routes, pages or scenario annotations
  without updating `README.md`, the public docs and the e2e script. The stable
  scenario ids are `example.overview`, `example.project-detail` and
  `example.n-plus-one`.
- The fake secrets in the error and custom-span routes exist to prove
  redaction. Keep them fake, keep them documented, and never add a real token,
  credential or customer value.
- Playwright capture must use one worker and `trace`, `screenshot` and `video`
  disabled. Do not add Playwright artifacts to the repository.
- The SQLite database under `data/` is runtime state. Do not commit changes to
  it. Use `STACKNEXT_EXAMPLE_DATA_DIR` for an isolated run.
- Warm `/`, `/projects/1` and `/api/n-plus-one` before a baseline capture.
  Cold route-module spans can make a comparison inconclusive.
- Run `stacknext dev` from this directory. The app listens on
  `http://127.0.0.1:4402`; the collector/dashboard uses `4400`.

## Verification

```bash
pnpm --filter @stacknext/example typecheck
pnpm build
pnpm test:e2e
```

For manual checks, start `pnpm exec stacknext dev --open`, exercise the routes
in `README.md`, then stop the process with SIGINT/SIGTERM so
`.stacknext/run.json` is removed. Check for orphaned `next dev` processes on
ports 4400-4425.
