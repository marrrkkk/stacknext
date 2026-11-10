---
title: Architecture
description: How the packages, collector, dashboard, diagnostics and MCP fit together.
---

StackNext is a pnpm monorepo. Everything runs on the developer machine: a
Next.js app emits spans, a loopback collector stores and serves them, and the
dashboard, CLI and MCP server read from that collector.

## Packages

| Package | Role |
| --- | --- |
| `packages/core` | Wire types and Zod schemas, redaction/normalization, config loading, bounded telemetry store, async transport, diagnostic wire types, snapshot payloads and private disk storage. |
| `packages/diagnostics` | Deterministic diagnostic rules, fingerprinting, report filtering, overview and detail evidence. |
| `packages/regression` | Versioned run/baseline/comparison schemas, stable scenario/trace identity, environment snapshots, deterministic comparison, private atomic disk storage. |
| `packages/playwright` | Optional Playwright fixture, W3C trace-context propagation, trace probing and sample submission. |
| `packages/next` | Next.js `instrumentation.ts` integration, OpenTelemetry provider/exporter, error normalization. |
| `packages/drizzle` | Drizzle `Logger` adapter. |
| `packages/prisma` | Prisma `$on('query')` adapter. |
| `packages/cli` | `stacknext` binary: `init`, `dev`, `status`, `doctor`, `coverage`, `diagnose`, `capture`, `runs`, `baseline`, `compare`, `snapshot`, `export`, `mcp`; collector HTTP server and dashboard static hosting. |
| `packages/dashboard` | React + Vite local dashboard, built to static assets and served by the collector, including run/baseline/comparison and snapshot views. |
| `packages/mcp` | Read-only MCP server, telemetry/regression/snapshot APIs client and output schemas. |
| `skills/stacknext-debugging` | Portable Agent Skill with tool reference and evidence-first workflows. |
| `apps/example` | StackNext Example: Next.js App Router, Drizzle, better-sqlite3, deliberate slow/error routes, a dashboard-style UI and annotated Playwright scenarios. |
| `apps/www` | Private marketing website: landing page plus privacy, license, limitations and generated changelog pages. Not published. |

## Data flow

```
Next.js app process
  instrumentation.ts
    └─ @stacknext/next register()
         ├─ NodeTracerProvider + BatchSpanProcessor
         ├─ StackNextSpanExporter  (redact + normalize spans)
         ├─ manual span helpers    (same active trace, sanitized attrs)
         ├─ onRequestError         (redact + normalize errors)
         ├─ @stacknext/drizzle     (query events, no bind params)
         └─ @stacknext/prisma      (query events, no bind params)
                    │
                    ▼
       bounded StackNextTransport (in-process queue)
                    │  HTTP POST /__stacknext/v1/ingest
                    │  Authorization: Bearer <runtime token>
                    ▼
       127.0.0.1 collector (shared with dashboard)
         ├─ auth, Host/Origin checks, payload limits, Zod validation
         ├─ second redaction/normalization pass
         ├─ TelemetryStore (bounded, retention-pruned)
         ├─ REST read API + SSE stream + coverage evidence
         ├─ deterministic diagnostics (cached by store revision)
         ├─ live test-run registry (bearer-only ingest/complete)
         ├─ snapshot save/import/delete + frozen read views
         ├─ static dashboard assets + session cookie
         ├─ CLI status/doctor/export/snapshot
         └─ MCP stdio server (separate process, read-only)

Playwright + stacknext capture
  ├─ W3C traceparent injected into document/fetch/XHR requests
  ├─ fixture probes collector traces and submits verified samples
  ├─ CLI saves run records under .stacknext/runs
  ├─ baseline save copies a completed run under .stacknext/baselines
  └─ compare writes .stacknext/comparisons

Snapshots
  ├─ manual save from dashboard or CLI, automatic on exit/first error
  ├─ frozen redacted payload + summary under .stacknext/snapshots
  ├─ detached TelemetryStore view for scoped reads (never live replay)
  └─ automatic exit/error rotation keeps the newest autoKeep records
```

## Instrumentation

`register()` from `@stacknext/next` is called from the app's
`instrumentation.ts`. It is inert when `STACKNEXT_COLLECTOR_URL` and
`STACKNEXT_TOKEN` are absent, which keeps a production build safe when no local
collector is present. It also runs only in the Node.js runtime.

