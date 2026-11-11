# Architecture overview

StackNext is a local-first debugging center for Next.js App Router
applications. It has no hosted backend, account system, AI API client or
outbound telemetry. This page describes the implementation shape that
contributors need to preserve.

The user-facing explanation lives in
[`apps/docs/overview/core-concepts.mdx`](../../apps/docs/overview/core-concepts.mdx).

## Processes

```text
Next.js app process (Node.js runtime)
  instrumentation.ts -> @stacknext/next
    OpenTelemetry provider + exporter
    Drizzle/Prisma adapters
    manual span and Server Action helpers
    bounded StackNextTransport
          |
          | HTTP POST /__stacknext/v1/ingest (bearer token)
          v
stacknext dev process
  loopback collector + dashboard host + CLI commands
  bounded in-memory TelemetryStore
  diagnostics, coverage, regression registry, snapshot storage
          |
          +--> dashboard assets and read APIs (token or session cookie)
          +--> SSE stream
          +--> CLI status/doctor/coverage/diagnose/export/snapshot
          +--> read-only MCP stdio client (separate process)

Playwright process
  @stacknext/playwright fixture
    injects W3C traceparent, probes the collector, submits samples
          |
          +--> stacknext capture writes .stacknext/runs
               stacknext baseline save writes .stacknext/baselines
               stacknext compare writes .stacknext/comparisons
```

The collector, dashboard and CLI share one Node process started by
`stacknext dev`. The MCP server is a separate process that only performs GETs
against the collector. See
[ADR 0001](../decisions/0001-native-only-runtime.md) for why there is no managed
container runtime.

## Instrumentation path

`register()` in `packages/next` is called from the app's `instrumentation.ts`.
It is inert when `STACKNEXT_COLLECTOR_URL` and `STACKNEXT_TOKEN` are absent, and
it runs only on the Node.js runtime.

The registration:

1. yields to an existing OpenTelemetry provider instead of replacing it;
2. installs a composite W3C propagator so an injected `traceparent` becomes the
   server trace root;
3. registers a `NodeTracerProvider` with a `BatchSpanProcessor` and the
   StackNext exporter.

The generated `instrumentation.ts` exports `onRequestError` separately. That
hook forwards errors through the same redaction and normalization path when
error capture is enabled.

The exporter rejects invalid ids and internal spans, redacts attributes,
status messages, span names, resources and events, normalizes OTel time to
milliseconds, and enqueues plain objects. Network I/O happens on the transport
timer, never on the request path.

`packages/core/src/framework.ts` owns the documented Next.js span allowlist.
Keep it aligned with the supported Next.js 15/16 versions. Do not patch
undocumented Next.js internals or add `NEXT_PRIVATE_*` switches.
`NEXT_OTEL_VERBOSE=1` is the only verbose switch; an explicit inherited value,
including `0`, wins over `instrumentation.verbose`.

## Collector and store

`packages/cli/src/collector/server.ts` hosts the loopback HTTP server. It
enforces:

- loopback bind and Host/Origin/`Sec-Fetch-Site` checks;
- bearer authentication for ingestion;
- bearer token or dashboard session cookie for read APIs and SSE;
- ingest body limits and Zod validation;
- a second redaction and normalization pass before storage;
- static dashboard assets, CSP and security headers.

`packages/core/src/store.ts` is the bounded in-memory store. Defaults are 5,000
spans and a 600-second retention window. Capacity and retention drops are
counted and exposed in health and status output. Errors and database queries
have their own derived caps. The store never persists live telemetry.

Read API groups:

| Group | Routes |
| --- | --- |
| Health and state | `/api/health`, `/api/ping`, `/api/summary`, `/api/config`, `/api/coverage`, `/api/stream` |
| Telemetry | `/api/requests`, `/api/traces`, `/api/database`, `/api/errors`, `/api/export` |
| Diagnostics | `/api/diagnostics`, `/api/diagnostics/:id` |
| Regression | `/api/test-runs`, `/api/test-runs/:id`, `/api/baselines`, `/api/baselines/:id`, `/api/comparisons`, `/api/comparisons/:id` |
| Snapshots | `/api/snapshots`, `/api/snapshots/:id`, `/api/snapshots/import` |

