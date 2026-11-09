---
title: Development environment
description: Install, build and run the StackNext repository and example app.
---

## Requirements

- Node.js 20.9 or newer. Runtime verification used Node.js 24; CI uses 22.
- pnpm 12.16.1 (pinned by `packageManager`).
- Chromium for Playwright scenarios.
- No Docker or cloud account.

## Install and build

```bash
pnpm install
pnpm exec playwright install chromium
pnpm build
```

`pnpm build` builds packages in dependency order. The dashboard must build
before the CLI can serve it. Package `tsconfig.build.json` files resolve built
`dist` types, while package `tsconfig.json` files map `@stacknext/*` to source
for typechecking.

## Example app

```bash
pnpm --filter @stacknext/example dev
# or start the whole StackNext runtime:
cd apps/example
pnpm exec stacknext dev --open
```

The example app listens on `http://127.0.0.1:4402`; the collector/dashboard uses
`http://127.0.0.1:4400` by default, trying the next 25 loopback ports if busy.
`stacknext dev` writes `apps/example/.stacknext/run.json` and removes it on
graceful exit.

The app seeds `apps/example/data/stacknext-demo.db` on first use. Delete it or
call `POST /api/seed` to start over.

## Documentation site

```bash
pnpm docs:dev
```

This runs `mint dev` from `docs/`. Do not add a Mintlify runtime dependency to
the application. Website deployment is separate from npm publishing.

## Stopping cleanly

Send SIGINT/SIGTERM to the `stacknext dev` process so it closes the collector
and removes `.stacknext/run.json`. Check for orphaned `next dev` processes on
ports 4400–4425.

## Related

- [Testing](testing)
- [Repository structure](../architecture/packages)
- [Compatibility](../compatibility)
