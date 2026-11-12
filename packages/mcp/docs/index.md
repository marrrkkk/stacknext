---
title: "@stacknext/mcp"
description: Read-only Model Context Protocol server for StackNext telemetry, diagnostics, regression records and snapshots.
---

# @stacknext/mcp

`@stacknext/mcp` exposes the local StackNext collector to MCP clients over
stdio. All tools are read-only. The server reads the same redacted data as the
dashboard and never mutates the app, collector or saved records.

## Who should read this

Maintainers and users configuring an MCP client. This is a **public package**,
but it is normally installed automatically as a dependency of `@stacknext/cli`;
most users run `stacknext mcp` rather than importing it.

## Package boundary

`mcp` depends on `@stacknext/core` and `@stacknext/regression`. It does not
embed a collector, run diagnostics itself or write files. `StackNextApiClient`
only performs GET requests against loopback URLs.

## Public API

```ts
import {
  StackNextApiClient,
  StackNextApiError,
  createStackNextMcpServer,
  startMcpServer,
  verifyMcpServer,
  type McpCheckResult,
} from '@stacknext/mcp'
```

| Export | Purpose |
| --- | --- |
| `StackNextApiClient` | Read-only loopback HTTP client for collector APIs. |
| `StackNextApiError` | API/transport error with status context. |
| `createStackNextMcpServer(client)` | Builds the server around a `StackNextApiClient` for embedding or tests. |
| `startMcpServer(options)` | Starts the stdio server. |
| `verifyMcpServer(options)` | Checks the server over an in-memory transport and returns `McpCheckResult`. |

## Start through the CLI

```bash
stacknext dev          # terminal 1
stacknext mcp          # terminal 2
```

`stacknext mcp` reads `.stacknext/run.json` for the collector URL and token. It
also accepts `--collector <url>` and `--token <token>`. stdout is reserved for
MCP protocol messages; logs go to stderr.

Run `stacknext mcp --check` to verify the collector and the tool surface
without an AI client. It lists the tools and prompts, calls
`get_project_summary` over an in-memory transport, prints a JSON result and
exits non-zero on failure. This mode prints the check result to stdout instead
of starting the stdio protocol server.

## Documentation map

- [Tools](tools.md) — all twenty read-only tools and arguments.
- [Prompts](prompts.md) — the five guided prompts.
- [Security](security.md) — loopback, redaction and read-only guarantees.

## Related packages

- `@stacknext/cli` hosts the collector and dashboard.
- `@stacknext/diagnostics` computes the findings the tools return.
- `@stacknext/regression` defines the run/baseline/comparison records.
- `@stacknext/core` defines snapshots and wire types.
