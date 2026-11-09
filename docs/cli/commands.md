---
title: Commands
description: Common StackNext CLI commands and the workflows they support.
---

All commands run from the Next.js app directory unless noted. `stacknext
<command> --help` prints the authoritative flags for the installed version.

## Setup and run

```bash
stacknext init [--install] [--agents | --skip-agents]
stacknext dev [--open] [--quiet] [--token <token>] [nextArgs...]
stacknext status [--json]
stacknext doctor [--json]
stacknext uninstall [--yes] [--keep-config] [--remove-data]
```

`dev` requires a `package.json` `dev` script. It starts the collector, runs the
script, and removes `.stacknext/run.json` on exit. Extra arguments are forwarded
to the app's dev command.

## Inspect the sample

```bash
stacknext coverage [--json]
stacknext diagnose [--id <id>] [--trace-id <trace-id>] [--category <category>] [--severity <severity>] [--json]
stacknext export [-o <file> | --stdout] [--force]
```

`coverage` reports observed evidence, not a health score. `export` writes a
redacted JSON file with mode `0600` and refuses to overwrite without `--force`.

## Regression

```bash
stacknext capture [--name <name>] [--json] [--quiet] -- <test command...>
stacknext runs list [--limit <n>] [--offset <n>] [--json]
stacknext runs show <run-id> [--json]
stacknext baseline save <run-id> --name <name> [--notes <text>] [--json]
stacknext baseline list [--limit <n>] [--offset <n>] [--json]
stacknext baseline show <baseline-id> [--json]
stacknext baseline remove <baseline-id> --yes [--json]
stacknext compare <baseline-id> <candidate-run-id> [--json] [--fail-on regression|inconclusive|any]
```

Capture uses one Playwright worker. `--fail-on` is the only CI gate. See
[runtime regression](../guides/regression).

## Snapshots

```bash
stacknext snapshot save [--label <text>] [--json]
stacknext snapshot list [--json]
stacknext snapshot show <snapshot-id> [--json]
stacknext snapshot export <snapshot-id> [-o <file> | --stdout]
stacknext snapshot import <file> [--label <text>] [--json]
stacknext snapshot delete <snapshot-id> --yes [--json]
```

Snapshots are frozen and never replayed. See [snapshots](../guides/snapshots).

## Agents

```bash
stacknext mcp [--collector <url>] [--token <token>]
stacknext skill path
stacknext skill install --client opencode|codex|claude-code [--force]
```

`mcp` reserves stdout for the protocol; diagnostics go to stderr. See
[MCP](../mcp) and [agent setup](agent-setup).

## Full reference

The installed package documentation has the complete command list, arguments
and exit behavior:

```text
node_modules/@stacknext/cli/docs/commands.md
```

Also available at [CLI package commands](../packages/cli/commands).
