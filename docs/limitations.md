# Limitations

NextScope 0.1 is a local development tool, not a production APM. These are
intentional boundaries, not claims of completeness.

## Runtime and framework

- **Node.js runtime only.** Edge runtime and middleware running on Edge are not
  supported.
- **Next.js 15 and 16, App Router only.** The Pages Router is not supported.
  The repository's runtime verification used Next.js 16.4.3. Run
  `nextscope doctor` to confirm the local Next.js version and App Router
  directory.
- **Development use only.** There is no authentication for multiple users, no
  TLS, no persistence, no clustering and no production hardening story. Do not
  expose the collector or dashboard to a network.
- **No browser/client tracing.** NextScope sees server-side Next.js spans and
  database events. Client-side React renders and browser performance are out of
  scope.
- **No automatic source maps.** Error stacks point at the server build output;
  NextScope does not apply source maps from your build.
- **No replay, profiling or heap inspection.** Requests cannot be replayed and
  bodies are never captured.

## Trace coverage

- Span coverage is limited to what Next.js emits through supported
  OpenTelemetry hooks. NextScope does not patch undocumented internals.
- Server Components are not traced individually. Route/render spans from Next.js
  are captured instead.
- Server Actions are not automatically identified by name.
- Fetch spans depend on Next.js instrumentation and are filtered when
  `instrumentation.captureFetch` is `false`.
- A trace is only as complete as the spans Next.js sends. Spans that arrive
  after retention or after a process restart may be missing; missing parents are
  reported instead of silently repaired.
- Error correlation uses the active span when Next.js provides one. Otherwise
  it falls back to route/method plus a 30-second timestamp window; ambiguous
  matches may link to the wrong request or remain uncorrelated.

## Databases

- **Drizzle Logger does not expose query duration.** Duration is `null`, and
  the UI/MCP explicitly mark it as unmeasured. Do not compare Drizzle query
  durations with Prisma durations.
- **Drizzle parameters are counted, not captured.** This is intentional.
- **Prisma requires event-based query logging.** Use
  `log: [{ emit: 'event', level: 'query' }]` and call
  `instrumentPrismaClient(prisma)`. Without it, no query events arrive.
- Prisma durations come from Prisma's `query` event and reflect its reported
  duration, not a NextScope timer.
- Query text is redacted, but literal secrets embedded directly in SQL could
  survive if they do not match a known pattern. Use bind parameters.
- Database coverage is per adapter registration. NextScope does not infer which
  ORM you use at runtime.

## Storage and scale

- Telemetry is **in memory only** and disappears when `nextscope dev` exits.
  `export` is the only persistence path.
- The store is bounded. When full, the oldest spans/errors/queries are dropped.
  Drops are counted but not recoverable.
- The default retention is 10 minutes; older data is pruned even if capacity is
  available.
- There is no sampling UI or tail-based sampling. The transport and collector
  accept all spans that reach them until their bounds are hit.
- Ingest payloads are capped at 2 MiB, with 500 spans, 25 errors and 100 queries
  per envelope. The SDK batches within these limits, but custom producers can
  exceed them.
- SSE is intended for one local dashboard. More than 50 concurrent streams are
  rejected.
- Only one NextScope collector/runtime state is supported per app directory.
  Running `nextscope dev` twice for the same project is rejected while the first
  process is alive.
- Port fallback tries up to 25 ports after the configured one. If all are busy,
  startup fails.

## Privacy and security

- Redaction is pattern-based and best effort. It is not a formal data-loss
  prevention system. Review exports before sharing them.
- The bearer token is stored in `.nextscope/run.json` with mode `0600`. Any
  process/agent that can read your user's files can read it. The token is
  regenerated on each `nextscope dev` unless `--token` is supplied.
- The collector uses plain HTTP over loopback, not HTTPS. Host/Origin/Sec-Fetch
  checks and a CSP reduce browser-based attacks but are not a substitute for
  running on a trusted machine.
- MCP data is available to whichever client you connect. That client may log or
  transmit tool results according to its own policy; NextScope does not control
  the client.
- The dashboard's session cookie is `HttpOnly` and `SameSite=Strict` but is not
  marked `Secure` because the local collector uses HTTP.

## Operations

- The dashboard is a static build. A source change in `packages/dashboard`
  requires `pnpm --filter @nextscope/dashboard build` before the collector will
  serve it.
- The CLI requires a `dev` script in `package.json`. Custom start commands that
  do not start Next.js will not produce Next.js spans.
- `status`, `doctor`, `export` and `mcp` use `.nextscope/run.json`. If that file
  is stale, remove it and restart. They will not guess a collector that was
  started manually.
- There is no automatic update mechanism, cloud account, hosted dashboard or
  team sync.