StackNext constructs a `NodeTracerProvider` with a `BatchSpanProcessor` and a
custom exporter. It does **not** use `@vercel/otel`. If another provider is
already registered (for example an APM agent), StackNext logs that fact in debug
mode and leaves the existing provider untouched instead of replacing it.

The registration also installs a global composite W3C propagator
(`W3CTraceContextPropagator` + `W3CBaggagePropagator`). Next.js extracts the
incoming `traceparent` through that propagator, so a Playwright-injected request
context becomes the server trace root. This is what makes verified browser/server
correlation possible without patching Next.js internals.

Next.js already emits spans for request handling and route operations. Real
Next.js 16.4.3 runs in this repository produce root spans named like
`GET /api/error` with `next.span_type =
BaseServer.handleRequest`, plus route/render spans such as
`resolve page components`, `load route module`, `prepare route module`,
`executing api route` and `start response`. StackNext exports those spans; it
does not patch undocumented Next.js internals.

### Span model

`packages/core/src/framework.ts` holds the standard Next.js span allowlist
mirrored from the supported Next.js versions. The exporter preserves the
documented `next.span_type`, `next.span_name`, `next.route`, `next.page`,
`next.segment` and `next.rsc` attributes and lifts the framework fields onto the
wire span. HTTP semantic attributes (`http.*`) and parent span ids remain on the
normalized span. Unknown or verbose-only span types are retained as evidence
rather than dropped or guessed into a framework feature.

The trace explorer classifies spans into four display categories:

- **framework** — spans carrying a documented `next.span_type`, plus server
  roots without a parent;
- **app/custom** — manual spans marked with `stacknext.manual` or
  `stacknext.span.kind`;
- **database** — spans carrying `db.*` attributes;
- **fetch** — `AppRender.fetch` or client spans with fetch-like URL/HTTP
  attributes.

Categories are for reading a timeline. They do not imply that durations can be
summed: parent and child spans overlap, so the explorer never presents a
composite of span durations as request time.

Next.js emits additional span types when the documented
`NEXT_OTEL_VERBOSE=1` environment variable is set. `stacknext dev` resolves the
effective state from `instrumentation.verbose` and an explicit inherited
`NEXT_OTEL_VERBOSE` value (the inherited value wins, including `0`), passes it to
the child process, and reports the source in startup output and collector
health/config. StackNext does not use `NEXT_PRIVATE_*` variables.

### Manual spans and Server Actions

`withStackNextSpan` and `withStackNextSpanSync` run a callback through
`trace.getTracer()`/`startActiveSpan` using the already-registered provider.
They do not create a second SDK. Return values, thrown errors and App Router
control-flow exceptions (`NEXT_REDIRECT`, `NEXT_NOT_FOUND`,
`NEXT_HTTP_ERROR_FALLBACK`) are preserved; control flow is rethrown without
being marked as a span error. Attributes pass through the same sanitizer as
framework spans. Each helper adds `stacknext.manual: true` and a
`stacknext.span.kind` marker, which the explorer and coverage use.

`withStackNextAction` is the same primitive with the action marker. It is the
documented way to make successful Server Actions visible, because
`onRequestError` runs for failures only. The helpers rely on OpenTelemetry's
active context, so nested and concurrent calls keep correct parent links.

The app-side exporter:

1. Rejects invalid trace/span ids, internal instrumentation spans and requests
   to the collector itself.
2. Redacts attributes, status messages, span names, resources and events.
3. Converts OTel `HrTime` to milliseconds and omits invalid parent span ids.
4. Enqueues plain objects. Network I/O happens on the transport timer, never on
   the request path.

`captureFetch: false` filters spans whose `next.span_type` is
`AppRender.fetch`. `captureErrors: false` makes the `onRequestError` hook a
no-op. Both are passed from `stacknext dev` to the app as environment variables.

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

## Instrumentation coverage

Coverage is computed on read from four sources:

1. store evidence (span types, category counts, fetch/database/custom/action
   counts, query sources and last-seen times);
2. the sanitized project config (`captureFetch`, `captureErrors`,
   `database.drizzle`, `database.prisma`);
