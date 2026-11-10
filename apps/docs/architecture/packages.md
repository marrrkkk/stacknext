---
title: Package architecture
description: Package responsibilities, dependency direction and public versus internal boundaries.
---

StackNext is a pnpm monorepo. Dependencies point toward `core`; no package
imports CLI, Next.js, React, Playwright or adapter code from `core`.

```text
@stacknext/core
├── @stacknext/diagnostics
│   └── @stacknext/regression
│       └── @stacknext/playwright
├── @stacknext/next
├── @stacknext/drizzle
├── @stacknext/prisma
├── @stacknext/mcp
├── @stacknext/dashboard
└── @stacknext/cli
    ├── @stacknext/dashboard
    ├── @stacknext/diagnostics
    ├── @stacknext/mcp
    └── @stacknext/regression
```

The exact direction is enforced by package manifests and the repository
architecture rules.

| Package | Visibility | Responsibility |
| --- | --- | --- |
| `core` | Internal | Wire types and Zod schemas, redaction, normalization, config, bounded store, transport, snapshots |
| `diagnostics` | Internal | Fingerprinting, six rules, filtering, overview and detail evidence |
| `regression` | Internal | Capture, baseline and comparison schemas, identities, environment, atomic storage |
| `playwright` | Public optional | Fixture, trace-context injection, probing and correlation submission |
| `next` | Public | `instrumentation.ts` registration, OTel provider/exporter, error hook, manual span helpers |
| `drizzle` | Public optional | Drizzle `Logger` adapter |
| `prisma` | Public optional | Prisma `$on('query')` adapter |
| `mcp` | Internal | Read-only stdio MCP server, output schemas, prompts |
| `dashboard` | Internal | React/Vite static dashboard |
| `cli` | Public | Binary, collector HTTP server, commands, dashboard host |

## Why some public packages are internal

`core`, `diagnostics`, `regression`, `mcp` and `dashboard` are published because
`cli` depends on them, but consumers should not install them directly. Their
documentation is for maintainers and advanced contributors. The
[package index](../packages/index) distinguishes public integration packages
from internal ones.

## Documentation lives with the package

Each package has a `docs/` directory included in its npm archive. The site
copies under `apps/docs/packages/` are generated from those canonical files. See
[documentation architecture](https://github.com/marrrkkk/stacknext/blob/main/docs/development/documentation.md).

## Related

- [Architecture overview](../architecture)
- [Boundaries](boundaries)
- [Repository layout](https://github.com/marrrkkk/stacknext/blob/main/docs/development/environment-setup.md)
