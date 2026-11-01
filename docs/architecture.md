# Architecture

NextScope is a pnpm monorepo. Everything runs on the developer machine: a
Next.js app emits spans, a loopback collector stores and serves them, and the
dashboard, CLI and MCP server read from that collector.

## Packages

| Package | Role |
| --- | --- |
| `packages/core` | Wire types and Zod schemas, redaction/normalization, config loading, bounded telemetry store, async transport. |
| `packages/next` | Next.js `instrumentation.ts` integration, OpenTelemetry provider/exporter, error normalization. |
| `packages/drizzle` | Drizzle `Logger` adapter. |
| `packages/prisma` | Prisma `$on('query')` adapter. |
| `packages/cli` | `nextscope` binary: `init`, `dev`, `status`, `doctor`, `export`, `mcp`; collector HTTP server and dashboard static hosting. |
| `packages/dashboard` | React + Vite local dashboard, built to static assets and served by the collector. |
| `packages/mcp` | Read-only MCP server and loopback collector API client. |
| `apps/example-next-app` | Tasklight demo: Next.js App Router, Drizzle, better-sqlite3, deliberate slow/error routes. |

## Data flow

```
Next.js app process
  instrumentation.ts
    └─ @nextscope/next register()
         ├─ NodeTracerProvider + BatchSpanProcessor
         ├─ NextScopeSpanExporter  (redact + normalize spans)
         ├─ onRequestError         (redact + normalize errors)
         ├─ @nextscope/drizzle     (query events, no bind params)
         └─ @nextscope/prisma      (query events, no bind params)
                    │
                    ▼
       bounded NextScopeTransport (in-process queue)
                    │  HTTP POST /__nextscope/v1/ingest
                    │  Authorization: Bearer <runtime token>
                    ▼
       127.0.0.1 collector (shared with dashboard)
         ├─ auth, Host/Origin checks, payload limits, Zod validation
         ├─ second redaction/normalization pass
         ├─ TelemetryStore (bounded, retention-pruned)
         ├─ REST read API + SSE stream
         ├─ static dashboard assets + session cookie
         ├─ CLI status/doctor/export
         └─ MCP stdio server (separate process, read-only)
```

## Instrumentation

`register()` from `@nextscope/next` is called from the app's
`instrumentation.ts`. It is inert when `NEXTSCOPE_COLLECTOR_URL` and
`NEXTSCOPE_TOKEN` are absent, which keeps a production build safe when no local
collector is present. It also runs only in the Node.js runtime.

NextScope constructs a `NodeTracerProvider` with a `BatchSpanProcessor` and a
custom exporter. It does **not** use `@vercel/otel`. If another provider is
already registered (for example an APM agent), NextScope logs that fact in debug
mode and leaves the existing provider untouched instead of replacing it.

Next.js already emits spans for request handling and route operations. Real
Next.js 16.4.3 runs in this repository produce root spans named like
`GET /api/error` with `next.span_type =
BaseServer.handleRequest`, plus route/render spans such as
`resolve page components`, `load route module`, `prepare route module`,
`executing api route` and `start response`. NextScope exports those spans; it
does not patch undocumented Next.js internals.

The app-side exporter:

1. Rejects invalid trace/span ids, internal instrumentation spans and requests
   to the collector itself.
2. Redacts attributes, status messages, span names, resources and events.
3. Converts OTel `HrTime` to milliseconds and drops missing parents.
4. Enqueues plain objects. Network I/O happens on the transport timer, never on
   the request path.

`captureFetch: false` filters spans whose `next.span_type` is
`AppRender.fetch`. `captureErrors: false` makes the `onRequestError` hook a
no-op. Both are passed from `nextscope dev` to the app as environment variables.

## Requests, traces and correlation

A request is derived from the earliest request root in a trace: a span with
`nextSpanType === 'BaseServer.handleRequest'`, or a server span with no parent.
The root supplies route, method, status code, duration and service name.

Database events and errors are correlated in two ways:

- **Preferred:** read the active OpenTelemetry span context at capture time.
  This gives the exact `traceId`/`spanId` for Drizzle, Prisma and
  `onRequestError`.
- **Fallback:** for errors without a span context, match the route/method and a
  timestamp within 30 seconds of a request in the store.

A trace detail returns all spans, errors and queries with that trace id. The
dashboard builds a waterfall from `parentSpanId`; parent ids that were not
received are surfaced as `missingParentSpanIds` rather than hidden.

## Collector

`startCollector()` creates one `http.Server` for both dashboard and ingestion.
It binds `127.0.0.1` (or `localhost`) and rejects other bind hosts. If the
configured port is busy, `nextscope dev` asks the collector to try the next 25
ports; the chosen URL is printed and written to runtime state.

