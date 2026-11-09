---
title: Limitations
description: Intentional boundaries of StackNext telemetry, diagnostics and regression evidence.
---

StackNext 0.6 is a local development tool, not a production APM. These are
intentional boundaries, not claims of completeness.

## Runtime and framework

- **Node.js runtime only.** Edge runtime and middleware running on Edge are not
  supported.
- **Next.js 15 and 16, App Router only.** The Pages Router is not supported.
  The repository's runtime verification used Next.js 16.4.3. Run
  `stacknext doctor` to confirm the local Next.js version and App Router
  directory.
- **Development use only.** There is no authentication for multiple users, no
  TLS, no clustering and no production hardening story. Live telemetry is not
  persisted, but explicit regression records and snapshots are local files. Do
  not expose the collector or dashboard to a network.
- **No browser/client tracing.** StackNext sees server-side Next.js spans and
  database events. Client-side React renders and browser performance are out of
  scope.
- **No automatic source maps.** Error stacks point at the server build output;
  StackNext does not apply source maps from your build.
- **No replay, profiling or heap inspection.** Requests cannot be replayed and
  bodies are never captured.
- **OpenTelemetry SDK packages are retained on the 2.x line.** Upstream marks
  `@opentelemetry/sdk-trace-base@2.12.0` and
  `@opentelemetry/sdk-trace-node@2.12.0` as deprecated in favor of
  `@opentelemetry/sdk-trace@3.0.0`. StackNext 0.6 keeps 2.12.0 because SDK 3
  requires Node.js 22.15 or newer, while StackNext still declares Node.js
  20.9 support. This is a packaging limitation, not a known runtime defect; a
  future major can migrate when the Node.js 20 floor is raised.

## Trace coverage

- Span coverage is limited to what Next.js emits through supported
  OpenTelemetry hooks. StackNext does not patch undocumented internals and does
  not use `NEXT_PRIVATE_*` settings.
- Server Components are not traced individually. Route/render spans from
  Next.js are captured instead. You can wrap a specific component with
  `withStackNextSpan`, but that measures only the work you wrap.
- Server Actions are not automatically identified by name. Failures may appear
  through `onRequestError`; successful actions are visible only when wrapped
  with `withStackNextAction`.
- Custom application spans exist only where `withStackNextSpan` or
  `withStackNextSpanSync` is used. StackNext does not infer application
  functions or database drivers automatically.
- Fetch spans depend on Next.js instrumentation and are filtered when
  `instrumentation.captureFetch` is `false`.
