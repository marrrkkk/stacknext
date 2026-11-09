---
title: Privacy and redaction
description: The local-first data boundary, two redaction layers and captured-file contents.
---

StackNext is designed around a strict local-first boundary. Telemetry is
produced by your app, sent over loopback to the collector on this machine, and
kept in memory. Explicit capture runs, baselines, comparisons and snapshots are
redacted JSON records under the project's `.stacknext` directory; they are never
uploaded. There is no cloud service, account, analytics endpoint or outbound
ingestion.

## What is collected

| Data | Captured? | Notes |
| --- | --- | --- |
| Span names, kinds, timing, status | Yes | OpenTelemetry spans from Next.js and StackNext adapters. |
| Route, HTTP method, status code | Yes | Paths are kept; query values and fragments are removed. |
| Framework metadata | Redacted yes | Documented `next.*` fields such as span type, route, page, segment and RSC flag; query strings are removed. |
| Span attributes | Redacted yes | Framework, custom span and action attributes use the same sanitizer. Sensitive keys and headers are replaced. |
| Request headers and cookies | **No** | The SDK never reads or transmits header values. |
| Request/response bodies | **No** | Configuration refuses to enable body capture. |
| Server Action arguments, `FormData` values or return values | **No** | The action helper records only the span name and attributes you explicitly pass. |
| URL query values | **No** | Query strings and fragments are stripped. |
| SQL text | Redacted yes | Bind parameters are never read. |
| SQL bind parameters | **No** | Drizzle counts them; Prisma's `params` is never read. |
| Error messages, names, stacks, digests | Redacted yes | Useful context is kept; secret patterns are replaced. |
| Diagnostic findings | Derived yes | Deterministic rule output over already-redacted telemetry; evidence is sanitized again. |
| Playwright scenario identity and result | Redacted yes | Annotation/title, normalized file, project, tags, status, retry/repeat index, test duration and capture time. |
| Regression run, baseline and comparison records | Derived yes | Stored as private JSON under `.stacknext`; contain redacted scenario, trace, query, error, environment and command data. |
| Saved snapshots | Derived yes | Frozen redacted copy of one sample under `.stacknext/snapshots`; no diagnostics, coverage or live updates. |
| Playwright screenshots, videos or trace archives | **No** | Never read, referenced or stored by the regression fixture. |
| Collector bearer token | **No** | Only in `.stacknext/run.json` (mode `0600`); never written into a regression or snapshot record. |
| Service name, version, runtime | Yes | Used to identify the connected app instance. |
| Machine/user identifiers | **No** | Not collected by StackNext. |

## Redaction

Redaction happens twice: once in the application process before data is sent,
and again in the collector before it enters the store. A bug in one layer does
not automatically expose raw data through the other.

- **URLs**: `http://host/path?token=secret#fragment` becomes
  `http://host/path`. Relative paths lose their query string too.
- **Sensitive keys**: names containing authorization, cookie, password, secret,
  API key, access/refresh/private token, client secret, credential, connection
  string, database URL, DSN and similar terms become `[redacted]`.
- **Headers**: attribute maps with a header-shaped key are replaced wholesale.
- **Secret patterns**: bearer tokens, JWTs, GitHub/Slack/Stripe-style keys, AWS
  access key IDs, credential-bearing connection strings, and `key=value`
  password/token/secret patterns are replaced.
- **SQL**: redaction patterns are applied to query text. Bind parameters are
  never included, so values passed as `?`/`$1` parameters cannot leak.
- **Errors**: messages and stacks pass through the same text redaction. Query
  strings in stack URLs are removed. Next.js error context (router kind, route
  type, render source/type, revalidate reason and digest) is bounded and passed
  through text redaction before storage.
- **Resource attributes**: only a small allowlist is retained (service name,
  version, namespace, SDK metadata, runtime, Next.js version and environment).

Custom span, Server Action and framework attributes all pass through the same
sanitizer before enqueueing, then through the collector pass before storage.
Names are redacted and URL query strings are stripped too. Explicit markers such
as `stacknext.manual` and `stacknext.span.kind` are added by the helpers and are
not sensitive.

`NEXT_OTEL_VERBOSE=1` can add more Next.js spans and attributes to the sample.
Those fields still pass through both redaction layers; verbose tracing does not
enable body, header, cookie, query-value or SQL-parameter capture. It does
increase stored span volume and can shorten the effective retention of older
events when capacity is reached.

Instrumentation coverage is computed from this already-redacted telemetry plus
the sanitized project config and connection metadata. It does not read raw
application data, source files or environment variables.

Diagnostics are derived from the same redacted telemetry. The engine fingerprints
SQL shapes, HTTP endpoint shapes and error text without recovering query values
or bind parameters, groups findings by canonical route, computes self time from
stored span intervals, and sanitizes span names, routes, error messages, Next.js
error context and SQL previews again before returning evidence. Trace
occurrences contain trace ids, timestamps, bounded contributor labels and
durations, not request data. Findings, `/api/export` and MCP
responses are subject to the same local-only boundary. StackNext does not send
telemetry or findings to an AI provider, hosted inference service or any other
external endpoint. Diagnostic ids are deterministic references, not credentials.

