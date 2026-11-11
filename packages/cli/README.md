# @stacknext/cli

Local-first runtime debugging, diagnostics and Playwright regression testing for
Next.js App Router apps and AI coding agents.

StackNext collects OpenTelemetry spans plus Drizzle/Prisma query events and
Next.js errors over loopback, stores them in a bounded in-memory sample, and
exposes a dashboard, CLI and read-only MCP server. It also derives deterministic
diagnostic findings, freezes samples into redacted snapshots and compares
Playwright-linked runtime captures against saved baselines. No cloud account,
hosted backend, AI API key or telemetry upload.

## Quick start

```bash
npm install --save-dev @stacknext/cli @stacknext/next
npx stacknext init
npx stacknext doctor
npx stacknext dev
```

`init` detects Next.js 15/16 with the App Router, writes
`stacknext.config.json`, and creates `instrumentation.ts` (or
`instrumentation.js` for a JavaScript project) only when none exists. Existing
instrumentation is preserved and a manual hook is printed. `dev` starts the
loopback collector and the app's own `dev` script.

Add `@stacknext/drizzle`, `@stacknext/prisma` or `@stacknext/playwright` only
when you use those integrations.

## Commands

```bash
stacknext init [--install]
stacknext dev [--open] [--quiet] [--token <token>] [nextArgs...]
stacknext status [--json]
stacknext doctor [--json]
stacknext coverage [--json]
stacknext diagnose [--id <id>] [--trace-id <id>] [--category <category>] [--severity <severity>] [--json]
stacknext capture [--name <name>] -- <test command...>
stacknext runs list|show
stacknext baseline save|list|show|remove
stacknext compare <baseline-id> <candidate-run-id> [--fail-on regression|inconclusive|any]
stacknext snapshot save|list|show|export|import|delete
stacknext export [-o <file> | --stdout]
stacknext uninstall [--yes] [--keep-config] [--remove-data]
stacknext mcp [--collector <url>] [--token <token>]
stacknext skill install --client opencode|codex|claude-code
```

`dev` writes `.stacknext/run.json` (`0600`) and passes the collector URL and
token to the app. `status`, `doctor`, `coverage`, `diagnose`, `snapshot`,
`export` and `mcp` use that runtime state. The collector binds to loopback and
ingestion requires the bearer token.

## Configuration

`stacknext.config.json` is validated by Zod. The main fields cover the project
name, collector capacity and retention, slow-request threshold, diagnostics
thresholds, database adapters, error/fetch capture, verbose tracing and
snapshots. See the installed
[configuration reference](docs/configuration.md) for every field and default.

## Documentation

- [CLI commands](docs/commands.md)
- [Configuration](docs/configuration.md)
- [Agent setup](docs/agent-setup.md)
- [Agent Skill](docs/skill.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Installed package index](docs/packages.md)

The same files ship in this package under `docs/`, so they match the installed
version. Public guides live on the
[documentation site](https://stack-next.mintlify.site).

## AI agents

The CLI ships the portable `stacknext-debugging` Agent Skill and a read-only
stdio MCP server. Start `stacknext dev`, then configure the client to run
`stacknext mcp` from the app directory. All MCP tools are read-only and only
perform GETs against the loopback collector. Install the skill with:

```bash
stacknext skill install --client opencode
stacknext skill install --client codex
stacknext skill install --client claude-code
```

See [agent setup](docs/agent-setup.md) and the public
[AI agent guide](https://stack-next.mintlify.site/ai-agents/setup).

## Development

This package is part of the StackNext pnpm monorepo:

```bash
pnpm --filter @stacknext/cli build
pnpm --filter @stacknext/cli typecheck
pnpm test
```

The collector and CLI tests use real transport and collector behavior where
practical. See the repository
[testing strategy](https://github.com/marrrkkk/stacknext/blob/main/docs/testing/testing-strategy.md).

## Requirements

- Node.js 20.9 or newer
- Next.js 15 or 16, App Router, Node.js runtime
- Playwright 1.40+ for runtime regression capture

Next.js Edge runtime and the Pages Router are not supported. The package is
ESM-only. See the [project README](https://github.com/marrrkkk/stacknext#readme)
and [compatibility matrix](https://stack-next.mintlify.site/compatibility).

License: MIT.
