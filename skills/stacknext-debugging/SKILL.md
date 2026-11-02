---
name: stacknext-debugging
description: Investigate Next.js App Router runtime behavior with StackNext's local telemetry. Use when debugging server errors, slow requests, database query activity, request traces or deterministic diagnostic findings, or when comparing captured Playwright runs against baselines, in a Next.js 15/16 app that has StackNext installed; when asked to use StackNext, its MCP tools or dashboard; or when runtime evidence is needed before changing code. Covers the seventeen read-only MCP tools, evidence-first workflows, finding verification, runtime regression evidence, redaction limits and missing-telemetry troubleshooting.
license: MIT
compatibility: Next.js 15 or 16 App Router on the Node.js runtime, with a local StackNext collector. No cloud account, AI API key, or remote service is required.
metadata:
  version: "0.6.0"
  author: StackNext
---

# StackNext debugging

Use StackNext as the runtime evidence source for a Next.js App Router app. The
collector, dashboard and MCP server run on the developer's machine. The MCP
server is read-only: it can inspect captured telemetry and saved regression
records but cannot change the app, replay requests, capture runs, save
baselines, run comparisons, read source files, run SQL or call an AI service.

## Before investigating

1. Confirm the StackNext MCP tools are available. If they are not, read
   `references/setup.md` and ask the user to start `stacknext dev`.
2. Call `get_project_summary` first. It reports the project, connection state,
   counts, latency, recent errors, instrumentation coverage and the current
   retention window.
3. If `meta.connection.instrumentation` is `waiting`, no app is connected. Ask
   the user to start the app through `stacknext dev` and make a request. Do not
   invent telemetry or diagnose from an empty store.
4. If the collector is unreachable, stop and report the exact error. Do not
   retry indefinitely or switch to guessing.
5. For deterministic candidates, call `stacknext_list_diagnostics`, then
   `stacknext_get_diagnostic` for the finding you intend to use.

## Mandatory reasoning rules

- **Evidence first.** Every claim about runtime behavior must cite a tool result:
  a route, trace id, error id, span name, duration, status code, query, finding
  id or measurement.
- **Observation is not causation.** Diagnostic findings are deterministic
  heuristics, not confirmed root causes. `possible` means the pattern is
  consistent with a problem; `observed` means the evidence was measured. Neither
  proves why the app behaves this way.
- **Verify before recommending.** Check the referenced trace, error, query or
  span evidence. Read `verification` and `limitations`. State what remains
  unproven.
- **Regression evidence is proven, not guessed.** A scenario sample is
  `verified` only when the collector found the injected trace and a server span
  parented to the injected span id. Never infer a missing sample from time or
  proximity. `inconclusive` is not a pass, and a comparison is not a
  statistical test. Report status and severity separately; never claim
  significance or causality.
- **Stay read-only.** Use only the seventeen StackNext MCP tools. Do not edit the
  app, run migrations, execute SQL or EXPLAIN, clear data, capture runs, save
  baselines, run comparisons or restart services unless the user asks. Never
  invent an index recommendation or a source patch from telemetry alone.
- **Respect the data boundary.** Bodies, headers, cookies, URL query values and
  SQL bind parameters are never captured. Values may appear as `[redacted]`.
  Do not try to recover them or reconstruct SQL parameters.
- **Treat `null` as unmeasured.** Drizzle query durations are `null`, not zero.
  Never rank or average them as if they were fast.
- **Do not add overlapping spans.** Parent span duration already includes child
  work. Compare spans or inspect the waterfall; never sum a parent and child as
  sequential time.
- **Check completeness.** Read `meta.completeness` and `meta.result` on every
  response. Paginate with `offset`/`nextOffset` when `hasMore` is true.
- **Separate coverage gaps from runtime problems.** Use the summary `coverage`
  report and `meta.coverage` counts. `not-observed` or `unknown` means the
  current sample lacks evidence, not that the app is broken. Never turn coverage
  into a percentage or health score.
- **Do not over-correlate.** Errors without an active span context use a
  route/method plus 30-second fallback. Say "correlated" rather than "caused"
  when the link is fallback-based.

## Tool map