- `NEXT_OTEL_VERBOSE=1` adds documented Next.js span types, but it still does
  not expose per-component or per-action names. It increases span volume and
  dev-server work; see the [benchmark](benchmark.md#verbose-tracing-overhead).
- A trace is only as complete as the spans Next.js sends. Spans that arrive
  after retention or after a process restart may be missing; missing parents are
  reported instead of silently repaired.
- Error correlation uses the active span when Next.js provides one. Otherwise
  it falls back to route/method plus a 30-second timestamp window; ambiguous
  matches may link to the wrong request or remain uncorrelated.
- Span categories in the explorer are labels, not a claim that durations can be
  added together. Parent spans already contain their children and many spans
  overlap in time.

## Instrumentation coverage

- Coverage is computed from the **current in-memory retention window**, not a
  historical database or a build-time analysis. Restarting the collector or
  waiting for retention to prune data changes the result.
- Coverage has no percentage or composite score. Features are independent and
  workload-dependent; a single number would be misleading.
- `observed` proves that matching evidence was present in the sample.
  `not-observed` and `unknown` do **not** prove that a feature is broken. The
  sample may not have exercised it, the app may not be connected, or the
  configuration may not describe adapter registration.
- `configured` is based on `stacknext.config.json` and collector connection
  state. It is not proof that adapter code ran.
- Configuration flags are intent only. `database.drizzle: true` does not register
  the Drizzle logger, and `database.prisma: true` does not attach the Prisma
  event handler.
- Coverage evidence is redacted telemetry. It cannot show whether a request
  actually carried a query value, header or body that StackNext intentionally
  dropped.
- Verbose span evidence is labelled from the standard allowlist. Unknown or
  future Next.js span types are retained as verbose/internal evidence rather
  than mapped to a guessed feature.
- The catalog can change between StackNext releases as supported Next.js span
  types change. Treat the current item list and limitations as part of the
  result.

## Diagnostics

- **Findings are heuristics, not confirmed root causes.** The engine implements
  six conservative rules over the current sample. `possible` means the pattern
  is consistent with a problem; `observed` means the measurement exists. Neither
  proves why the app behaves that way.
- **The current sample is the whole input.** Diagnostics analyze the in-memory
  retention window, not a historical database. Findings can appear, disappear or
  change as telemetry ages out or new requests arrive.
- **The report is capped.** `diagnostics.maxFindings` defaults to 100. Evidence
  arrays are bounded. A capped report is not a complete inventory of every
  pattern in the sample.
- **N+1 is a SQL-shape signal.** Repeated normalized queries in one trace are
  consistent with an N+1 pattern, but StackNext cannot see the calling code,
  prove a loop, or recover bind parameters. Findings aggregate across traces by
  canonical route; a batched query can still repeat for unrelated reasons.
- **Slow requests and slow spans are different signals.** Request duration is
  measured from the request root. Slow-span findings use self time and are
  suppressed when the request already exceeds `slowRequestMs`, so a slow child
  can be attributed inside a slow request rather than double-reporting it. Self
  time is approximate when clocks disagree or child intervals overlap.
- **Slow-span thresholds are category-specific.** A span can be slow because of
  child work, queueing, a cold start or the measured operation itself. Parent
  duration already includes children; never add overlapping spans. Framework
  spans use their own threshold and are evidence of Next.js work, not a root
  cause.
- **Detached traces are excluded.** Request-level rules need an attributable
  request root. Spans without one, and spans whose parent is missing, are noted
  in sample integrity metadata instead of being guessed into a request.
- **Repeated HTTP is endpoint-shape based.** Query values, fragments and
  credentials are removed, and id-like path segments are normalized. StackNext
  cannot tell an intentional retry from independent calls or a missing cache.
  Findings aggregate across traces by canonical route.
- **Error grouping is route-aware and heuristic.** The normalized error
  signature is route-independent, but findings group by canonical route so the
  same failure in different routes stays separate. The same message and stack
  shape can still merge different causes; different shapes can split one cause.
  Next.js not-found and redirect control-flow errors are excluded. Read the
  latest error, its Next.js context and the deepest error span before acting.
- **A 5xx status is not a root cause.** `server-error-response` only reports that
  the request root returned 5xx without a correlated non-control-flow error. The
  app may have returned the status intentionally, the error hook may not have
  run, or the error record may have aged out.
- **No source or SQL execution.** StackNext cannot read source files, run SQL or
  EXPLAIN, inspect indexes, replay requests or apply a fix. It does not provide
  index advice or automatic source edits.
- **No AI or hosted inference.** Diagnostics are deterministic local code. There
  is no LLM provider, AI API key, alerting, long-term anomaly detection or APM
  replacement.
- **Diagnostic ids are not credentials.** A `diag-` id identifies a finding in
  the current sample and can disappear when the underlying evidence ages out.

## Runtime regression testing

- **Playwright is the only supported scenario runner.** The regression fixture
  is optional and only active inside `stacknext capture`. Running
  `playwright test` directly does not capture or compare anything.
- **Captured runs require one worker.** Correlation has been verified with
  sequential Playwright workers. Parallel workers are not supported for captured
  runs until parallel correlation is explicitly documented and tested.
- **Correlation is exact or incomplete.** A sample is verified only when the
  collector finds the injected trace and a server span parented to the injected
  span id. There is no time-window, nearest-request or synthetic fallback. An
  incomplete sample makes the affected comparison inconclusive.
- **Scenario identity depends on annotations or stable test ids.** The explicit
  `stacknext*` annotation is preferred. Changing it creates a new scenario with
  no baseline. File/title/project is the last fallback and is less stable than an
  annotation.
- **A comparison needs enough verified samples.** The default minimum is three
  per side. A failed, skipped, timedOut or interrupted sample without verified
  telemetry is incomplete and blocks a verdict.
- **Comparisons are deterministic heuristics, not statistics.** Medians and
  explicit thresholds classify `improved`, `regressed`, `unchanged` or
  `inconclusive`. StackNext does not compute p-values, confidence intervals,
  effect sizes or statistical significance, and it does not prove causality.
- **`unchanged` is not proof of no change.** It means no configured metric
  threshold was crossed in this sample. `improved` is not automatically good:
  fewer spans or queries can mean missing instrumentation or skipped work.
- **Environment mismatches are inconclusive by default.** Node.js, Next.js,
  platform, architecture, runtime, database adapters, instrumentation flags, SDK
  and Playwright versions are recorded. `--ignore-environment` computes a result
  with a warning but does not make the environments equivalent.
- **Null durations stay unmeasured.** Drizzle query durations are `null`, never
  zero. A query-duration metric with null evidence is reported as inconclusive
  and `unmeasured`; it does not become an improvement or regression.
- **Structural changes are conservative.** A changed trace key set, variable
  trace shape within one side, or a changed span shape normally makes the
  scenario inconclusive. A regression metric can still be reported, but the
  shape change remains in the reasons.
- **Comparison evidence is bounded.** Up to 50 trace keys, 200 span keys, 100
  query keys, 100 finding keys and 1,000 metrics are compared per scenario.
  Samples, traces, spans, queries and errors are also capped when captured.
- **Report-only by default.** `compare` succeeds unless `--fail-on regression`,
  `--fail-on inconclusive` or `--fail-on any` matches. A capture whose child
  succeeds but whose telemetry is incomplete exits **3**; the child's own exit
  code and signal are preserved otherwise.
- **No browser artifacts.** StackNext does not read or store screenshots, video
  or Playwright trace archives. The fixture records the scenario result,
  duration, retry/repeat index and correlated server telemetry only.
- **Regression records are manual-retention files.** They are stored under
  `.stacknext`, survive collector restarts, are never uploaded and are never
  pruned automatically. Baselines and comparisons accumulate until explicitly
  removed or deleted by the user.
- **Baselines are portable only across matching environments.** A baseline
  captured on another OS, Node.js, Next.js, Playwright or instrumentation setup
  is not a valid reference. CI must restore or capture a baseline on a
  compatible runner.
- **No source, SQL or causal analysis.** StackNext cannot prove an ORM loop,
  see query bind values, read source files, run EXPLAIN or recommend an index
  from a comparison. It reports measured telemetry and configured thresholds.

## Saved snapshots

- **A snapshot is a frozen copy, not live state.** It captures the sample at the
  save time and never updates. Do not describe a snapshot finding as current app
  behavior without checking the live sample.
- **No diagnostics or coverage.** Snapshots intentionally exclude both because
  they describe the live sample. Scoped snapshot trace detail has no diagnostic
  references. Re-run diagnostics against the live sample if needed.
- **Automatic snapshots are best effort.** Exit snapshots require a graceful
  shutdown and a non-empty sample. Error snapshots fire on the first error and
  then respect a 60-second cooldown. A crash, `SIGKILL` or full disk can skip a
  save.
- **Rotation only affects automatic snapshots.** `snapshots.autoKeep` defaults
  to 10 and applies to `exit`/`error` snapshots. Manual and imported snapshots
  accumulate until explicitly deleted.
- **Oversized snapshots fail.** Each snapshot is capped at 64 MiB
  (`snapshots.maxBytes`). StackNext does not truncate a snapshot silently; reduce
  the live sample or export it instead.
- **Import is not a trust boundary bypass.** Imported exports are re-normalized
  and re-redacted, and must match the versioned export schema. Unknown formats,
  malformed JSON and records over the size cap are rejected.
- **Snapshots are local files.** They contain redacted routes, error text, SQL
  fragments, span attributes and timings. Review them before sharing, just like
  an export. They are never uploaded by StackNext.
- **The snapshot cache is small and read-only.** The collector keeps at most
  three detached views, invalidated by file `mtimeMs`. Editing or replacing a
  snapshot file outside StackNext is unsupported.

## Databases

- **Drizzle Logger does not expose query duration.** Duration is `null`, and
  the UI/MCP explicitly mark it as unmeasured. Do not compare Drizzle query
  durations with Prisma durations.
- **Drizzle parameters are counted, not captured.** This is intentional.
- **Prisma requires event-based query logging.** Use
  `log: [{ emit: 'event', level: 'query' }]` and call
  `instrumentPrismaClient(prisma)`. Without it, no query events arrive.
- Prisma durations come from Prisma's `query` event and reflect its reported
  duration, not a StackNext timer.
- Query text is redacted, but literal secrets embedded directly in SQL could
  survive if they do not match a known pattern. Use bind parameters.
- Database coverage is per adapter registration. StackNext does not infer which
  ORM you use at runtime.

## Storage and scale

- Telemetry is **in memory only** and disappears when `stacknext dev` exits.
  `export` and saved snapshots are the persistence paths for the live telemetry
  sample.
- Capture runs, baselines and comparisons are explicit JSON records under
  `.stacknext/{runs,baselines,comparisons}`. They persist across collector
  restarts, are never uploaded and are not pruned automatically. Baseline
  removal is explicit; comparisons have no CLI delete.
- Snapshots are explicit JSON records under `.stacknext/snapshots`. They persist
  across collector restarts, are never uploaded, and automatic exit/error
  snapshots keep the newest `snapshots.autoKeep` (default 10). Manual and
  imported snapshots are never pruned automatically.
- Regression records are capped at 16 MiB each and snapshots at 64 MiB each.
  Both use strict versioned schemas. A malformed or oversized record is rejected
  rather than repaired.
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
- Only one StackNext collector/runtime state is supported per app directory.
  Running `stacknext dev` twice for the same project is rejected while the first
  process is alive.
- Port fallback tries up to 25 ports after the configured one. If all are busy,
  startup fails.

## Privacy and security

- Redaction is pattern-based and best effort. It is not a formal data-loss
  prevention system. Review exports and snapshots before sharing them.
- The bearer token is stored in `.stacknext/run.json` with mode `0600`. Any
  process/agent that can read your user's files can read it. The token is
  regenerated on each `stacknext dev` unless `--token` is supplied.
- The collector uses plain HTTP over loopback, not HTTPS. Host/Origin/Sec-Fetch
  checks and a CSP reduce browser-based attacks but are not a substitute for
  running on a trusted machine.
- MCP data is available to whichever client you connect. That client may log or
  transmit tool results according to its own policy; StackNext does not control
  the client.
- The dashboard's session cookie is `HttpOnly` and `SameSite=Strict` but is not
  marked `Secure` because the local collector uses HTTP.

## Coding agents

- **Client support varies.** MCP prompts, structured content, output schemas and
  Agent Skills are optional protocol/client features. A client may connect and
  call tools without showing prompts or loading the skill. The server keeps JSON
  text content for compatibility.
- **A connected server is not a successful investigation.** The model can still
  ignore tools, overstate a fallback correlation, or misread a `null` duration.
  The skill and server instructions reduce this risk but cannot guarantee
  behavior.
- **Skill discovery is client-specific.** OpenCode, Codex and Claude Code use
  different project directories. Installing the skill does not configure MCP and
  configuring MCP does not install the skill.
- **No AI key or hosted model is bundled.** StackNext does not call a model. The
  chosen client may require its own account or subscription, and its retention
  and logging policies apply to tool results.
- **Compatibility is tested, not universal.** The versions and scenarios in
  [agent-testing.md](agent-testing.md) are a point-in-time record. Check current
  client documentation before relying on a feature.
- **Prompt arguments are templates.** They do not fetch data by themselves; the
  agent must still call the tools. A prompt cannot bypass the read-only,
  loopback-only or redaction boundaries.

## Operations

- The dashboard is a static build. A source change in `packages/dashboard`
  requires `pnpm --filter @stacknext/dashboard build` before the collector will
  serve it.
- The CLI requires a `dev` script in `package.json`. Custom start commands that
  do not start Next.js will not produce Next.js spans.
- `status`, `doctor`, `coverage`, `diagnose`, `export`, `capture`, `snapshot`
  and `mcp` use `.stacknext/run.json` when attaching to a live runtime. If that
  file is stale, remove it and restart. `runs`, `baseline`, `compare` and
  snapshot list/show/export/import/delete read or write the saved records under
  `.stacknext` and do not need a live collector. `snapshot save` does need one.
- Captured Playwright runs need a Playwright browser installed
  (`pnpm exec playwright install chromium`). CI images often ship without one.
- A capture attaches to `stacknext dev` when it is running, otherwise it starts
  an ephemeral loopback collector. `--attach` refuses the ephemeral fallback.
  Use `--url` and `--token` only with a loopback collector you control.
- Regression records are only as good as the scenario set. Removing a route,
  changing an annotation or changing the trace shape can make a comparison
  inconclusive or create a scenario with no baseline.
- Manual span and action helpers depend on an OpenTelemetry provider. If the app
  does not call `registerStackNext()` and has no other provider, the helpers are
  no-ops rather than a second tracing system.
- Verbose tracing measurements are machine- and workload-specific. Use the
  benchmark as a directional check, not a guarantee for your app.
- There is no automatic update mechanism, cloud account, hosted dashboard or
  team sync.
