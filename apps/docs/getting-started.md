---
title: Full setup guide
description: Configuration, dashboard routes, adapters, commands, custom spans and troubleshooting in one reference.
---

# Getting started

StackNext is a local debugging center for Next.js App Router applications. It
collects OpenTelemetry spans from your development server, adds Drizzle/Prisma
query events and Next.js request errors, and shows everything in a local
dashboard, CLI and read-only MCP server.

## Requirements

- Node.js **20.9 or newer**
- pnpm **12** (the repository pins `pnpm@12.16.1`)
- Next.js **15 or 16** with the **App Router**
- The **Node.js runtime**. Edge runtime is not supported.

## Run the example app

From a checkout of this repository:

```bash
pnpm install
pnpm build
cd apps/example
pnpm exec stacknext dev --open
```

`stacknext dev` starts the collector and the app's own `dev` script. Open
`http://127.0.0.1:4400` and make a request:

- `http://127.0.0.1:4402/` — server render with Drizzle queries
- `http://127.0.0.1:4402/api/projects` — JSON API
- `http://127.0.0.1:4402/api/slow?delay=350` — slow request
- `http://127.0.0.1:4402/api/error?token=demo-url-secret` — failing route
- `http://127.0.0.1:4402/api/custom-work` — async and sync custom spans
- `http://127.0.0.1:4402/actions-demo` — wrapped Server Action scenarios
- `http://127.0.0.1:4402/api/n-plus-one` — eight repeated task queries
- `http://127.0.0.1:4402/api/n-plus-one-fixed` — batched counterpart
- `http://127.0.0.1:4402/api/slow-db` — slow recursive database query
- `http://127.0.0.1:4402/api/repeated-fetch` — three uncached fetches

The example app seeds `apps/example/data/stacknext-demo.db` on first use.

To start over by deleting that directory, stop the app first, delete the directory,
then restart the app. Alternatively, use `POST /api/seed` while the app is running
to reset the demo data without restarting.

Check what the current sample actually observed:

```bash
pnpm exec stacknext coverage
pnpm exec stacknext coverage --json
```

The dashboard shows the same evidence under **Instrumentation coverage** on the
Overview page. See [instrumentation coverage](instrumentation-coverage.md) for
status semantics and limitations.

Run the deterministic diagnostics:

```bash
pnpm exec stacknext diagnose
pnpm exec stacknext diagnose --category database --severity warning
pnpm exec stacknext diagnose --trace-id <trace-id>
pnpm exec stacknext diagnose --id <diagnostic-id> --json
```

