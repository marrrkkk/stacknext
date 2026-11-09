---
title: Testing
description: The repository's test layers, package archive checks and documentation validation.
---

## Unit and integration

```bash
pnpm test
```

Vitest covers schemas, redaction, transport, the store, diagnostics, regression
storage and comparison, MCP output, snapshots and CLI behavior. Tests use real
transport and collector behavior where practical instead of mocking the code
under test.

## Lint, typecheck and build

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Typecheck runs per package against source paths; the build emits `dist` and is
required before e2e or benchmark runs. Do not emit `.js`, `.d.ts` or `.map`
files into `src`.

## End-to-end

```bash
pnpm build
pnpm test:e2e
```

The e2e script starts the CLI, collector, example app, dashboard, MCP server and
regression flow. It reuses a live runtime if one exists. It covers capture →
baseline → candidate → compare, regression APIs, CLI records, snapshot
operations, MCP tools and dashboard deep links.

## Package archives

```bash
pnpm test:packages
pnpm test:consumer
```

`test:packages` builds tarballs, inspects their contents and validates required
docs, the CLI skill, exports, permissions and absent secrets. `test:consumer`
checks the installed-consumer path. Do not publish or push from these checks.

## Documentation

```bash
pnpm check:docs
```

This verifies generated package copies are current, navigation targets resolve,
frontmatter exists, package `files` include `docs`, links work and required
package documentation is present. See
[documentation conventions](documentation).

## User-facing verification

For changes that affect runtime behavior, start the example app and check the
dashboard pages, CLI commands, MCP tools and redaction-sensitive output. Warm
`/`, `/projects/1` and `/api/n-plus-one` before a baseline capture, and use one
Playwright worker with at least three samples.

## Related

- [Development environment](environment)
- [Release process](../releasing)
- [Agent compatibility testing](../agent-testing)
