# NextScope

**Local-first runtime inspection for Next.js App Router applications.**

NextScope is a free, MIT-licensed debugging center for Next.js. It collects
OpenTelemetry spans from your dev server, adds Drizzle/Prisma query events and
server errors, and shows them in a local dashboard, CLI and read-only MCP
server. There is no cloud account, no hosted backend and no telemetry upload.

![NextScope overview](docs/screenshots/overview.png)

## Why it exists

Next.js ships useful OpenTelemetry spans, but turning them into an everyday
debugging workflow usually means adopting a hosted APM. NextScope keeps the
feedback loop local: start your app with one command, make a request, and see
the request, waterfall, database queries and errors on your machine.

- **Requests** — route, method, status, duration, span/error/query counts,
  slow-request filtering and live updates.
- **Traces** — parent/child waterfall with span attributes, events and missing
  parent detection.
- **Database** — redacted Drizzle and Prisma SQL, operation, success state,
  trace correlation and null-duration labeling where the adapter cannot measure.
- **Errors** — grouped fingerprints, redacted messages and stacks, and
  correlation to the request trace that produced them.
- **MCP** — nine read-only tools for coding agents, over local stdio.
- **Privacy boundary** — no bodies, headers, cookies, query values or SQL bind
  parameters. Redaction happens in the app and again in the collector.
- **Real local UX** — SSE updates, dark/light themes, responsive layout and
  useful empty states.

## Requirements

- Node.js **20.9+**
- pnpm **12** for this repository
- Next.js **15 or 16** with the **App Router**, on the **Node.js runtime**

> 0.1 is a source release. The `nextscope` and `@nextscope/*` packages are
> workspace packages in this repository and are not published to npm yet.
> Next.js runtime verification in this repository used **Next.js 16.4.3**.

## Quick start

```bash
pnpm install
pnpm build
cd apps/example-next-app
pnpm exec nextscope dev --open
```

Then open `http://127.0.0.1:4400` and visit:

| URL | What it demonstrates |
| --- | --- |
| `http://127.0.0.1:4402/` | Server render with Drizzle queries |
| `http://127.0.0.1:4402/api/projects` | JSON route |
| `http://127.0.0.1:4402/api/slow?delay=350` | Slow request |
| `http://127.0.0.1:4402/api/error?token=demo-url-secret` | Failing route with a fake secret |

The example app is a small task tracker called Tasklight. It uses
better-sqlite3 and Drizzle, seeds itself on first run, and includes deliberate
slow and throwing routes so every dashboard view has real data.

## Dashboard

| Request detail | Database |
| --- | --- |
| ![Request detail](docs/screenshots/request-detail.png) | ![Database queries](docs/screenshots/database.png) |

More captures: [dark overview](docs/screenshots/overview-dark.png),
[traces](docs/screenshots/traces.png),
[errors](docs/screenshots/errors.png),
[error detail](docs/screenshots/error-detail.png),
[settings](docs/screenshots/settings.png),
[mobile overview](docs/screenshots/overview-mobile.png).

Routes: `/`, `/requests`, `/requests/:traceId`, `/traces`,
`/traces/:traceId`, `/database`, `/errors`, `/errors/:errorId`, `/settings`.

## Use it in your app

```bash
pnpm add -D nextscope @nextscope/next
pnpm exec nextscope init
pnpm exec nextscope dev
```

`init` detects Next.js and the App Router, writes `nextscope.config.json`,
creates `instrumentation.ts`, and prints adapter setup for Drizzle/Prisma. It
**never overwrites an existing `instrumentation.ts`**; it prints a manual hook
instead. NextScope also yields to an already-registered OpenTelemetry provider
rather than replacing existing monitoring.

Drizzle:

```ts
import { createNextScopeDrizzleLogger } from '@nextscope/drizzle'

const db = drizzle(client, {
  logger: createNextScopeDrizzleLogger({ databaseSystem: 'sqlite' }),
})
```

Prisma:

```ts
import { instrumentPrismaClient } from '@nextscope/prisma'

const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'query' }],
})
instrumentPrismaClient(prisma, { databaseSystem: 'postgresql' })
```

Full setup and configuration: [docs/getting-started.md](docs/getting-started.md).

## CLI

```bash
nextscope init [--install]
nextscope dev [--open] [--quiet] [--token <token>] [nextArgs...]
nextscope status [--json]
nextscope doctor [--json]
nextscope export [-o <file> | --stdout] [--force]
nextscope mcp [--collector <url>] [--token <token>]
```

`dev` starts the loopback collector, writes runtime state to
`.nextscope/run.json` (`0600`), then runs the app's own `dev` script with the
collector URL and token in its environment. `status`, `doctor`, `export` and
`mcp` use that runtime state. `doctor` is the first stop when data is missing.

## MCP

```json
{
  "mcpServers": {
    "nextscope": {
      "command": "pnpm",
      "args": [
        "--dir",
        "/absolute/path/to/your-app",
        "exec",
        "nextscope",
        "mcp"
      ]
    }
  }
}
```

Start `nextscope dev` before the MCP client. The server is stdio-only,
read-only, and refuses non-loopback collector URLs. Tools:

`get_project_summary`, `list_requests`, `get_request`, `list_traces`,
`get_trace`, `list_errors`, `get_error`, `list_database_queries`,
`find_slow_requests`.

Details and example prompts: [docs/mcp.md](docs/mcp.md).

## Privacy

NextScope never captures request/response bodies, headers, cookies, URL query
values or SQL bind parameters. Every attribute map passes through a redaction
layer in the app process and again in the collector. URLs lose their query
strings and fragments; passwords, tokens, cookies, authorization values,
credential-bearing URLs and known secret formats are replaced with
`[redacted]`.

The collector binds to `127.0.0.1`, requires a bearer token for ingestion and
read APIs, issues a `HttpOnly`/`SameSite=Strict` dashboard session cookie,
validates payloads with Zod, rejects cross-site requests and enforces 2 MiB
ingest payloads. Storage is in memory, bounded and retention-pruned.

Read [docs/privacy.md](docs/privacy.md) for the full data table and caveats.
Redaction is pattern-based, not a formal secret scanner: review exports before
sharing them.

## Limitations

This is a local development tool. Edge runtime, the Pages Router, production
monitoring and multi-user hosting are out of scope. Server Components are not
individually traced, Server Actions are not named, and Drizzle query durations
are unavailable through its logger API. See
[docs/limitations.md](docs/limitations.md).

## Repository layout

```
packages/core       wire types, schemas, redaction, store, transport
packages/next       Next.js instrumentation + OpenTelemetry exporter
packages/drizzle    Drizzle logger adapter
packages/prisma     Prisma query adapter
packages/cli        nextscope binary + collector HTTP server
packages/dashboard  React/Vite dashboard served by the collector
packages/mcp        read-only stdio MCP server
apps/example-next-app  Tasklight demo
```

More detail: [architecture](docs/architecture.md).

## Development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e      # starts the built example app and checks the real stack
pnpm benchmark     # synthetic ingest + read API benchmark
```

`test:e2e` needs the packages built and the example app installed. It reuses a
running NextScope instance when one is alive, otherwise it starts and stops one.
The benchmark and e2e scripts both print their method and results; benchmark
numbers are machine-specific. See [docs/benchmark.md](docs/benchmark.md) for the
measured ingest/read-API results and methodology.

GitHub Actions runs lint, typecheck, unit tests and build on Node.js 22, then
the same e2e smoke test against a freshly started example app.

See [AGENTS.md](AGENTS.md) for the repository conventions, invariants and
verification workflow.

## License

MIT. See [LICENSE](LICENSE).