`diagnose` reads the same collector report as the dashboard's **Diagnostics**
page, `GET /api/diagnostics`, JSON export and MCP. The six rules cover grouped
N+1-shaped queries, slow requests, self-time slow spans, grouped repeated
external HTTP calls, single or repeated request errors and 5xx responses without
a correlated error. Findings are evidence, not confirmed root causes: `possible`
means the pattern is consistent with a problem, and `observed` means the
measurement exists. Read the finding's evidence, verification steps and limitations before
changing code. See [diagnostics](architecture.md#diagnostics) for the engine and
[limitations](limitations.md#diagnostics) for what it cannot prove.

## Runtime regression testing

StackNext can also correlate Playwright scenarios with the server traces they
produce, save a completed capture as a baseline and compare a later candidate:

```bash
pnpm exec stacknext capture --name "baseline" --quiet --json \
  -- pnpm exec playwright test --workers=1 --repeat-each=3 > baseline.json
RUN_ID=$(jq -r .run.id baseline.json)
pnpm exec stacknext baseline save "$RUN_ID" --name "baseline" --json > saved.json
BASELINE_ID=$(jq -r .baseline.id saved.json)

pnpm exec stacknext capture --name "candidate" --quiet --json \
  -- pnpm exec playwright test --workers=1 --repeat-each=3 > candidate.json
CANDIDATE_ID=$(jq -r .run.id candidate.json)
pnpm exec stacknext compare "$BASELINE_ID" "$CANDIDATE_ID" --fail-on regression
```

The Playwright fixture is optional, captured runs use one worker, and the
comparison is report-only unless `--fail-on` matches. See
[runtime regression testing](regression-testing.md),
[Playwright integration](playwright-integration.md) and
[comparison methodology](comparison-methodology.md).

## Use it in an existing app

Inside the app project:

```bash
npm install --save-dev @stacknext/cli @stacknext/next
npx stacknext init
npx stacknext dev
```

pnpm and other package managers work the same way:

```bash
pnpm add -D @stacknext/cli @stacknext/next
pnpm exec stacknext init
pnpm exec stacknext dev
```

`stacknext init`:

1. Checks that the project uses Next.js 15/16 with `app/` or `src/app/`.
2. Creates `stacknext.config.json` when one does not exist.
3. Creates `instrumentation.ts` for a TypeScript project, or
   `instrumentation.js` for a JavaScript project, when one does not exist.
4. Detects Drizzle and Prisma and prints the adapter snippets.
5. Prints the exact install command when `@stacknext/next` is missing. Pass
   `--install` to run it automatically.
6. Adds or updates managed AI-agent instructions in `AGENTS.md` only when
   `--agents` is passed. `--skip-agents` explicitly skips them.

See [agent setup](cli/agent-setup) and
[AGENTS.md integration](ai-agents/agents-md).

### Existing instrumentation is never replaced

If `instrumentation.ts` or `instrumentation.js` already exists, `init` leaves it
untouched and prints a manual patch:

```ts
import {
  registerStackNext,
  onRequestError as stackNextOnRequestError,
} from '@stacknext/next'

export async function register() {
  // Keep your existing monitoring setup.
  await registerStackNext()
}

// If you do not already export an error hook:
export const onRequestError = stackNextOnRequestError
```

If you already export `onRequestError`, call `stackNextOnRequestError(error,
request, context)` inside it. StackNext yields to an existing OpenTelemetry
tracer provider instead of replacing it. The generated hook checks
`NEXT_RUNTIME === 'nodejs'` and imports StackNext dynamically so Edge bundling
does not pull in Node-only modules.

## Database adapters

### Drizzle

Drizzle's `Logger` interface receives SQL text and bind parameters. Add the
StackNext logger when you create the client:

```ts
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createStackNextDrizzleLogger } from '@stacknext/drizzle'

export const db = drizzle(client, {
  logger: createStackNextDrizzleLogger({ databaseSystem: 'sqlite' }),
})
```

Bind parameters are counted but never read or sent. Drizzle's logger API does
not expose query duration, so `durationMs` is `null` for these queries.

### Prisma

Prisma must be configured to emit query events. Then register the adapter:

```ts
import { PrismaClient } from '@prisma/client'
import { instrumentPrismaClient } from '@stacknext/prisma'

const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'query' }],
})

const stop = instrumentPrismaClient(prisma, {
  databaseSystem: 'postgresql',
})
// Optional: call stop() during shutdown.
```

Prisma query events include a duration. SQL text is redacted; `params` are
never read. `instrumentPrismaClient` is idempotent for the same client.

## Configuration

`stacknext.config.json` is created by `init` and loaded by `stacknext dev`.
Defaults are shown below.

```json
{
  "projectName": "my-app",
  "dashboard": { "port": 4400 },
  "collector": { "maxSpans": 5000, "retentionMs": 600000 },
  "instrumentation": {
    "verbose": false,
    "captureFetch": true,
    "captureErrors": true
  },
  "privacy": {
    "captureHeaders": false,
    "captureRequestBodies": false,
    "captureSqlParameters": false,
    "redactSensitiveData": true
  },
  "database": { "drizzle": false, "prisma": false },
  "diagnostics": {
    "enabled": true,
    "repeatedQueryMin": 5,
    "slowSpans": {
      "databaseMs": 250,
      "httpMs": 500,
      "customMs": 300,
      "frameworkMs": 500,
      "otherMs": 500
    },
    "repeatedHttpMin": 3,
    "errorGrouping": true,
    "errorGroupMin": 2,
    "maxFindings": 100
  },
  "slowRequestMs": 500,
  "snapshots": {
    "autoOnExit": true,
    "autoOnError": true,
    "autoKeep": 10,
    "maxBytes": 67108864
  }
}
```

The bundled example app overrides `retentionMs` to `900000` and
`slowRequestMs` to `250`, so `/api/slow?delay=350` is marked as slow.

| Field | Meaning |
| --- | --- |
| `dashboard.port` | Preferred loopback dashboard port. StackNext tries the next 25 ports if it is busy. |
| `collector.maxSpans` | In-memory span capacity. Error and query buffers are derived from it. |
| `collector.retentionMs` | How long received telemetry stays in memory. |
| `instrumentation.verbose` | Enables the documented `NEXT_OTEL_VERBOSE=1` Next.js span set. It also turns on StackNext debug logs. |
| `instrumentation.captureFetch` | Captures Next.js `AppRender.fetch` spans. Set `false` to drop them. |
| `instrumentation.captureErrors` | Calls the Next.js error hook. Set `false` to disable error collection. |
| `privacy.*` | StackNext refuses to enable headers, bodies or SQL parameters; these must stay `false`. |
| `database.drizzle` / `database.prisma` | Used by `init`/`doctor` for setup checks. Adapters still need explicit registration. |
| `diagnostics.enabled` | Enables the deterministic report and its API/CLI/dashboard/MCP surfaces. |
| `diagnostics.repeatedQueryMin` | Minimum repeated normalized queries in one trace for `n-plus-one-queries` (2–100). |
| `diagnostics.slowSpans.*` | Per-category slow-span thresholds in milliseconds: database, HTTP, custom, framework and other. |
| `diagnostics.repeatedHttpMin` | Minimum repeated normalized HTTP endpoints in one trace for `repeated-external-http`. |
| `diagnostics.errorGrouping` / `errorGroupMin` | Enable error fingerprint grouping and set the occurrence count used to label a finding as repeated. A single observed error is still reported. |
| `diagnostics.maxFindings` | Hard cap on findings in one report (10–1,000, default 100). |
| `slowRequestMs` | Threshold used by the dashboard, CLI and MCP slow-request views. |
| `snapshots.autoOnExit` | Save a snapshot when `stacknext dev` exits gracefully and the sample has data. |
| `snapshots.autoOnError` | Save a snapshot on the first error, with a 60-second cooldown. |
| `snapshots.autoKeep` | Number of automatic exit/error snapshots to keep (1–100, default 10). Manual and imported snapshots are never rotated. |
| `snapshots.maxBytes` | Per-snapshot size cap in bytes (1 MiB–256 MiB, default 64 MiB). Oversized saves fail rather than truncate. |

The config is applied by `stacknext dev`, which exports
`STACKNEXT_CAPTURE_FETCH`, `STACKNEXT_CAPTURE_ERRORS`, `STACKNEXT_DEBUG`,
`NEXT_OTEL_VERBOSE`, the collector URL and the bearer token to the Next.js child
process. The app's `instrumentation.ts` does not read the config file directly.

`instrumentation.verbose: true` sets `NEXT_OTEL_VERBOSE=1` unless the launching
environment already defines a non-empty `NEXT_OTEL_VERBOSE`. An explicit
inherited value wins, including `NEXT_OTEL_VERBOSE=0`. `stacknext dev` prints the
effective state at startup. Verbose tracing adds documented Next.js spans but
also increases span volume and dev-server overhead; use it for targeted
investigations. See [instrumentation coverage](instrumentation-coverage.md#verbose-tracing)
and the [benchmark](https://github.com/marrrkkk/stacknext/blob/main/docs/testing/benchmarks.md#verbose-tracing-overhead).

## Custom spans and Server Actions

The built-in Next.js spans do not identify your application functions or
successful Server Actions. Add optional helpers from `@stacknext/next`:

```ts
import { withStackNextSpan, withStackNextSpanSync } from '@stacknext/next'

const project = await withStackNextSpan('project.load', () => loadProject(id))
const digest = withStackNextSpanSync('auth.hash', () => hash(input))
```

For an exported action, wrap the body with `withStackNextAction`:

```ts
'use server'

import { revalidatePath } from 'next/navigation'
import { withStackNextAction } from '@stacknext/next'

export async function saveProject(formData: FormData) {
  return withStackNextAction('action/save-project', async () => {
    await saveProjectFromForm(formData)
    revalidatePath('/projects')
    return { ok: true }
  })
}
```

The helpers keep the same trace, preserve return values, rethrow errors and
control flow, and sanitize attributes the same way as framework spans. They do
not capture request bodies, form values or SQL parameters. Read
[custom instrumentation](custom-instrumentation.md) and
[Server Actions](server-actions.md) before adding high-cardinality or sensitive
attributes.

## Commands

```bash
stacknext init [--install] [--agents | --skip-agents]
stacknext dev [--open] [--quiet] [--token <token>] [nextArgs...]
stacknext status [--json]
stacknext doctor [--json]
stacknext coverage [--json]
stacknext diagnose [--id <diagnostic-id>] [--trace-id <trace-id>] [--category <category>] [--severity <severity>] [--json]
stacknext capture [--name <name>] [--json] [--quiet] -- <test command...>
stacknext runs list [--limit <n>] [--offset <n>] [--json]
stacknext runs show <run-id> [--json]
stacknext baseline save <run-id> --name <name> [--notes <text>] [--json]
stacknext baseline list [--limit <n>] [--offset <n>] [--json]
stacknext baseline show <baseline-id> [--json]
stacknext baseline remove <baseline-id> --yes [--json]
stacknext compare <baseline-id> <candidate-run-id> [--json] [--fail-on regression|inconclusive|any]
stacknext export [-o <file> | --stdout] [--force]
stacknext mcp [--collector <url>] [--token <token>]
```

- `dev` requires a `package.json` `dev` script that starts Next.js. Extra
  arguments are forwarded to it.
- Runtime credentials live in `<project>/.stacknext/run.json` with mode `0600`.
  The directory contains its own `.gitignore`. Do not copy the token into source
  control or share it.
- `coverage` reports what the current retention window observed for framework
  spans, adapters, custom spans, Server Actions and verbose tracing. It is not a
  score; `not-observed` and `unknown` can be correct on a healthy app.
- `export` writes a `0600` JSON file and refuses to overwrite unless `--force`
  is set. Use `--stdout` to pipe it elsewhere.
- `mcp` reserves stdout for the MCP protocol. Diagnostic logging goes to stderr.

## Troubleshooting

Run:

```bash
pnpm exec stacknext doctor
```

Common causes:

- **Dashboard is empty** — make a request after the app is ready. Check that
  `instrumentation.ts` imports `@stacknext/next` and that the app is using the
  Node.js runtime.
- **Collector says “waiting for app”** — `stacknext dev` sets the collector URL
  and token. Start the app through StackNext, not separately.
- **No database queries** — register the Drizzle logger or Prisma
  instrumentation. For Prisma, include the event-based `query` log option.
- **No errors** — Next.js only calls `onRequestError` when `instrumentation.ts`
  exports it and the route runs in the Node.js runtime. Successful Server
  Actions do not call it; wrap them with `withStackNextAction`.
- **Coverage says not-observed or unknown** — the sample may not have exercised
  the feature. Check the item limitations, the sample window and the connection
  state before changing code. See
  [instrumentation coverage](instrumentation-coverage.md).
- **Diagnostics says no findings** — findings require matching evidence in the
  current retention window. Exercise the route, check the sample counts and
  thresholds, and remember that `possible` N+1/HTTP findings are heuristics, not
  proof. A capped report is not a complete inventory.
- **A finding disappeared** — the report is rebuilt from the current sample;
  telemetry aging out or a collector restart removes its evidence. Use the
  finding id and trace id as references, not durable identifiers.
- **No custom or action spans** — confirm the helper import, that the app uses
  the Node.js runtime, and that `registerStackNext()` or another OpenTelemetry
  provider is active. Helpers are no-ops without a provider.
- **Port already in use** — StackNext automatically tries the next loopback
  port. The actual URL is printed and stored in `.stacknext/run.json`.
- **Stale runtime state** — if a previous process was killed, remove
  `.stacknext/run.json` and run `stacknext dev` again.

## Use it with a coding agent

Start `stacknext dev`, then configure the MCP server for your client:

- [OpenCode](integrations/opencode.md)
- [Codex](integrations/codex.md)
- [Claude Code](integrations/claude-code.md)

The portable skill at
[`skills/stacknext-debugging`](ai-agents/skill) adds
evidence-first workflows for runtime errors, slow requests, database activity,
traces, diagnostic findings and runtime regression evidence. It ships inside
`@stacknext/cli`:

```bash
pnpm exec stacknext skill install --client opencode
pnpm exec stacknext skill install --client codex
pnpm exec stacknext skill install --client claude-code
```

`stacknext skill path` prints the bundled directory, and `--force` replaces an
existing copy. It requires no AI API key. See
[agent instructions](integrations/agent-instructions.md) for safe project
instruction snippets and
[agent compatibility testing](https://github.com/marrrkkk/stacknext/blob/main/docs/testing/agent-compatibility.md)
for compatibility results.

See [privacy and redaction](privacy.md), [instrumentation coverage](instrumentation-coverage.md),
[custom instrumentation](custom-instrumentation.md), [Server Actions](server-actions.md),
[runtime regression testing](regression-testing.md), [MCP](mcp.md),
[architecture](architecture.md) and [limitations](limitations.md).