3. current collector connections;
4. the effective `NEXT_OTEL_VERBOSE` state and source.

`computeCoverage()` returns independent items with `observed`, `active`,
`configured`, `not-observed`, `unknown` or `unsupported` status. Each item also
carries evidence counts/types, last-seen time, configuration state and
limitations. `statusCounts` is a count of items, not a weighted score; no
percentage or composite is calculated. The sample always includes its retention
window and connection state so a reader can tell how much evidence it covers.

The store aggregations are bounded by the existing retention/capacity limits and
contain only already-redacted telemetry. Coverage never reads request bodies,
headers, query values or SQL parameters.

`GET /api/coverage` returns the report. `/api/summary` includes the same report
optionally. The `stacknext coverage` command formats it or prints JSON.
`get_project_summary` adds the report and a compact `meta.coverage` count object
without changing the existing MCP tool names or arguments.

## Diagnostics

`packages/diagnostics` is a pure, deterministic layer over the current store
sample. It does not read source files, call an LLM, run SQL/EXPLAIN, use the
network or write to the app. The collector asks it for a report; the CLI,
dashboard, JSON export, MCP server and Agent Skill all consume that same report
or its per-finding detail.

The engine evaluates six conservative rules. Rule set version 2 groups
repetition across traces, attributes span time with self time and preserves
Next.js request/error context:

| Rule id | Category | Status | What it reports |
| --- | --- | --- | --- |
| `n-plus-one-queries` | `database` | `possible` | A normalized SQL shape repeated at or above `repeatedQueryMin` in at least one trace, aggregated by canonical route across traces. |
| `slow-request` | `performance` | `observed` | Requests above the top-level `slowRequestMs` threshold, grouped by method and route. |
| `slow-span` | `performance` | `observed` | A non-root span whose self time exceeds its category threshold; suppressed when the enclosing request is already a slow-request finding. |
| `repeated-external-http` | `http` | `possible` | A normalized outbound HTTP endpoint repeated at or above `repeatedHttpMin` in at least one trace, aggregated by route across traces. |
| `error-fingerprint` | `errors` | `observed` | Single or repeated request errors grouped by canonical route plus a route-independent normalized signature. |
| `server-error-response` | `errors` | `observed` | A request root reporting a 5xx status with no correlated non-control-flow error record. |

The trace model identifies a request root (`BaseServer.handleRequest` in normal
Next.js telemetry), computes self time as inclusive duration minus the union of
direct child intervals, maps documented `next.*` span types to phases (routing,
render, route handler, fetch, database, response, middleware and so on), and
selects the deepest error span instead of assuming the error record's span id is
the source. Detached traces without an attributable request root are excluded
from request-level rules and reported as sample notes.

A finding carries a deterministic `diag-` id, rule/rule-set version, category,
severity, status, route, first/last seen time, affected trace count, trace ids,
a bounded evidence object (spans, queries, errors, self-time contributors, trace
occurrences, measurements), verification steps and limitations. Severity is
`info`, `warning` or `error`; status is `observed`, `possible` or
`insufficient-evidence`. A finding is evidence, not a confirmed root cause:
`possible` means the pattern is consistent with a problem and `observed` means
the measurement exists.

Fingerprints are deliberately lossy. SQL literals and parameters become `?`;
HTTP endpoints drop credentials, query values and fragments and normalize
id-like path segments; error fingerprints use the name/message/stack shape
without route-specific data, then group by canonical route. Next.js not-found
and redirect control-flow errors are ignored. The evidence is re-sanitized at
the diagnostics boundary, so URL query values, secrets and SQL bind parameters
cannot reappear in a finding even if they reached the store through another
field.

The collector caches one report keyed by the store revision and rebuilds it
after new telemetry arrives. Findings are capped by
`diagnostics.maxFindings` (default 100) and bounded by the store sample. The
report includes sample-integrity counts (request traces, detached traces,
missing parents, unattributed spans, ignored control-flow errors and 5xx
responses without error records) and notes explaining exclusions.
`/api/diagnostics` supports `limit`, `offset`, `category`, `severity`, `status`,
`ruleId`, `route`, `traceId`, `since`, `until` and `q`. `/api/diagnostics/:id`
returns the finding plus a bounded related trace. `/api/summary` adds a compact
overview, `/api/export` adds the report, and request/trace detail add an additive
array of finding references. The report includes its engine/rule-set versions,
sample window and limitations.

