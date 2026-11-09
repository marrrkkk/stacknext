---
title: StackNext local documentation
description: Entry point and package index for the version-matched StackNext documentation installed with @stacknext/cli.
---

# StackNext local documentation

This directory ships inside the installed `@stacknext/cli` package. It is the
fastest way for a developer or coding agent to find documentation that matches
the installed StackNext version, without network access.

## Start here

1. Read [commands](commands.md) for the CLI surface.
2. Read [configuration](configuration.md) for `stacknext.config.json`.
3. Read [agent setup](agent-setup.md) when configuring an AI client.
4. Read the package document for every package involved in the task.

The generated [package index](packages.md) lists the documented packages, their
versions, their role and the path to each package's own documentation.

## Version matching

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:e6af214d2a4b32adab7521d25e5832f83653a892caaf39c3eddbd1f46461e7a6 -->

Packages currently shipping a `docs/` directory include package-specific
documentation in the same npm archive as their code. That documentation
therefore matches the installed version by construction.

<!-- /coderabbit-ai-generated:v1 -->

Check a version before relying on an API:

```bash
node -p "require('@stacknext/next/package.json').version"
```

Read the `package.json` next to the package's `docs/` directory. Do not assume
that this documentation matches a different release or the project's main
branch.

## Locating package documentation

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:e89f29adfff1f8925389640671146bfdf24816a645149772ceb1d2ad0c5288cd -->

Package docs ship inside installed packages that currently include a `docs/` directory. Start from this CLI `docs/`
directory and use the relative paths in the generated
[package index](packages.md), because optional and internal packages may not sit
at the app's root `node_modules` path.

<!-- /coderabbit-ai-generated:v1 -->

Direct integration packages are normally at the app root when installed there:

```text
node_modules/@stacknext/cli/docs/index.md
node_modules/@stacknext/next/docs/index.md
node_modules/@stacknext/drizzle/docs/index.md
node_modules/@stacknext/prisma/docs/index.md
node_modules/@stacknext/playwright/docs/index.md
```

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:a2a2d1bacf1a7101a5884977852db99861650a2a201f6dffdf985fa4ec246abe -->

`@stacknext/core` and `@stacknext/regression` are installed through the CLI
and ship documentation. In a pnpm workspace, locate their docs using the
relative paths listed in `packages.md`. The CLI also installs
`@stacknext/diagnostics`, `@stacknext/mcp` and `@stacknext/dashboard`, which
do not currently ship `docs/` directories.

<!-- /coderabbit-ai-generated:v1 -->

If neither the direct path nor the relative index path exists, the package is
not available to this project. Do not invent its documentation path or assume
its APIs are available.

## Which package to read

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:cce8643ce7fa90852e67d36250d2daa286bf00bf29c08506b2ca194409f5b5a8 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:4ccde9b676836098da0c0e0810b43c6306a967030d387f11f30aed3a2b950eab -->

| Task | Read |
| --- | --- |
| Install, configure or run StackNext | `cli`, `next` |
| Change `instrumentation.ts` or manual spans | `next` |
| Work with shared types, redaction, transport or snapshots | `core` |
| Change or interpret diagnostic findings | CLI [commands](commands.md) |
| Work with Playwright capture, baselines or comparisons | `playwright`, `regression` |
| Add Drizzle query evidence | `drizzle` |
| Add Prisma query evidence | `prisma` |
| Configure an MCP client or use runtime evidence | CLI [agent setup](agent-setup.md) |

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->

## Optional and internal packages

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:a2dd9b11290d93c4f272aa68aa40252cdb2bb1e42b5f87e52a85da57d3345086 -->

- **Public integration packages:** `@stacknext/cli`, `@stacknext/next`,
  `@stacknext/playwright`, `@stacknext/drizzle`, `@stacknext/prisma`.
- **Installed by the CLI:** `@stacknext/core`, `@stacknext/diagnostics`,
  `@stacknext/regression`, `@stacknext/mcp`, `@stacknext/dashboard`.
- Optional packages are only present when the project installed them. Never
  instruct an agent to read a package directory that is not installed.
- Internal packages that ship `docs/` are documented for maintainers;
  applications should not install them directly.

<!-- /coderabbit-ai-generated:v1 -->

## Rules for coding agents

- Prefer this local documentation over model memory or online documentation for
  the installed version.
- Verify the package version before using an API or example.
- Do not assume undocumented exports, configuration keys or integrations exist.
- For runtime investigation, use the StackNext MCP tools where available.
- Follow the installed `stacknext-debugging` Agent Skill for evidence-first
  workflows.
- Treat diagnostic findings as evidence, not confirmed root causes.
- Treat `inconclusive` regression comparisons as inconclusive, not passes.

## More documentation

- [Agent setup](agent-setup.md) — `stacknext init --agents`, MCP and skills.
- [Skill installation](skill.md) — supported clients and paths.
- [Troubleshooting](troubleshooting.md) — missing telemetry, ports and clients.
- [Package index](packages.md) — generated list of installed package docs.
