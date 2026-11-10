---
title: Contributing
description: Set up the StackNext repository, run the gates and find the contributor documentation.
---

StackNext is an MIT-licensed pnpm monorepo. Contributions are welcome, with a
focus on small, evidence-backed changes.

## Quick start

```bash
git clone https://github.com/marrrkkk/stacknext.git
cd stacknext
pnpm install
pnpm exec playwright install chromium
pnpm build
pnpm test
```

The build is topological and required before e2e and benchmark runs. Node.js
24 is pinned in `.nvmrc`; the published engine minimum is Node.js 20.9.

## The gates

| Command | Covers |
| --- | --- |
| `pnpm lint` | ESLint over the repository |
| `pnpm typecheck` | Per-package `tsc --noEmit` against source paths |
| `pnpm test` | Vitest unit and integration tests |
| `pnpm build` | Topological package build |
| `pnpm check:docs` | Generated docs, navigation, links and the website changelog |
| `pnpm test:packages` | Package archives contain required docs and assets |
| `pnpm test:e2e` | Real CLI, collector, example app, dashboard, MCP and regression flow |

## Contributor documentation

The repository keeps engineering documentation separate from this public site:

- [Engineering knowledge base](https://github.com/marrrkkk/stacknext/blob/main/docs/README.md)
- [Development environment](https://github.com/marrrkkk/stacknext/blob/main/docs/development/environment-setup.md)
- [Testing strategy](https://github.com/marrrkkk/stacknext/blob/main/docs/testing/testing-strategy.md)
- [Documentation architecture](https://github.com/marrrkkk/stacknext/blob/main/docs/development/documentation.md)
- [Release process](https://github.com/marrrkkk/stacknext/blob/main/docs/deployment/release-process.md)
- [Architecture boundaries](https://github.com/marrrkkk/stacknext/blob/main/docs/architecture/boundaries.md)
- [Repository conventions](https://github.com/marrrkkk/stacknext/blob/main/AGENTS.md)

## Where to start

- [Package architecture](../architecture/packages)
- [Security and privacy](../privacy)
- [Runtime regression testing](../regression-testing)
- [AI agent support](../ai-agents/index)
- [GitHub issues](https://github.com/marrrkkk/stacknext/issues)

Package docs are canonical in `packages/<package>/docs`. The site copies and the
CLI index are generated; edit the canonical file and run `pnpm docs:sync`.
