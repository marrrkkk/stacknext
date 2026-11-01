# Getting started

NextScope is a local debugging center for Next.js App Router applications. It
collects OpenTelemetry spans from your development server, adds Drizzle/Prisma
query events and Next.js request errors, and shows everything in a local
dashboard, CLI and read-only MCP server.

## Requirements

- Node.js **20.9 or newer**
- pnpm **12** (the repository pins `pnpm@12.16.1`)
- Next.js **15 or 16** with the **App Router**
- The **Node.js runtime**. Edge runtime is not supported in 0.1.

## Run the example app

From a checkout of this repository:

```bash
pnpm install
pnpm build
cd apps/example-next-app
pnpm exec nextscope dev --open
```

`nextscope dev` starts the collector and the app's own `dev` script. Open
`http://127.0.0.1:4400` and make a request:

- `http://127.0.0.1:4402/` — server render with Drizzle queries
- `http://127.0.0.1:4402/api/projects` — JSON API
- `http://127.0.0.1:4402/api/slow?delay=350` — slow request
- `http://127.0.0.1:4402/api/error?token=demo-url-secret` — failing route

The example app seeds `apps/example-next-app/data/nextscope-demo.db` on first
use. Delete that directory to start over.

## Use it in an existing app

> **Source release:** the `nextscope` and `@nextscope/*` packages are workspace
> packages in this repository and are not published to npm yet. For now, link
> them with `pnpm --filter` or publish them first. The commands below describe
> the intended package flow.

Inside the app project:

```bash
pnpm add -D nextscope @nextscope/next
pnpm exec nextscope init
pnpm exec nextscope dev
```

`nextscope init`:

1. Checks that the project uses Next.js 15/16 with `app/` or `src/app/`.
2. Creates `nextscope.config.json` when one does not exist.
3. Creates `instrumentation.ts` when one does not exist.
4. Detects Drizzle and Prisma and prints the adapter snippets.
5. Prints the exact install command when `@nextscope/next` is missing. Pass
   `--install` to run it automatically.

### Existing instrumentation is never replaced

If `instrumentation.ts` already exists, `init` leaves it untouched and prints a
manual patch:

```ts
import {
  registerNextScope,
  onRequestError as nextScopeOnRequestError,
} from '@nextscope/next'

export async function register() {
  // Keep your existing monitoring setup.
  await registerNextScope()
}

// If you do not already export an error hook:
export const onRequestError = nextScopeOnRequestError
```

If you already export `onRequestError`, call `nextScopeOnRequestError(error,
request, context)` inside it. NextScope yields to an existing OpenTelemetry
tracer provider instead of replacing it. The generated hook checks
`NEXT_RUNTIME === 'nodejs'` and imports NextScope dynamically so Edge bundling
does not pull in Node-only modules.

## Database adapters

### Drizzle

Drizzle's `Logger` interface receives SQL text and bind parameters. Add the
NextScope logger when you create the client:

```ts
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createNextScopeDrizzleLogger } from '@nextscope/drizzle'

export const db = drizzle(client, {
  logger: createNextScopeDrizzleLogger({ databaseSystem: 'sqlite' }),
})
```

Bind parameters are counted but never read or sent. Drizzle's logger API does
not expose query duration, so `durationMs` is `null` for these queries.

### Prisma

Prisma must be configured to emit query events. Then register the adapter:

```ts
import { PrismaClient } from '@prisma/client'
import { instrumentPrismaClient } from '@nextscope/prisma'

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

`nextscope.config.json` is created by `init` and loaded by `nextscope dev`.
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
  "slowRequestMs": 500
}
```

The bundled example app overrides `retentionMs` to `900000` and
`slowRequestMs` to `250`, so `/api/slow?delay=350` is marked as slow.

| Field | Meaning |
| --- | --- |
| `dashboard.port` | Preferred loopback dashboard port. NextScope tries the next 25 ports if it is busy. |
| `collector.maxSpans` | In-memory span capacity. Error and query buffers are derived from it. |
| `collector.retentionMs` | How long received telemetry stays in memory. |
| `instrumentation.verbose` | Enables NextScope debug logs in the app process. |
| `instrumentation.captureFetch` | Captures Next.js `AppRender.fetch` spans. Set `false` to drop them. |
| `instrumentation.captureErrors` | Calls the Next.js error hook. Set `false` to disable error collection. |
| `privacy.*` | 0.1 refuses to enable headers, bodies or SQL parameters; these must stay `false`. |
| `database.drizzle` / `database.prisma` | Used by `init`/`doctor` for setup checks. Adapters still need explicit registration. |
| `slowRequestMs` | Threshold used by the dashboard, CLI and MCP slow-request views. |

The config is applied by `nextscope dev`, which exports
`NEXTSCOPE_CAPTURE_FETCH`, `NEXTSCOPE_CAPTURE_ERRORS`, `NEXTSCOPE_DEBUG`, the
collector URL and the bearer token to the Next.js child process. The app's
`instrumentation.ts` does not read the config file directly.

## Commands

```bash
nextscope init [--install]
nextscope dev [--open] [--quiet] [--token <token>] [nextArgs...]
nextscope status [--json]
nextscope doctor [--json]
nextscope export [-o <file> | --stdout] [--force]
nextscope mcp [--collector <url>] [--token <token>]
```

- `dev` requires a `package.json` `dev` script that starts Next.js. Extra
  arguments are forwarded to it.
- Runtime credentials live in `<project>/.nextscope/run.json` with mode `0600`.
  The directory contains its own `.gitignore`. Do not copy the token into source
  control or share it.
- `export` writes a `0600` JSON file and refuses to overwrite unless `--force`
  is set. Use `--stdout` to pipe it elsewhere.
- `mcp` reserves stdout for the MCP protocol. Diagnostics go to stderr.

## Troubleshooting

Run:

```bash
pnpm exec nextscope doctor
```

Common causes:

- **Dashboard is empty** — make a request after the app is ready. Check that
  `instrumentation.ts` imports `@nextscope/next` and that the app is using the
  Node.js runtime.
- **Collector says “waiting for app”** — `nextscope dev` sets the collector URL
  and token. Start the app through NextScope, not separately.
- **No database queries** — register the Drizzle logger or Prisma
  instrumentation. For Prisma, include the event-based `query` log option.
- **No errors** — Next.js only calls `onRequestError` when `instrumentation.ts`
  exports it and the route runs in the Node.js runtime.
- **Port already in use** — NextScope automatically tries the next loopback
  port. The actual URL is printed and stored in `.nextscope/run.json`.
- **Stale runtime state** — if a previous process was killed, remove
  `.nextscope/run.json` and run `nextscope dev` again.

See [privacy and redaction](privacy.md), [MCP](mcp.md),
[architecture](architecture.md) and [limitations](limitations.md).