`stacknext diagnose` is the CLI view of the same endpoints, with list/detail
modes and the same filters. The dashboard has `/diagnostics` and
`/diagnostics/:id`; it is an evidence browser, not an AI chat. The MCP server
exposes the same findings through `stacknext_list_diagnostics` and
`stacknext_get_diagnostic`, and `get_trace` includes additive diagnostic
references.

## Runtime regression testing

The regression path is separate from the in-memory telemetry store:

1. `stacknext capture` creates a live run in the collector registry and starts
   the child Playwright command with `STACKNEXT_TEST_RUN_ID`,
   `STACKNEXT_COLLECTOR_URL`, `STACKNEXT_TOKEN` and `STACKNEXT_CAPTURE`.
2. `@stacknext/playwright` injects a fresh W3C `traceparent` into document,
   fetch and XHR requests for loopback or `baseURL` origins.
3. After the test body, the fixture probes the collector for the injected trace,
   submits the browser result and up to 20 trace references to
   `POST /api/test-runs/:id/samples`, and receives the stored sample.
4. The collector verifies the trace id and requires a server span whose
   `parentSpanId` equals the injected span id. It converts verified traces into
   bounded, id-free evidence. Missing traces or a missing parent make the sample
   `incomplete`.
5. On finalization, a child success is `completed` only when at least one sample
   is verified and no sample is incomplete. Otherwise it is `incomplete`. A
   child failure becomes `failed`; a forwarded signal becomes `interrupted`.
6. The CLI writes the run under `.stacknext/runs/` atomically. `baseline save`
   copies a completed run to `.stacknext/baselines/`; `compare` reads a baseline
   and candidate and writes `.stacknext/comparisons/`.

Scenario identity is a SHA-256-based `scn-<16 hex>` id. An explicit
`stacknext*` Playwright annotation wins, then the stable Playwright test id, then
file/title/project. Trace identities use normalized method, route, root span
name, category, kind, span type, HTTP method and endpoint. Numeric, UUID-like,
hex-like and long token-like path segments become `:id`. Trace ids, span ids,
sample ids and timestamps are evidence, not matching keys.

Comparisons only use verified samples. They compute per-sample medians and then
a median across samples, apply explicit absolute/percentage duration thresholds
and count thresholds, and classify each scenario as `improved`, `regressed`,
`unchanged` or `inconclusive`. Severity is reported separately. Environment
differences, incomplete samples, missing scenarios, insufficient samples,
candidate failure and variable trace shape default to `inconclusive`. There is
no statistical significance claim, no time-window correlation and no LLM
classification. See [comparison methodology](comparison-methodology.md).

The run, baseline and comparison schemas live in `packages/regression` and are
strict and versioned. Storage creates `.stacknext` and its subdirectories with
mode `0700`, writes records with mode `0600`, uses a temp file plus hard link
(with a rename fallback), refuses overwrite unless explicitly requested and caps
records at 16 MiB. The files are disk-backed and never pruned automatically;
unlike the telemetry store, they survive collector restarts.

## Saved snapshots

A snapshot is a frozen, redacted copy of the current store sample, not a second
telemetry pipeline. `packages/core/src/snapshots.ts` builds a versioned payload
from spans, errors, database queries, config, stats, the sample window and
limitations; diagnostics and coverage are intentionally excluded because they
describe the live sample. The payload and a small summary sidecar are written to
`.stacknext/snapshots` with mode `0600`, atomic no-overwrite writes and a 64 MiB
cap. An oversized save fails instead of truncating.

Manual saves come from `POST /api/snapshots`, the dashboard save dialog or
`stacknext snapshot save`. Automatic saves run on a graceful `stacknext dev`
exit and on the first error, with a 60-second error cooldown and a serialized
queue. Rotation deletes only `exit`/`error` snapshots beyond `snapshots.autoKeep`
(default 10); manual and imported snapshots are never auto-deleted. Import
accepts the standard export shape, assigns a fresh `snap-<16 hex>` id and runs
normalization/redaction again before writing.

