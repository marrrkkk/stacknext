# Development environment

## Requirements

- Node.js 20.9 or newer. The repository pins Node.js 24 in `.nvmrc`; CI runs
  22, 24 and 26.
- pnpm 12.16.1, pinned by `packageManager`.
- Chromium for Playwright scenarios and e2e.
- No Docker, cloud account or hosted service.

## Install and build

```bash
git clone https://github.com/marrrkkk/stacknext.git
cd stacknext
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build
```

On Linux, use `pnpm exec playwright install --with-deps chromium` to install
the browser's system libraries as well. The step needs root or sudo.

`pnpm build` builds packages in dependency order. The dashboard must build
before the CLI can serve it. Package `tsconfig.build.json` files resolve built
`dist` types, while package `tsconfig.json` files map `@stacknext/*` to source
for typechecking. See [repository conventions](repository-conventions.md).

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
call `POST /api/seed` to start over. For isolated Playwright runs, set
`STACKNEXT_EXAMPLE_DATA_DIR` to a separate directory.

## Documentation site

```bash
pnpm docs:dev
```

This runs `mint dev` from `apps/docs/`. The public Mintlify site is independent
from npm publishing and from the CLI runtime. The engineering knowledge base is
the root [`docs/`](../README.md) directory.

```bash
pnpm docs:sync   # regenerate package copies and the CLI index
pnpm check:docs  # validate navigation, links, frontmatter and generated output
```

## Useful commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm test:packages
pnpm test:consumer --next 16.4.3 --pm npm --skip-build
pnpm benchmark
pnpm benchmark:diagnostics
pnpm benchmark:verbose
```

## Stopping cleanly

Send SIGINT/SIGTERM to the `stacknext dev` process so it closes the collector
and removes `.stacknext/run.json`. Check for orphaned `next dev` processes on
ports 4400-4425 afterwards.

## Related

- [Testing strategy](../testing/testing-strategy.md)
- [Repository conventions](repository-conventions.md)
- [Package architecture](../architecture/packages.md)
- [Public compatibility matrix](../../apps/docs/compatibility.md)
