# Benchmark

NextScope ships a reproducible synthetic benchmark for the local collector. It
measures ingest throughput through the real HTTP endpoint and read-API latency
against the real in-memory store. It is not a Next.js application benchmark:
see [Caveats](#caveats).

Run it after a build:

```bash
pnpm build
pnpm benchmark
```

The script starts a collector on an ephemeral loopback port, sends 500 traces
(5,000 spans) in ten batches, then samples the read API. It uses no mocks and
does not require the example app or a running `nextscope dev`.

## Methodology

- **Workload:** 500 traces × 10 spans = 5,000 spans. Each trace has a
  `BaseServer.handleRequest` root plus nine internal child spans. Roughly a
  third use `/bench/slow`; the rest use `/bench/[id]`. One batch contains 50
  traces.
- **Ingest:** sequential JSON `POST`s to `/__nextscope/v1/ingest` with the
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
| NextScope | 0.1.0 (source checkout) |
| Date | 2026-11-02 |

## Results

Two runs on the environment above with no build or test workload running:

| Metric | Run A | Run B |
| --- | ---: | ---: |
| Ingest throughput | 18,042 spans/s | 14,211 spans/s |
| Request throughput | 1,804 traces/s | 1,421 traces/s |
| Ingest batch latency p50 | 19.5 ms | 24.4 ms |
| Ingest batch latency p95 | 78.6 ms | 115.7 ms |
| Store after ingest | 500 requests, 5,000 spans | 500 requests, 5,000 spans |
| Capacity drops | 0 | 0 |

Read API latency in milliseconds (p50 / p95 / max):

| Endpoint | Run A | Run B |
| --- | --- | --- |
| `/api/health` | 8.52 / 11.1 / 11.2 | 8.60 / 12.9 / 14.6 |
| `/api/summary` | 13.0 / 19.3 / 23.0 | 10.6 / 13.8 / 14.6 |
| `/api/requests?limit=50` | 3.45 / 4.61 / 5.75 | 2.95 / 4.62 / 5.39 |
| `/api/traces?limit=50` | 5.46 / 9.00 / 11.7 | 3.48 / 4.60 / 4.98 |
| `/api/database?limit=50` | 5.45 / 9.11 / 9.94 | 3.38 / 5.00 / 5.16 |
| `/api/errors?limit=50` | 4.89 / 6.48 / 6.53 | 3.52 / 4.27 / 4.62 |
| `/api/export` | 44.1 / 54.6 / 54.6 | 29.0 / 34.2 / 34.2 |

The default store capacity is 5,000 spans, so this workload exactly fills it.
Capacity is a hard bound; larger workloads drop the oldest spans and count the
drops.

## Interpretation

- On this machine the collector accepts roughly **14k–18k spans/s** over
  loopback. A typical development app produces a handful of spans per request:
  the bottleneck will be Next.js instrumentation and the app, not the
  collector.
- Request/trace listing stays in the low single-digit milliseconds at 500
  traces. Summaries and full export do more aggregation/serialization and are
  correspondingly slower, but remain well under typical UI budgets.
- These numbers are for a loopback, single-process, in-memory workload. They do
  not predict performance over a network, with disk persistence, or with many
  concurrent SSE clients.

## Caveats

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
- **No production claim.** NextScope is a local development tool. These
  measurements are not a capacity plan for a shared or production service.