Scoped reads load the payload into a detached `TelemetryStore` with widened
retention and a pinned clock, so old records stay readable without touching the
live store. The collector caches at most three detached views, invalidated by
the full file `mtimeMs`. Snapshot-scoped trace detail deliberately omits
diagnostics. `snapshotExport()` converts a payload back to the standard
`stacknext-export` shape for the dashboard, CLI and API.

## Collector

`startCollector()` creates one `http.Server` for both dashboard and ingestion.
It binds `127.0.0.1` (or `localhost`) and rejects other bind hosts. If the
configured port is busy, `stacknext dev` asks the collector to try the next 25
ports; the chosen URL is printed and written to runtime state.

Request handling:

- `POST /__stacknext/v1/ingest` — bearer token, JSON content type, 2 MiB body
  limit, Zod-validated envelope, second redaction pass, store insert, SSE
  broadcast.
- `POST /api/test-runs`, `POST /api/test-runs/:id/samples` and
  `POST /api/test-runs/:id/complete` — bearer-only live regression capture;
  intentionally excluded from the dashboard session-cookie and GET-only read
  surface.
- `POST /api/snapshots`, `POST /api/snapshots/import` and
  `DELETE /api/snapshots/:id` — manual snapshot save, import and delete. These
  accept the bearer token or the dashboard session cookie, still enforce the
  loopback Host and same-origin/Sec-Fetch-Site checks, and validate labels,
  ids and payloads.
- `GET /api/*` — GET/HEAD only; bearer token or dashboard session cookie.
  Regression and snapshot reads come from disk-backed records when the collector
  was started with a `projectDir`.
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
| `/api/summary` | Health plus overview summary (latency, slowest requests, recent errors, optional coverage and diagnostic overview). |
| `/api/coverage` | Instrumentation coverage for the current sample. |
| `/api/diagnostics` | Paginated deterministic findings with filters, sample window, counts and limitations. |
| `/api/diagnostics/:id` | One finding plus bounded related trace evidence. |
| `/api/config` | Sanitized config, verbose status and documented limitations. |
| `/api/requests` | Compatibility projection of `/api/traces?httpOnly=1`; filters `q`, `method`, `status`, `slow`, `minDuration`, `sort`. |
| `/api/traces` | Paginated trace summaries; filters `q`, `method`, `status`, `slow`, `minDuration`, `httpOnly`, `sort`. |
| `/api/traces/:traceId` | Canonical trace detail (spans, errors, queries, diagnostics). |
| `/api/errors` | Paginated errors plus fingerprint groups. |
| `/api/errors/:id` | Error plus correlated trace. |
| `/api/database` | Paginated queries with route correlation. |
| `/api/test-runs` | Paginated live and saved regression runs (live registry merged with disk records). |
| `/api/test-runs/:id` | A live or saved run with scenarios and sample evidence. |
| `/api/baselines` | Paginated saved baselines. |
| `/api/baselines/:id` | One saved baseline. |
| `/api/comparisons` | Paginated saved comparisons. |
| `/api/comparisons/:id` | One saved comparison. |
| `/api/snapshots` | Paginated saved snapshots with source, sample window, stats and invalid-record count. |
| `/api/snapshots/:id` | Snapshot summary, captured config, limitations and first traces/errors/queries. |
| `/api/snapshots/:id/export` | Snapshot converted to the standard redacted export shape. |
| `/api/snapshots/:id/traces` | Scoped trace list from a detached snapshot view. |
| `/api/snapshots/:id/traces/:traceId` | Scoped trace detail without live diagnostics. |
| `/api/snapshots/:id/errors` | Scoped error list. |
| `/api/snapshots/:id/errors/:errorId` | Scoped error detail. |
| `/api/snapshots/:id/database` | Scoped database query list. |
| `/api/export` | Full redacted buffer as JSON. |

The store is in memory only. `TelemetryStore` keeps spans (capacity
`collector.maxSpans`), errors and queries (derived caps), prunes by
`receivedAt`, and counts capacity/retention drops. It builds trace indexes
lazily for reads; there is no database or on-disk telemetry file. Regression
runs, baselines, comparisons and snapshots are the exception: they are explicit
JSON records under `.stacknext`, not part of the live telemetry store. Snapshot
reads use a detached store so they never replay into the live sample.

