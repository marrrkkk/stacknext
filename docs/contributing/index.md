---
title: Contributing
description: Set up the StackNext repository, run the gates and follow the documentation architecture.
---

StackNext is an MIT-licensed pnpm monorepo. Read the repository
[`AGENTS.md`](https://github.com/marrrkkk/stacknext/blob/main/AGENTS.md) and
[architecture](../architecture) before changing package boundaries.

## Quick start

```bash
pnpm install
pnpm exec playwright install chromium
pnpm build
pnpm test
```

The build is topological and required before e2e and benchmark runs.

## The gates

| Command | Covers |
| --- | --- |
| `pnpm lint` | ESLint over the repository |
| `pnpm typecheck` | Per-package `tsc --noEmit` against source paths |
| `pnpm test` | Vitest unit and integration tests |
| `pnpm build` | Topological package build |
| `pnpm check:docs` | Generated docs and website changelog are current, and links resolve |
| `pnpm test:packages` | Package archives contain required docs and assets |
| `pnpm test:e2e` | Real CLI, collector, example app, dashboard, MCP and regression flow |

## Documentation

Package docs are canonical in `packages/<package>/docs`. The site copies and
CLI index are generated. Do not edit generated copies. See
[documentation conventions](documentation).

## Where to start

- [Development environment](environment)
- [Testing](testing)
- [Adding a package](documentation#adding-a-package)
- [Repository structure](../architecture/packages)
- [Release process](../releasing)