Runtime regression records are explicit local files, not telemetry-store entries.
A run stores the sanitized child command line (local account paths shortened to
`~`, URL query strings removed and known secret patterns redacted), scenario
identity and Playwright status, verified trace/span/query/error evidence,
deterministic finding references and an environment snapshot. Baselines copy a
completed run; comparisons copy summary and metric data plus environment
differences. The store caps records at 16 MiB and validates them with strict
versioned schemas. Regression records never include request/response bodies,
headers, cookies, URL query values, SQL bind parameters, screenshots, video,
Playwright trace archives or the collector token. They are still local debugging
artifacts: review them before sharing or uploading them as CI artifacts.

Saved snapshots are also explicit local files. `stacknext snapshot save`, the
dashboard and the automatic exit/error hooks freeze the current sample's
already-redacted spans, errors, database queries, config and limitations into
`.stacknext/snapshots`. A snapshot does not copy diagnostics or coverage and is
never replayed into the live store. Imported exports pass through the same
normalization and redaction layer again before they are written, so an older or
hand-edited file cannot bypass the current sanitizer. Snapshot files are capped
at 64 MiB, written atomically with mode `0600`, and never overwritten implicitly.
Automatic exit/error snapshots keep the newest ten by default; manual and
imported snapshots are never rotated away. Snapshots contain no request/response
bodies, headers, cookies, URL query values, SQL bind parameters, Playwright
artifacts or the collector token.

Redaction is pattern-based and intentionally conservative, not a formal secret
scanner. If an application embeds an unrecognized secret as a literal in a SQL
string, a URL path segment, a span attribute or an error message, it may still
be stored. Keep credentials out of those places, and review an export before
sharing it.

## Local network boundary

- The collector and dashboard share one HTTP server bound to **`127.0.0.1`** or
  `localhost` only. Startup rejects any other host.
- Ingestion requires an `Authorization: Bearer <token>` header. The token is
  generated with 32 random bytes by `stacknext dev` and stored in
  `.stacknext/run.json` with mode `0600`. Plain HTTP is used because traffic
  never leaves the loopback interface.
- Read APIs and the SSE stream require either that bearer token or an
  `HttpOnly`, `SameSite=Strict` session cookie issued when the dashboard HTML is
  loaded. Sessions expire after 24 hours and are capped at 100.
- Regression capture writes (`POST /api/test-runs`, samples and complete) require
  the bearer token and are not available to the dashboard session cookie. Run,
  baseline and comparison reads use the same bearer-or-cookie boundary as other
  read APIs and only serve the collector's configured `projectDir`.
- Snapshot writes (`POST /api/snapshots`, import and delete) accept the bearer
  token or the dashboard session cookie, but still require the loopback Host and
  same-origin/Sec-Fetch-Site checks. Snapshot reads use the same boundary as
  other read APIs and only serve the collector's configured `projectDir`.
- `.stacknext` is created with mode `0700`, record files use mode `0600`, and
  `.stacknext/.gitignore` ignores runtime state. The bearer token lives in
  `.stacknext/run.json`, not in run, baseline, comparison or snapshot records.
- Requests with a non-loopback `Host` header are rejected. Cross-origin requests
  and `Sec-Fetch-Site: cross-site` requests are rejected.
- The dashboard sends a restrictive CSP (`default-src 'self'`), `nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and no CORS headers.
- The MCP server's API client refuses collector URLs that are not loopback.
- `stacknext export` writes with mode `0600`; the data is redacted, but it is
  still a full local trace dump.

## Bounds and backpressure

Instrumentation never blocks a request for telemetry network I/O. Events are
queued and flushed asynchronously.

| Bound | Default |
| --- | --- |
| App transport queue | 5,000 events total |
| Transport batch | 250 items every 250 ms |
| Ingest request body | 2 MiB |
| Spans per ingest envelope | 500 |
| Errors per ingest envelope | 25 |
| Database queries per ingest envelope | 100 |
| Stored spans | 5,000 (`collector.maxSpans`) |
| Stored errors | `max(100, min(1000, maxSpans / 5))` |
| Stored queries | `max(100, min(2000, maxSpans / 2))` |
| Retention | 10 minutes (`collector.retentionMs`) |
| Diagnostic findings | 100 (`diagnostics.maxFindings`) |
| Samples per regression scenario | 100 |
| Traces per regression sample | 20 |
| Spans / queries / errors per captured trace | 500 / 200 / 100 |
| Regression record file | 16 MiB |
| Snapshot file | 64 MiB (`snapshots.maxBytes`) |
| Automatic exit/error snapshots | Newest 10 (`snapshots.autoKeep`) |
| Saved runs, baselines and comparisons | Never pruned automatically |
| Manual and imported snapshots | Never pruned automatically |
| Live dashboard clients | 50 |

When a buffer is full, the oldest events are dropped. Drops are counted and
reported by `/api/health`, `stacknext status` and the dashboard settings page.
The collector rejects malformed payloads, wrong content types, oversized
bodies and unauthenticated requests.

## What never leaves the machine

StackNext does not send telemetry to any external service. The only network
calls the SDK makes are to the loopback collector URL supplied by
`stacknext dev`. The Playwright fixture talks only to the loopback collector.
Regression records and snapshots are written to local disk and are never
uploaded by StackNext. The Next.js application may still have its own monitoring
or telemetry; StackNext does not disable or reconfigure it. If another
OpenTelemetry provider is already registered, StackNext yields to it rather
than replacing it.