## Runtime state and CLI lifecycle

`stacknext dev`:

1. Detects the project, Next.js version, App Router directory and package
   manager.
2. Loads `stacknext.config.json`.
3. Resolves the built dashboard, generates a bearer token, and starts the
   collector.
4. Writes `.stacknext/run.json` (`0600`, with a `.gitignore`) containing the pid,
   URLs, port, token, project name and Next.js version.
5. Builds the child environment (`STACKNEXT_COLLECTOR_URL`, token, project name,
   capture flags, debug flag, effective `NEXT_OTEL_VERBOSE`) and spawns the
   project's `dev` script.
6. Forwards SIGINT/SIGTERM to the child, saves an exit snapshot when
   `snapshots.autoOnExit` is enabled and the sample has data, closes the
   collector, removes runtime state and exits.

`status`, `doctor`, `export`, `capture`, `snapshot` and `mcp` read runtime state
and refuse to operate when the recorded process is dead. `capture` can also start
an ephemeral collector when no live runtime exists; `--attach` disables that
fallback. `doctor` also checks Node/Next versions, App
Router, config validity, instrumentation imports, adapter/config mismatches,
dashboard build presence, token file permissions and collector health.

## Dashboard

The dashboard is a React 19 single-page app built with Vite. It uses the
History API, not a server router: `/traces` (with `?view=requests` for the
HTTP-request view), `/traces/:traceId`, `/database`, `/errors`,
`/errors/:errorId`, `/diagnostics`, `/diagnostics/:id`, `/runs`, `/runs/:id`,
`/baselines`, `/baselines/:id`, `/comparisons`, `/comparisons/:id`,
`/snapshots`, `/snapshots/:id`, `/snapshots/:id/traces`,
`/snapshots/:id/traces/:traceId`, `/snapshots/:id/errors`,
`/snapshots/:id/errors/:errorId`, `/snapshots/:id/database`, `/settings` and
`/mcp`. Legacy `/requests` and `/requests/:traceId` URLs redirect in the client
to the request view and trace detail. The collector serves the same `index.html`
for all of these paths.

Data loading uses `fetch` with abort signals; reads refresh when the SSE
sequence changes. The shell maintains a health poll even if SSE is down. The
theme control supports system/dark/light, persisted in `localStorage`; CSS
custom properties implement both themes, and the layout is responsive down to
mobile widths. Empty states include setup steps rather than placeholder data.

The Overview page shows a compact instrumentation-coverage panel from a separate
`/api/coverage` read plus the summary endpoint, and a diagnostics card from the
additive summary overview. The `/diagnostics` page lists findings with
category/severity/status/rule/route/time filters; `/diagnostics/:id` shows the
bounded evidence, verification steps, limitations and related trace link. The
request/trace timeline groups spans by framework, app/custom, database and fetch
categories, shows status, duration and attributes, and can collapse sections. It
surfaces unknown or missing durations and missing-parent warnings rather than
substituting zero or repairing the tree. Navigation links jump to the request
detail or the parent span. The `/runs`, `/baselines` and `/comparisons` views
render the saved regression records, correlation status, environment,
per-scenario reasons and metrics; they read the collector APIs and do not
recompute comparisons in the browser. `/snapshots` lists frozen samples and
their source/size/sample window; `/snapshots/:id` shows the captured config,
limitations and first traces/errors/queries, with scoped read-only trace, error
and database routes. `/settings` hosts collector, adapter, snapshot and
appearance settings, while `/mcp` hosts the client configuration and the
read-only tool catalog.

## TypeScript/build layout

- `tsconfig.base.json` holds strict compiler options only. It intentionally has
  no workspace `paths`.
- Each package `tsconfig.json` maps `@stacknext/*` to source files for
  typechecking. This keeps `pnpm typecheck` correct before a build.
- Each package `tsconfig.build.json` sets `"paths": {}` and emits from `src` to
  `dist`. Build-time resolution uses the built package types instead of source.
- This split matters for Next.js/Turbopack: inheriting source `paths` caused
  Turbopack to bundle `packages/next/src` and fail on `./exporter.js` imports.