Ingestion uses `/__stacknext/v1/ingest`. Test-run capture uses bearer-only
ingest and completion endpoints. The exact request and response schemas live in
`packages/core/src/schema.ts`, `packages/core/src/diagnostics.ts` and
`packages/regression/src`.

## Coverage

Coverage is computed on read from four sources: store evidence, sanitized
project config, current collector connections and the effective verbose state.
It returns independent items with `observed`, `active`, `configured`,
`not-observed`, `unknown` or `unsupported` status. There is no composite
percentage. `not-observed` and `unknown` are not proof that a feature is
broken. Keep the sample window and item limitations visible in CLI, dashboard
and MCP output.

## Diagnostics

`packages/diagnostics` is a pure, deterministic layer over the current store
sample. It does not read source files, call a model, run SQL/EXPLAIN, use the
network or write to the app. The collector computes a report; the CLI,
dashboard, export, MCP server and Agent Skill consume the same report.

The six rules are `n-plus-one-queries`, `slow-request`, `slow-span`,
`repeated-external-http`, `error-fingerprint` and `server-error-response`.
Finding ids are deterministic, evidence is bounded and re-sanitized, and a
finding is never presented as a confirmed root cause. See
[`apps/docs/guides/diagnostics.mdx`](../../apps/docs/guides/diagnostics.mdx) for
the user-facing rule descriptions and
`packages/diagnostics/docs/rules.md` for the package reference.

## Regression evidence

`packages/regression` owns capture-run, baseline and comparison schemas, stable
scenario and trace identities, environment snapshots, deterministic comparison
and private atomic storage. `packages/playwright` injects trace context and
submits samples only during an active `stacknext capture` run.

A sample is verified only when the collector finds the injected trace id and a
server span parented to the injected span id. There is no time-window fallback.
Ambiguous correlation becomes `incomplete` and forces the affected comparison
to `inconclusive`. Comparisons use medians and explicit thresholds; they are
report-only and never claim statistical significance or causality.

Records live under `.stacknext/{runs,baselines,comparisons}` with strict
versioned schemas, `0700`/`0600` permissions, atomic writes and a 16 MiB cap.
Never auto-delete a record and never overwrite one without an explicit request.

## Snapshots

`packages/core/src/snapshots.ts` freezes one redacted sample under
`.stacknext/snapshots`. A snapshot is never replayed into the live store. Reads
use a detached store view and carry no live diagnostics or coverage.

Snapshots save manually, on graceful exit and on the first error with a
60-second cooldown. Only automatic exit/error snapshots rotate beyond
`snapshots.autoKeep` (default 10); manual and imported snapshots are never
auto-deleted. Writes are atomic with `0700`/`0600` permissions, each snapshot is
capped by `snapshots.maxBytes` (default 64 MiB), and an oversized save fails
instead of truncating. Imports are re-normalized and re-redacted.

## Where to change what

| Change | Start here |
| --- | --- |
| Wire field or validation | `packages/core/src/schema.ts`, then both redaction layers |
| Span classification or allowlist | `packages/core/src/framework.ts`, `packages/core/src/normalize.ts` |
| Store limits or aggregation | `packages/core/src/store.ts` |
| Collector route or auth | `packages/cli/src/collector/server.ts` |
| Diagnostic rule | `packages/diagnostics/src/rules.ts` and the package docs |
| Regression schema or comparison | `packages/regression/src/` |
| Playwright correlation | `packages/playwright/src/` |
| Dashboard page or shell | `packages/dashboard/src/` |
| MCP tool or prompt | `packages/mcp/src/` and the package docs |
| Public guide | `apps/docs/` |
| Contributor process | `docs/` and `AGENTS.md` |

## Related

- [Package architecture](packages.md)
- [Architecture boundaries](boundaries.md)
- [Testing strategy](../testing/testing-strategy.md)
- [Public core concepts](../../apps/docs/overview/core-concepts.mdx)
