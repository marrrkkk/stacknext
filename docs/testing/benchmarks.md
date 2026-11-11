# Benchmarks

StackNext ships four reproducible benchmarks:

- **Collector benchmark** — synthetic ingest throughput and read-API latency
  against the real HTTP endpoint and in-memory store. It does not require a
  Next.js app.
- **Diagnostics benchmark** — synthetic telemetry that triggers four of the six
  diagnostic rules, measuring cold report generation and cached diagnostics
  reads. It also does not require a Next.js app.
- **Dashboard benchmark** — the built dashboard in Chromium under synthetic
  ingest, measuring live-refresh reads, long tasks, heap/DOM counters, hidden-tab
  behavior and JavaScript bundle size.
- **Verbose tracing overhead** — a real example-app comparison of standard
  Next.js spans versus `NEXT_OTEL_VERBOSE=1`.

The numbers below are a historical 0.6 measurement, not a promise for the
current release. Rerun the scripts on your machine and record the environment
when you publish new numbers.

All run after a build:

```bash
pnpm build
pnpm benchmark
pnpm benchmark:diagnostics
pnpm benchmark:dashboard
pnpm benchmark:verbose
```

## Collector benchmark

The collector script starts a collector on an ephemeral loopback port, sends 500
traces (5,000 spans) in ten batches, then samples the read API. It uses no mocks
and does not require the example app or a running `stacknext dev`. It is not a
Next.js application benchmark: see [Caveats](#collector-caveats).

## Methodology

- **Workload:** 500 traces × 10 spans = 5,000 spans. Each trace has a
  `BaseServer.handleRequest` root plus nine internal child spans. Roughly a
  third use `/bench/slow`; the rest use `/bench/[id]`. One batch contains 50
  traces.
- **Ingest:** sequential JSON `POST`s to `/__stacknext/v1/ingest` with the
  bearer token. The timer includes request serialization, the loopback round
  trip, Zod validation, the second redaction pass and store insertion.
- **Read API:** after ingest, each endpoint gets two warm-up calls followed by
  20 measured calls (5 for `/api/export`). The timer includes response parsing
  via `arrayBuffer()`.
- **Statistics:** p50 and p95 use nearest-rank percentiles over the samples.
  `max` is the slowest single call.
- **Isolation:** run the benchmark alone. Concurrent builds/tests materially
  change the numbers; a contended run during documentation measured less than
  half the ingest throughput of an isolated run.

## Environment

| | |
| --- | --- |
| CPU | AMD Ryzen 7 5700U, 8 logical cores |
| Memory | 5.8 GiB visible (WSL2) |
| OS | Linux 6.18.54.1-microsoft-standard-WSL2, x86_64 |
| Node.js | 24.21.0 |
| StackNext | 0.6.0 (source checkout) |
| Date | 2026-11-02 |

## Results

Four runs on the environment above with no build or test workload running.
Runs A–C are retained as historical reference points; Run D is the recorded 0.6
measurement. The diagnostics overview in `/api/summary` and the diagnostics
section in `/api/export` are included in the 0.4 and 0.6 numbers.

| Metric | Run A | Run B | Run C (0.4) | Run D (0.6) |
| --- | ---: | ---: | ---: | ---: |
| Ingest throughput | 18,042 spans/s | 14,211 spans/s | 22,514 spans/s | 22,219 spans/s |
| Request throughput | 1,804 traces/s | 1,421 traces/s | 2,251 traces/s | 2,222 traces/s |
| Ingest batch latency p50 | 19.5 ms | 24.4 ms | 15.3 ms | 16.8 ms |
| Ingest batch latency p95 | 78.6 ms | 115.7 ms | 73.0 ms | 75.5 ms |
| Store after ingest | 500 requests, 5,000 spans | 500 requests, 5,000 spans | 500 requests, 5,000 spans | 500 requests, 5,000 spans |
| Capacity drops | 0 | 0 | 0 | 0 |

Read API latency in milliseconds (p50 / p95 / max):

| Endpoint | Run A | Run B | Run C (0.4) | Run D (0.6) |
| --- | --- | --- | --- | --- |
| `/api/health` | 8.52 / 11.1 / 11.2 | 8.60 / 12.9 / 14.6 | 5.03 / 6.59 / 7.64 | 5.93 / 7.75 / 9.22 |
| `/api/summary` | 13.0 / 19.3 / 23.0 | 10.6 / 13.8 / 14.6 | 11.4 / 13.0 / 14.3 | 13.7 / 16.7 / 16.8 |
| `/api/requests?limit=50` | 3.45 / 4.61 / 5.75 | 2.95 / 4.62 / 5.39 | 2.61 / 3.28 / 4.06 | 2.87 / 3.81 / 4.47 |
| `/api/traces?limit=50` | 5.46 / 9.00 / 11.7 | 3.48 / 4.60 / 4.98 | 3.07 / 4.34 / 4.67 | 3.39 / 4.37 / 4.48 |
| `/api/database?limit=50` | 5.45 / 9.11 / 9.94 | 3.38 / 5.00 / 5.16 | 2.31 / 3.07 / 3.27 | 2.62 / 3.56 / 4.41 |
| `/api/errors?limit=50` | 4.89 / 6.48 / 6.53 | 3.52 / 4.27 / 4.62 | 2.47 / 3.10 / 3.40 | 2.64 / 3.61 / 4.20 |
| `/api/export` | 44.1 / 54.6 / 54.6 | 29.0 / 34.2 / 34.2 | 23.2 / 34.4 / 34.4 | 21.7 / 25.8 / 25.8 |

The default store capacity is 5,000 spans, so this workload exactly fills it.
Capacity is a hard bound; larger workloads drop the oldest spans and count the
drops.

## Interpretation

- On this machine the collector accepts roughly **15k–22k spans/s** over
  loopback. A typical development app produces a handful of spans per request:
  the bottleneck will be Next.js instrumentation and the app, not the
  collector.
- Request/trace listing stays in the low single-digit milliseconds at 500
  traces. Summaries and full export do more aggregation/serialization and are
  correspondingly slower, but remain well under typical UI budgets.
- These numbers are for a loopback, single-process, in-memory workload. They do
  not predict performance over a network, with disk persistence, or with many
  concurrent SSE clients.

## Collector caveats

- **Synthetic data.** Spans are generated in the benchmark process. Real
  Next.js traces have more attributes, events, fetch spans and occasional
  missing parents, so real ingest is heavier.
- **No app overhead.** The benchmark does not measure Next.js request handling,
  OpenTelemetry span creation, the application-side transport timer or the
  dashboard's browser rendering.
- **Sequential client.** Batches are posted one at a time. The SDK normally
  sends from a background timer, so this favors latency measurement over
  maximum concurrent throughput.
- **Machine-specific.** CPU, memory pressure, WSL2 scheduling, Node.js version
  and background processes all matter. Treat the table as a reference point,
  not a guarantee.
- **No database events in the workload.** The store is exercised with spans,
  requests and traces; query/error indexes are still created but empty, which
  makes `/api/database` and `/api/errors` slightly cheaper than a real mixed
  workload.
- **No production claim.** StackNext is a local development tool. These
  measurements are not a capacity plan for a shared or production service.

## Diagnostics benchmark

The diagnostics script starts a collector on an ephemeral loopback port, ingests
a synthetic sample that exercises its four target rules, then measures the cold
report and the cached read paths. It uses the real collector, store, diagnostics
engine and HTTP API. It does not require the example app or a running
`stacknext dev`.

```bash
pnpm build
pnpm benchmark:diagnostics
```

### Workload

- 400 traces × 10 spans = 4,000 spans, plus 120 synthetic evidence spans.
- 30 traces contain eight repeated task queries each (240 queries total) to
  trigger `n-plus-one-queries`.
- 30 traces contain a 300 ms database span, above the default 250 ms database
  threshold, to trigger `slow-span`.
- 30 traces contain three fetches to the same normalized external endpoint to
  trigger `repeated-external-http`.
- 40 traces contain an error with the same name and message to trigger one
  `error-fingerprint` group.
- Default diagnostics config and the default 100-finding cap.

The sample produces **91 findings**: 30 possible N+1, 30 possible repeated HTTP,
30 observed slow spans and 1 observed error group. Counts by status are 60
`possible` and 31 `observed`.

### Method

- Ingest is sequential JSON `POST`s with the bearer token, as in the collector
  benchmark.
- The cold number is the first `/api/diagnostics?limit=50` call after ingest. It
  includes report generation, filtering, serialization and response parsing.
- Cached endpoints get two warm-up calls followed by 20 measured calls (5 for
  `/api/export`). The timer includes response parsing via `arrayBuffer()`.
- The detail sample uses the first finding id returned by the cold report.
- `/api/summary` includes the additive diagnostics overview and `/api/export`
  includes the additive diagnostics section in these measurements.

### Results

Measured 2026-11-02 on the environment above, with no other build or test
workload running:

| Metric | Value |
| --- | ---: |
| Ingest throughput | 15,639 spans/s |
| Ingest batch latency p50 | 5.01 ms |
| Ingest batch latency p95 | 10.2 ms |
| Cold diagnostics report | 26.2 ms |
| Findings | 91 (60 possible, 31 observed) |
| Store after ingest | 400 requests, 4,120 spans, 240 queries, 40 errors |
| Capacity drops | 0 |

Cached read latency in milliseconds (p50 / p95 / max):

| Endpoint | p50 | p95 | max |
| --- | ---: | ---: | ---: |
| `/api/diagnostics?limit=50` | 4.77 | 5.68 | 6.90 |
| `/api/diagnostics?category=database&severity=warning&limit=50` | 4.90 | 5.64 | 5.71 |
| `/api/diagnostics/:id` | 4.33 | 4.78 | 5.18 |
| `/api/summary` (with overview) | 12.9 | 16.1 | 16.9 |
| `/api/export` (with diagnostics) | 24.5 | 37.2 | 37.2 |

### Interpretation

- Cold report generation scans the current in-memory sample once and is cached
  by store revision. On this workload it cost about 26 ms; subsequent list,
  filter and detail reads stayed in the low single-digit milliseconds.
- The diagnostics engine is bounded by the store sample and the configured
  finding cap, not by an unbounded history. The benchmark does not test a
  capacity-exceeded store or a report at the 100-finding cap with much larger
  evidence arrays.
- `/api/summary` and `/api/export` are heavier because they aggregate and
  serialize the whole sample. Diagnostics adds a bounded overview/detail section
  to each, not a second copy of every span.
- These numbers are for a synthetic loopback workload. Real apps have different
  finding mixes, larger attributes, and dashboard rendering costs.

### Diagnostics caveats

- **Synthetic findings.** The workload deliberately creates repeated queries,
  slow spans, repeated fetches and errors. It does not exercise
  `slow-request` or `server-error-response`, and it does not measure the
  accuracy of the rules on real application code.
- **Single cold sample.** The first report is measured once per process. Run the
  script several times to see cold-generation variance.
- **No dashboard.** The benchmark measures HTTP APIs, not React rendering or
  browser interaction.
- **Machine-specific.** CPU, memory pressure, WSL2 scheduling and Node.js
  version affect the numbers.
- **No production claim.** StackNext is a local development tool. These
  measurements are not a capacity plan for a shared or production service.

## Dashboard benchmark

The dashboard benchmark starts the built collector on an ephemeral loopback
port, serves `packages/dashboard/dist`, seeds 100 synthetic batches, then drives
the real dashboard with Playwright while a separate loop posts 10 ingest events
per second. Each route gets a 10-second settled window, so initial page loads do
not inflate the live-refresh count.

```bash
pnpm build
pnpm benchmark:dashboard

# Optional: fail on the plan budgets and print per-endpoint request counts.
pnpm benchmark:dashboard -- --enforce --verbose
```

### Method

- Chromium runs headless at 1440×900. The collector uses the normal session
  cookie flow for the dashboard and bearer token for ingest.
- The measured routes are `/`, `/traces`, `/database`, `/errors`,
  `/diagnostics`, `/runs`, `/baselines`, `/comparisons`, `/snapshots`,
  `/settings`, `/mcp`, plus the newest trace and error detail pages.
- For each route the script resets its request counter after the page has
  loaded, waits 10 seconds and counts same-origin `GET /api/*` requests other
  than `/api/stream`. It also records API requests while the tab is hidden.
- Long tasks come from a `PerformanceObserver` installed before application
  code. Heap, DOM node and event-listener counts come from the Chrome DevTools
  Protocol after `HeapProfiler.collectGarbage`.
- After two full route cycles the script compares heap and counters on the same
  route. The hidden-tab check overrides `document.hidden` and dispatches
  `visibilitychange`, because headless Chromium keeps every page visible.
- JavaScript sizes are gzip sizes of the files in `packages/dashboard/dist`
  referenced by `index.html` (initial) and of every other route chunk.
- The collector uses a 20,000-span cap so detail routes stay readable for the
  full run. The browser receives already-redacted synthetic telemetry.

### Results

Measured 2026-11-11 on the environment above, with Node.js 24.21.0, no other
build or test workload running, and `LIVE_FLUSH_MS = 1000`:

| Route | Read requests / 10 s | Long tasks > 100 ms |
| --- | ---: | ---: |
| `/` | 22 | 0 |
| `/traces` | 12 | 0 |
| `/database` | 12 | 0 |
| `/errors` | 12 | 0 |
| `/diagnostics` | 12 | 0 |
| `/runs`, `/baselines`, `/comparisons`, `/snapshots`, `/settings`, `/mcp` | 2 each | 0 |
| trace detail | 11 | 0 |
| error detail | 12 | 0 |

The two reads on otherwise idle pages are the shell's health and latest-error
checks. Overview's 22 reads are the summary and recent-request list across ten
coalesced live flushes, plus the same two shell checks. `/api/summary` carries
coverage and bounded recent error groups, so Overview does not request either
separately. The one longest live task was a 51 ms trace-list render on
`/traces`; no route exceeded the 100 ms budget.

| Metric | Result |
| --- | ---: |
| Hidden tab read requests / 10 s | 0 |
| Heap after forced GC | ~4 MiB, flat between route cycles |
| DOM documents / nodes / listeners | stable on the same route after forced GC |
| Initial JavaScript (two chunks) | 120.0 KiB gzip |
| Largest initial chunk | 67.2 KiB gzip (`react` vendor) |
| Largest route chunk | 7.8 KiB gzip (`OverviewPage`) |
| Browser page errors | 0 |

### Dashboard caveats

- **Headless browser.** Chromium is headless and the hidden-tab check uses a
  visibility override, not OS-level background throttling. It verifies the
  dashboard's own visibility handling, not Chromium's timer throttling.
- **Synthetic workload.** Ten batches per second is a stress level; a typical
  development app produces far fewer events. The script does not measure React
  commit time or rendering cost per component.
- **One run per metric.** Heap and listener counts vary with route, lazy chunks
  and browser internals. Compare two runs on the same machine instead of
  treating a single counter as a leak proof.
- **Bundle sizes are build-local.** The collector serves assets without gzip;
  these numbers describe parse and transfer cost on loopback, not a network
  deployment.
- **Not a CI gate by default.** The script is report-only unless `--enforce` is
  passed, and it requires Playwright Chromium.



## Verbose tracing overhead

The verbose benchmark measures the same real example app with standard Next.js
telemetry and with the documented `NEXT_OTEL_VERBOSE=1` span set. It exists to
put a directional number behind the coverage warning; it is not a comparison of
Next.js versions or production configurations.

```bash
pnpm build
pnpm benchmark:verbose
```

### Method

- The script starts the built CLI with `stacknext dev --quiet` in
  `apps/example`. Every measured mode gets a fresh collector and
  Next.js dev server, and both are stopped before the next run.
- `NEXT_OTEL_VERBOSE` is set explicitly to `0` or `1` in the parent environment.
  An explicit inherited value wins over `instrumentation.verbose`, so the two
  modes cannot drift if the config file changes.
- Two paired runs alternate the order (`standard`, `verbose`, then `verbose`,
  `standard`) to reduce warm-cache bias.
- Each mode serves 10 warm-up requests to `/api/projects` and five to `/`, then
  40 sequential requests to each measured endpoint. The reported table is the
  median of the two runs' p50, p95 and max values.
- Endpoints:
  - `/api/projects` — route handler plus a Drizzle query;
  - `/` — page render.
- Span counts come from the collector's health counters before and after the
  measured requests. `spans/request` includes framework, database and fetch
  spans, not only Next.js spans.
- The script reads `/api/health` and `/api/coverage` and fails if the effective
  verbose state does not match the requested mode.

### Results

Historical measurements of the former `apps/example-next-app`, taken 2026-11-02
on the environment above with no other build or test workload running. These
results do not measure the rebuilt `apps/example`; the method above describes
how to rerun against the current app:

| Mode | Endpoint | p50 | p95 | max |
| --- | --- | ---: | ---: | ---: |
| Standard | `/api/projects` (route handler) | 10.0 ms | 12.9 ms | 20.1 ms |
| Verbose | `/api/projects` (route handler) | 9.93 ms | 16.7 ms | 34.0 ms |
| Standard | `/` (page render) | 49.9 ms | 64.3 ms | 70.6 ms |
| Verbose | `/` (page render) | 49.8 ms | 65.9 ms | 76.0 ms |

| Mode | Spans per measured request | Verbose-only span types |
| --- | ---: | ---: |
| Standard | 8.00 | 0 |
| Verbose | 18.50 | 11 |

The route-handler p50 moved by **−1.0%** (10.0 → 9.93 ms). The page-render p50
moved by **−0.2%** (49.9 → 49.8 ms). The p95 results were mixed, and the
single-request max grew in both endpoints. The more important change is volume:
verbose tracing produced about **2.3×** as many spans per measured request
(8.00 → 18.50) and 11 span types that were absent in standard mode.

### Reading the result

- On this dev setup, the request-latency effect of verbose tracing was small
  relative to the run-to-run noise. The span-volume effect was consistent and is
  the larger operational cost: more spans to export, store, render and prune,
  and a shorter effective retention window when capacity is reached.
- Verbose tracing still does not name individual Server Components or Server
  Actions. It adds documented Next.js span types; use the manual helpers for
  application-level work.
- The benchmark runs against a development server. Compilation state, route
  caching, WSL2 scheduling and machine load dominate small latency differences;
  do not read the percentages as a production overhead guarantee.

### Verbose caveats

- **Two pairs only.** The sample is deliberately small because each mode starts a
  fresh Next.js dev server. Treat the numbers as directional.
- **Dev-server effects.** Next.js compiles and caches routes during the measured
  phase. Alternating order reduces, but does not eliminate, this bias.
- **Workload-specific.** Different routes, RSC payloads, fetch fan-out and
  database work produce different span ratios. The retention impact grows with
  span volume, not just request latency.
- **No production claim.** Verbose tracing is a local debugging tool. Measure
  your own app if you need a capacity estimate.