- `pnpm -r build` respects workspace topology so `core` is built before packages
  that import it, and `dashboard` is built before `cli` publishes/serves it.

## MCP and agent integration

`packages/mcp` builds an `McpServer` from `@modelcontextprotocol/sdk` and a
`StackNextApiClient`. The CLI `mcp` command resolves the runtime token and
connects the server to `StdioServerTransport`. The client refuses non-loopback
URLs, uses GET only and has a 5-second timeout. All twenty tools are read-only
and preserve the original 0.1 tool names and arguments.

The 0.2 server adds:

- **Structured output.** Each tool declares an `outputSchema` and returns both
  the existing JSON text content and `structuredContent`, so older clients keep
  working while newer clients can validate the shape.
- **Response metadata.** A small top-level `meta` object reports pagination,
  connection/instrumentation state, the event time range, completeness reasons
  and short caveats. A five-second health cache supplies connection state
  without adding a collector round trip to every call.
- **Guided prompts.** `diagnose-error`, `investigate-slow-request`,
  `inspect-database-activity`, `investigate-trace` and
  `diagnose-runtime-issue` shape an investigation but cannot execute tools or
  add capabilities.
- **Server instructions.** Initialization publishes a short workflow reminder
  that clients such as Codex can read.

Coverage visibility (added in 0.3) did not add tools:

- `get_project_summary` includes the full coverage report and a compact
  `meta.coverage` object (`observed`, `active`, `configured`, `notObserved`,
  `unsupported`, `unknown`, `requestsInSample`).
- Summary `notes` explain that a `not-observed` or `unknown` item means evidence
  is missing, not that the app is broken.
- Server instructions and the summary tool description tell agents to check
  coverage before recommending instrumentation changes.

The 0.4 server adds deterministic diagnostics:

- `stacknext_list_diagnostics` lists the same findings as the CLI/dashboard with
  the shared filters and a bounded page.
- `stacknext_get_diagnostic` returns one finding, its verification/limitations
  and a bounded related trace.
- `get_trace` gains an additive `diagnostics` array of finding references; the
  existing trace shape and arguments are unchanged.
- `diagnose-runtime-issue` is the fifth guided prompt. Server instructions and
  the Agent Skill require agents to verify findings and state what remains
  unproven.

The StackNext server exposes six regression tools without changing existing names or
arguments:

- `stacknext_list_test_runs` and `stacknext_get_test_run` read live/saved capture
  runs, scenario samples, correlation completeness and evidence.
- `stacknext_list_baselines` and `stacknext_get_baseline` read immutable
  baselines and their source runs.
- `stacknext_list_comparisons` and `stacknext_get_comparison` read deterministic
  comparisons, environment differences, per-scenario reasons and metrics.
- All six keep `readOnlyHint: true`, validate ids, bound lists and return the
  additive `meta` contract. They cannot capture, save, compare, delete or edit.
  Server instructions warn that `inconclusive` is not a pass and that regression
  statuses are not statistical significance.

The snapshot release adds three more read-only tools:

- `stacknext_list_snapshots` lists frozen samples with source, capture time,
  sample window, counts, size and invalid-record count.
- `stacknext_get_snapshot` returns one snapshot summary, captured config,
  limitations and its first traces/errors/queries.
- `stacknext_get_snapshot_trace` returns one trace from a snapshot's detached
  view; it intentionally has no diagnostics.
- All three keep `readOnlyHint: true` and the additive `meta` contract. They
  cannot save, import, delete or replay a snapshot. Server instructions warn
  that snapshot data is evidence from the save time, not current live telemetry,
  and that snapshots contain no live diagnostics or coverage.

The portable skill lives at `skills/stacknext-debugging` and is not imported by
the MCP package. It is copied into the `@stacknext/cli` archive at pack time and
installed into client projects with `stacknext skill install`. It documents the
same read-only boundary and evidence rules for clients that load Agent Skills.
The MCP server remains a separate stdio process; the skill cannot make it mutate
data, read files or reach a non-loopback URL.

Response metadata is additive. Tool failures still return `isError: true` with
text and no structured content. Error stacks are omitted from `list_errors` by
default to reduce context, while `get_error` keeps the redacted stack.