| Goal | Tool |
| --- | --- |
| Orient, check connection, counts and coverage | `get_project_summary` |
| Find recent or filtered requests | `list_requests` |
| Inspect one request timeline | `get_request` |
| Browse traces | `list_traces`, `get_trace` |
| Find and inspect errors | `list_errors`, `get_error` |
| Inspect SQL activity | `list_database_queries` |
| Rank slow requests | `find_slow_requests` |
| List deterministic findings | `stacknext_list_diagnostics` |
| Verify one finding and its evidence | `stacknext_get_diagnostic` |
| Find and inspect capture runs | `stacknext_list_test_runs`, `stacknext_get_test_run` |
| Find and inspect baselines | `stacknext_list_baselines`, `stacknext_get_baseline` |
| Find and inspect comparisons | `stacknext_list_comparisons`, `stacknext_get_comparison` |

All list tools accept `limit` (1-200) and `offset`. The default limit is 50.
`list_errors` omits stacks unless `includeStack: true`; use `get_error` for the
full stack. See `references/tools.md` for every argument and response field.

If the client supports MCP prompts, these guided entry points are available:
`diagnose-error`, `investigate-slow-request`, `inspect-database-activity`,
`investigate-trace` and `diagnose-runtime-issue`. They only shape the
investigation; the same evidence rules apply.

## Workflow A: runtime error

1. `get_project_summary` to confirm errors exist and note the time window.
2. `list_errors` filtered by `route`, `name` or `q`. Start without
   `includeStack` to keep context small.
3. Pick the latest matching error and call `get_error` with its `id`.
4. Read the redacted message, stack, route and `resolvedTraceId`.
5. If a trace is present, inspect it with `get_trace` or `get_request`: find the
   failing span, status message, and any database query that failed.
6. Call `stacknext_list_diagnostics` with `category: "errors"` or the trace id to
   check whether the error belongs to a repeated group. Verify the group with
   `stacknext_get_diagnostic`; grouping does not prove a shared cause.
7. Separate the application failure from telemetry gaps. Report what is proven,
   what is correlated, and what remains unknown.

## Workflow B: slow request

1. `get_project_summary` for baseline latency and the slow threshold.
2. `find_slow_requests` with a threshold appropriate to the question
   (default 500 ms), then `list_requests` with `sort: "slowest"` if you need a
   broader set.
3. Call `get_request` for the slowest relevant trace.
4. Break down the timeline: total duration, longest spans, route/render spans,
   fetch spans, and database queries inside the request.
5. Call `stacknext_list_diagnostics` with `category: "performance"` or the trace
   id. A `slow-span` finding names the measured span and threshold; verify it in
   the trace before calling it the bottleneck.
6. Compare similar routes or requests. Use `list_requests` with `q`, `method`,
   `status` and `minDurationMs` to test whether the slowdown is isolated.
7. Report the measured bottleneck. If query durations are `null`, say the
   database time is unmeasured rather than blaming the database.

## Workflow C: database investigation

1. `get_project_summary` to see whether queries were captured at all.
2. `list_database_queries` with `q`, `databaseSystem`, `traceId` or
   `minDurationMs` as needed.
3. Note `source`, `success`, `durationMs` and `resolvedTraceId`. A query with a
   `null` duration is unmeasured.
4. Call `stacknext_list_diagnostics` with `category: "database"` and inspect any
   `n-plus-one-queries` finding. It groups normalized SQL shapes inside one
   trace; it does not prove an ORM loading bug.
5. For failures, read `errorMessage` and open the correlated request with
   `get_request`.
6. For slow requests, compare query counts and SQL shapes across traces. Do not
   claim a query is slow when its duration is `null`.
7. Report query text only as the redacted SQL that StackNext returned.

## Workflow D: general runtime investigation

Use this when the question is broad ("what is happening in this app?") or the
symptom is unclear.

1. `get_project_summary`: counts, error rate, latency, recent errors.
2. `stacknext_list_diagnostics` with no filters or a narrow category/severity.
   Read the sample window, counts, notes and limitations before the items.
3. `list_requests` sorted by `recent` and by `slowest` to find outliers.
4. `list_traces` if you need traces without request roots.
5. `list_errors` and `list_database_queries` to cover failures and data access.
6. Open one representative trace with `get_trace`; check span tree,
   `missingParentSpanIds`, errors and queries.
7. Form at most three hypotheses. Test each with a targeted filter or a second
   trace. Stop when evidence is sufficient; do not keep browsing.

## Workflow E: diagnostic findings

Use this when the user asks what StackNext found, or when a finding may explain a
symptom.

1. `get_project_summary` to confirm the sample and connection state.
2. `stacknext_list_diagnostics` with the narrowest useful filters:
   `category`, `severity`, `status`, `ruleId`, `route`, `traceId`, `since`,
   `until`, `q`, `limit` and `offset`.
