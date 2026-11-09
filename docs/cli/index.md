---
title: CLI
description: The stacknext binary starts the collector, hosts the dashboard and manages regression and snapshot records.
---

`@stacknext/cli` installs the `stacknext` binary. It is the only StackNext
process you start directly. The binary:

- starts the loopback collector and ingests validated telemetry;
- serves the static dashboard;
- runs the app's `dev` script and passes the collector URL and token;
- exposes coverage, diagnostics, export and status commands;
- writes and reads regression and snapshot records;
- launches the read-only MCP server.

## Install

```bash
pnpm add -D @stacknext/cli
pnpm exec stacknext init
pnpm exec stacknext dev
```

`@stacknext/cli` is public, but most projects also add `@stacknext/next` for
instrumentation. `init --agents` adds managed project instructions for AI
agents.

## Command groups

| Group | Commands |
| --- | --- |
| Setup | `init`, `uninstall` |
| Run | `dev`, `status`, `doctor`, `export` |
| Inspect | `coverage`, `diagnose` |
| Regression | `capture`, `runs`, `baseline`, `compare` |
| Snapshots | `snapshot save/list/show/export/import/delete` |
| Agents | `mcp`, `skill path/install` |

See [commands](commands) for usage and the version-matched
[CLI command reference](../packages/cli/commands).

## Local vs global

A project-local install is recommended. `pnpm exec stacknext` resolves the
version recorded in the project lockfile. A global install can drift from the
project's StackNext packages and is not required for the MCP server.

## Related

- [CLI configuration](../packages/cli/configuration)
- [Agent setup](agent-setup)
- [Troubleshooting](../troubleshooting)
