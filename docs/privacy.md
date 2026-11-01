# Privacy and redaction

NextScope is designed around a strict local-first boundary. Telemetry is
produced by your app, sent over loopback to the collector on this machine, and
kept in memory. There is no cloud service, account, analytics endpoint or
outbound ingestion.

## What is collected

| Data | Captured? | Notes |
| --- | --- | --- |
| Span names, kinds, timing, status | Yes | OpenTelemetry spans from Next.js and NextScope adapters. |
| Route, HTTP method, status code | Yes | Paths are kept; query values and fragments are removed. |
| Span attributes | Redacted yes | Sensitive keys and headers are replaced. |
| Request headers and cookies | **No** | The SDK never reads or transmits header values. |
| Request/response bodies | **No** | Configuration refuses to enable body capture. |
| URL query values | **No** | Query strings and fragments are stripped. |
| SQL text | Redacted yes | Bind parameters are never read. |
| SQL bind parameters | **No** | Drizzle counts them; Prisma's `params` is never read. |
| Error messages, names, stacks, digests | Redacted yes | Useful context is kept; secret patterns are replaced. |
| Service name, version, runtime | Yes | Used to identify the connected app instance. |
| Machine/user identifiers | **No** | Not collected by NextScope. |

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
  strings in stack URLs are removed.
- **Resource attributes**: only a small allowlist is retained (service name,
  version, namespace, SDK metadata, runtime, Next.js version and environment).

Redaction is pattern-based and intentionally conservative, not a formal secret
scanner. If an application embeds an unrecognized secret as a literal in a SQL
string, a URL path segment or an error message, it may still be stored. Keep
credentials out of those places, and review an export before sharing it.

## Local network boundary

- The collector and dashboard share one HTTP server bound to **`127.0.0.1`** or
  `localhost` only. Startup rejects any other host.
- Ingestion requires an `Authorization: Bearer <token>` header. The token is
  generated with 32 random bytes by `nextscope dev` and stored in
  `.nextscope/run.json` with mode `0600`. Plain HTTP is used because traffic
  never leaves the loopback interface.
- Read APIs and the SSE stream require either that bearer token or an
  `HttpOnly`, `SameSite=Strict` session cookie issued when the dashboard HTML is
  loaded. Sessions expire after 24 hours and are capped at 100.
- Requests with a non-loopback `Host` header are rejected. Cross-origin requests
  and `Sec-Fetch-Site: cross-site` requests are rejected.
- The dashboard sends a restrictive CSP (`default-src 'self'`), `nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and no CORS headers.
- The MCP server's API client refuses collector URLs that are not loopback.
- `nextscope export` writes with mode `0600`; the data is redacted, but it is
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
| Live dashboard clients | 50 |

When a buffer is full, the oldest events are dropped. Drops are counted and
reported by `/api/health`, `nextscope status` and the dashboard settings page.
The collector rejects malformed payloads, wrong content types, oversized
bodies and unauthenticated requests.

## What never leaves the machine

NextScope does not send telemetry to any external service. The only network
calls the SDK makes are to the loopback collector URL supplied by
`nextscope dev`. The Next.js application may still have its own monitoring or
telemetry; NextScope does not disable or reconfigure it. If another
OpenTelemetry provider is already registered, NextScope yields to it rather
than replacing it.