Request handling:

- `POST /__nextscope/v1/ingest` — bearer token, JSON content type, 2 MiB body
  limit, Zod-validated envelope, second redaction pass, store insert, SSE
  broadcast.
- `GET /api/*` — GET/HEAD only; bearer token or dashboard session cookie.
- `GET /` and static assets — served from `packages/dashboard/dist`; unknown
  non-file paths return the dashboard HTML for History API routing. A strict CSP
  is applied to HTML.
- `GET /api/stream` — SSE with `ready`, `telemetry` and `shutdown` events plus
  heartbeats; capped at 50 clients.
- Host, Origin and `Sec-Fetch-Site` checks block DNS-rebinding/cross-site
  access. There are no CORS headers.

Read endpoints:

| Endpoint | Payload |
| --- | --- |
| `/api/ping` | Health probe (no auth). |
| `/api/health` | Collector status, connections, counts, drops, limits, config. |
| `/api/summary` | Health plus overview summary (latency, slowest requests, recent errors). |
| `/api/config` | Sanitized config and documented limitations. |
| `/api/requests` | Paginated request summaries; filters `q`, `method`, `status`, `slow`, `minDuration`, `sort`. |
| `/api/requests/:traceId` | Trace detail by request trace id. |
| `/api/traces` | Paginated trace summaries. |
| `/api/traces/:traceId` | Trace detail. |
| `/api/errors` | Paginated errors plus fingerprint groups. |
| `/api/errors/:id` | Error plus correlated trace. |
| `/api/database` | Paginated queries with route correlation. |
| `/api/export` | Full redacted buffer as JSON. |

The store is in memory only. `TelemetryStore` keeps spans (capacity
`collector.maxSpans`), errors and queries (derived caps), prunes by
`receivedAt`, and counts capacity/retention drops. It builds trace indexes
lazily for reads; there is no database or on-disk telemetry file.

## Runtime state and CLI lifecycle

`nextscope dev`:

1. Detects the project, Next.js version, App Router directory and package
   manager.
2. Loads `nextscope.config.json`.
3. Resolves the built dashboard, generates a bearer token, and starts the
   collector.
4. Writes `.nextscope/run.json` (`0600`, with a `.gitignore`) containing the pid,
   URLs, port, token, project name and Next.js version.
5. Builds the child environment (`NEXTSCOPE_COLLECTOR_URL`, token, project name,
   capture flags, debug flag) and spawns the project's `dev` script.
6. Forwards SIGINT/SIGTERM to the child, closes the collector, removes runtime
   state and exits.

`status`, `doctor`, `export` and `mcp` read runtime state and refuse to operate
when the recorded process is dead. `doctor` also checks Node/Next versions, App
Router, config validity, instrumentation imports, adapter/config mismatches,
dashboard build presence, token file permissions and collector health.

## Dashboard

The dashboard is a React 19 single-page app built with Vite. It uses the
History API, not a server router: `/requests`, `/requests/:traceId`, `/traces`,
`/traces/:traceId`, `/database`, `/errors`, `/errors/:errorId` and `/settings`.
The collector serves the same `index.html` for these paths.

Data loading uses `fetch` with abort signals; reads refresh when the SSE
sequence changes. The shell maintains a health poll even if SSE is down. The
theme control supports system/dark/light, persisted in `localStorage`; CSS
custom properties implement both themes, and the layout is responsive down to
mobile widths. Empty states include setup steps rather than placeholder data.

## TypeScript/build layout

- `tsconfig.base.json` holds strict compiler options only. It intentionally has
  no workspace `paths`.
- Each package `tsconfig.json` maps `@nextscope/*` to source files for
  typechecking. This keeps `pnpm typecheck` correct before a build.
- Each package `tsconfig.build.json` sets `"paths": {}` and emits from `src` to
  `dist`. Build-time resolution uses the built package types instead of source.
- This split matters for Next.js/Turbopack: inheriting source `paths` caused
  Turbopack to bundle `packages/next/src` and fail on `./exporter.js` imports.
- `pnpm -r build` respects workspace topology so `core` is built before packages
  that import it, and `dashboard` is built before `cli` publishes/serves it.

## MCP

`packages/mcp` builds an `McpServer` from `@modelcontextprotocol/sdk` and a
`NextScopeApiClient`. The CLI `mcp` command resolves the runtime token and
connects the server to `StdioServerTransport`. The client refuses non-loopback
URLs, uses GET only and has a 5-second timeout. All nine tools are read-only.