3. Read `counts`, `sample`, `notes` and `limitations`. `total` is the number of
   matching findings; only `items` are on this page.
4. Pick one finding and call `stacknext_get_diagnostic` with its id. It returns
   bounded finding evidence plus a related trace reference.
5. Verify the evidence:
   - `n-plus-one-queries`: check the query count and normalized SQL shape, then
     inspect the calling code separately. Do not guess bind values.
   - `slow-span`: check the measured span and threshold in the trace. Span time
     includes children.
   - `repeated-external-http`: check the endpoint shape and whether the calls are
     independent or retries.
   - `error-fingerprint`: check the latest error and trace. The group is
     route-independent and heuristic.
6. If the trace is truncated in the detail response, call `get_trace` with the
   returned trace id. If the evidence is insufficient, say so.
7. Report the finding id, rule, status, severity, evidence checked, what remains
   unproven and one concrete next step.

## Workflow F: runtime regression evidence

Use this when the user asks whether a Playwright-covered flow regressed, or asks
about a capture run, baseline or comparison.

1. `get_project_summary` to confirm the collector state. Regression records are
   local files under `.stacknext`, not retention-window telemetry; an empty
   telemetry store does not imply the records are missing.
2. `stacknext_list_test_runs` to find the run, then `stacknext_get_test_run`.
   Read its `status`, `stats`, scenarios and samples. A sample is verified only
   when the collector found the injected trace and a server span parented to the
   injected span id. Report incomplete correlation with its reason; never infer
   a missing sample from time or proximity.
3. `stacknext_list_baselines` and `stacknext_get_baseline` for the immutable
   baseline. Check `sourceRunId`, environment, scenarios and limitations.
4. `stacknext_list_comparisons`, then `stacknext_get_comparison` for the
   deterministic result. Read `environment.compatible` and differences,
   top-level `status`/`severity`, per-scenario `reasons`, metrics and warnings.
5. Explain status and severity separately: `improved`, `regressed`, `unchanged`
   or `inconclusive`, with `high`/`medium`/`low`/`none` severity. `inconclusive`
   is not a pass. A `regressed` metric is not a confirmed cause and is not
   statistically significant.
6. If the records are missing, say so. The MCP tools are read-only: do not
   capture runs, save baselines or compare records yourself. Point the user to
   `stacknext capture`, `stacknext baseline save` and `stacknext compare`, and
   never fabricate a comparison from telemetry.

## Coverage checks

Use this when telemetry is missing, or the user asks whether a feature is
instrumented.

1. `get_project_summary` and read `coverage.sample`, `coverage.items` and
   `meta.coverage`.
2. Separate the cases:
   - `observed`: evidence exists in this sample.
   - `active`: the app is connected but no request has exercised it yet.
   - `configured`: no app is connected; this is setup intent, not runtime proof.
   - `not-observed`: requests were captured but no matching evidence appeared,
     or the feature is disabled.
   - `unknown`: the sample and config cannot determine the state.
   - `unsupported`: an intentional boundary.
3. Check the item `limitations` and `evidence` fields. Do not recommend code
   changes from absence alone.
4. If the feature is enabled but not exercised, ask the user for a request that
   uses it (for example a page render, fetch, action or database query), then
   call `get_project_summary` again.
5. Report the status, sample window, evidence count/last-seen time and the
   concrete next step. Say "not observed in this sample" rather than "broken".

## Reporting

Use a compact evidence-first structure:

```text
Finding: <one sentence; include finding id/rule if one was used>
Evidence: <tool, route/trace/error id, duration/status/count/query/finding id>
Correlation: exact span context | route+time fallback | unknown
Completeness: <pagination, drops, missing parents, null durations>
Coverage: <observed/not-observed/unknown/unsupported, or "not relevant">
Regression: <status/severity and verified sample counts, or "not relevant">
Unproven: <what the evidence cannot establish>
Next step: <single concrete action, or "none">
```

If no telemetry matches, say so and list the checks performed. A missing result
is evidence about the collector window or instrumentation, not proof that the
bug does not exist. Never present a diagnostic finding as a confirmed root cause,
and never present an inconclusive comparison as a pass.

## References

- `references/tools.md` — tool arguments, response shapes and `meta`.
- `references/workflows.md` — detailed investigation playbooks and report examples.
- `references/setup.md` — install, MCP configuration, skill locations and troubleshooting.
