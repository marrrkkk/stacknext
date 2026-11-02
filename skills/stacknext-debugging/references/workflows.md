# Investigation workflows

These playbooks assume the StackNext MCP server is connected and the collector
has data. Always start with `get_project_summary` and stop when the evidence
answers the user's question. Prefer two or three targeted calls over browsing
every tool.

## Mandatory reasoning rules

- Cite a tool result for every runtime claim: route, trace/error/query/finding
  id, span, duration, status or count.
- A diagnostic finding is a hypothesis. `possible` is not proof and `observed`
  is not a root cause. Verify the referenced evidence before recommending work.
- Never sum parent and child spans; parent duration includes child work.
- `null` query duration is unmeasured, never zero.
- A regression sample is verified only by the injected trace plus a parented
  server span. Never infer a missing sample from time or proximity. An
  `inconclusive` comparison is not a pass, and a result is not statistically
  significant.
- Do not invent source changes, index recommendations, EXPLAIN output or bind
  parameters. StackNext cannot read source or execute SQL.
- Read `meta.completeness`, `meta.result`, coverage sample and finding
  limitations. Absence of evidence is not evidence that a feature is broken.

## Workflow A: runtime error

**Question:** Why did this route fail, and where in the request did it happen?

1. `get_project_summary`
   - Confirm `summary.errorCount > 0`.
   - Note `firstEventTime`/`lastEventTime` so you do not search outside the
     retention window.
2. `list_errors` with the narrowest filter you have:
   - known route: `{ "route": "/api/error" }`
   - known error name: `{ "name": "Error" }`
   - free text: `{ "q": "database is locked" }`
3. Pick the most recent relevant error and call `get_error` with its `id`.
   Read:
   - `error.message` and `error.stack` (already redacted)
   - `error.route`, `error.method`, `error.requestPath`
   - `error.resolvedTraceId`
4. If `resolvedTraceId` exists, call `get_trace`:
   - Find spans with `status: "error"` and read `statusMessage`.
   - Check whether a database query in the same trace has `success: false`.
   - Check `missingParentSpanIds` before claiming the timeline is complete.
5. If the error is uncorrelated, say so. Use the error timestamp and route to
   find nearby requests with `list_requests`, but label that as a time-based
   inference, not an exact correlation.

**Evidence to report:** error id, message, route, stack frame, failing span or
query, trace id, and whether the correlation was exact or fallback.

**Do not:** paste an entire stack when one frame explains the failure; call
`get_error` repeatedly for the same id; claim a root cause from a message alone.

## Workflow B: slow request

**Question:** Which request is slow, and what consumed the time?

1. `get_project_summary`
   - Record `summary.p95DurationMs`, `summary.avgDurationMs`, and the slow
     threshold configured for the project.
2. `find_slow_requests` with `{ "minDurationMs": 500, "limit": 10 }` (adjust the
   threshold to the user's definition of slow).
3. Choose the request that matches the reported route or the worst duration and
   call `get_request`.
4. Build a time budget from the trace:
   - `durationMs` is the request total.
   - Sort spans by `durationMs`; inspect the top three.
   - Identify route/render spans, fetch spans and database queries.
   - Check for gaps between parent and child spans. A gap can indicate work that
     Next.js did not instrument; say that instead of inventing a cause.
5. Test whether the pattern repeats:
   - `list_requests` with `{ "q": "/api/slow", "sort": "slowest" }`
   - or `{ "method": "GET", "minDurationMs": 300 }`
6. If database queries are inside the trace, read their `durationMs`. If they
   are `null` (Drizzle), report database time as unmeasured.

**Evidence to report:** trace id, total duration, longest span name and duration,
query count, whether the slowdown is isolated or repeated, and any unmeasured
regions.

**Do not:** add span durations together as if they were sequential; a parent span
already contains its children. Compare self time or use the waterfall order.

## Workflow C: database investigation

**Question:** What SQL ran, did it fail, and which request did it belong to?

1. `get_project_summary`
   - Confirm `summary.databaseQueryCount > 0`. If zero, check that the adapter is
     registered and that the app is connected.
2. `list_database_queries` with one of:
   - `{ "traceId": "<32 hex>" }` for a known request
   - `{ "q": "orders" }` for a table or SQL fragment
   - `{ "databaseSystem": "sqlite" }` for one adapter
   - `{ "minDurationMs": 100 }` when durations are measured
3. Inspect `success`, `errorMessage`, `source`, `operation` and
   `resolvedTraceId`. Remember:
   - Drizzle durations are always `null`.
   - Prisma durations are reported by Prisma, not measured by StackNext.
   - SQL bind parameters are never captured.
4. For a failed query, call `get_request` on `resolvedTraceId` and inspect the
   surrounding spans.
5. For a suspected N+1 pattern, compare query counts across several similar
   requests with `list_requests`, then open the worst trace.

**Evidence to report:** redacted SQL shape, source, success state, measured
duration or `null`, trace id, and the route.

**Do not:** compare Drizzle and Prisma durations; claim a query is slow when its
duration is `null`; attempt to reconstruct bind parameters.

## Workflow D: general runtime investigation

**Question:** What is happening in this app right now?

1. `get_project_summary`
   - Read counts, failed/slow request counts, p95, recent errors and the event
     time range.
   - Read `coverage` and `meta.coverage`: note `not-observed`, `unknown` and
     `unsupported` items before assuming a runtime problem.
2. `list_requests` with `{ "sort": "recent", "limit": 20 }`.
3. `list_requests` with `{ "sort": "slowest", "limit": 10 }`.
4. `list_errors` with `{ "limit": 10 }`.
5. `list_database_queries` with `{ "limit": 10 }`.
6. Pick one representative request or trace and call `get_request`/`get_trace`.
7. Summarize at most three findings, each with evidence. If everything is
   healthy, say so and cite the counts and latency.

**Stop condition:** you can answer the user's question with named routes,
identifiers and measurements. Do not keep listing after that.

## Workflow E: diagnostic findings

**Question:** What deterministic problems does StackNext see in this sample, and
which one is supported by evidence?

1. `get_project_summary`
   - Confirm the app is connected and note the retention window.
   - Read `summary.errorCount`, `slowRequests` and `coverage`.
2. `stacknext_list_diagnostics`
   - Start broad, then narrow with `category`, `severity`, `status`, `ruleId`,
     `route`, `traceId`, `since`, `until` or `q`.
   - Read `total`, `counts`, `sample`, `notes` and `limitations`.
3. Select one finding and call `stacknext_get_diagnostic` with its id.
   - Read `finding.status`, `severity`, `fingerprint`, `evidence`,
     `verification` and `limitations`.
   - Note the related `trace.traceId` and whether the trace is bounded.
4. Verify by rule:
   - **n-plus-one-queries:** count matching queries and inspect the normalized
     SQL shape. Confirm whether the count tracks a list size. StackNext cannot
     prove the calling code is a loop.
   - **slow-span:** inspect the span and threshold in the trace. Check children,
     queueing and cold starts. Do not add overlapping spans.
   - **repeated-external-http:** inspect the endpoint shape. Determine whether
     calls are independent, retries or a missing cache; query values are absent.
   - **error-fingerprint:** inspect the latest error and trace. Grouping is
     route-independent and can merge different causes.
5. If the related trace is truncated, call `get_trace` for the full tree. If the
   finding has no trace, say the evidence aged out or was never correlated.
6. Report the finding id/rule/status, the evidence checked, what remains
   unproven and one concrete next step. Do not call the finding a root cause.

**Stop condition:** one verified finding, or an explicit statement that the
sample has no finding that explains the symptom.

## Workflow F: runtime regression evidence

**Question:** Did a Playwright-covered flow improve, regress, stay unchanged or
remain inconclusive compared with its baseline?

1. `get_project_summary`
   - Confirm the collector state and project name.
   - Remember that regression records are local files under `.stacknext`, not
     retention-window telemetry. An empty telemetry store is not evidence that
     they are missing.
2. `stacknext_list_test_runs` with `{ "limit": 10 }`
   - Identify the candidate run by name, project, time and `status`.
   - Use `stacknext_get_test_run` for the chosen `runId`.
3. Read the run evidence:
   - `status` must be `completed` for a normal candidate; any other status makes
     the comparison inconclusive.
   - `stats.verifiedSamples` versus `stats.incompleteSamples`.
   - Each sample's `correlation.status` and `reasons`. A sample is verified only
     when the collector found the injected trace and a server span parented to
     the injected span id.
   - `warnings`, `notes` and `limitations`, especially collector disconnects,
     capped evidence and cold route-module spans.
4. `stacknext_list_baselines` and `stacknext_get_baseline`
   - Confirm `sourceRunId` and that the baseline contains the same
     `scenarioId` values. An annotation change creates a new scenario with no
     baseline.
5. `stacknext_list_comparisons` and `stacknext_get_comparison`
   - Read `environment.compatible` and `environment.differences` first.
   - Read top-level `status` and `severity`, then `summary`, then each scenario's
     `status`, `severity` and `reasons`.
   - Inspect regressed or inconclusive metrics: `baselineValue`,
     `candidateValue`, `delta`, `percent`, `sampleCount`, `note` and
     `unmeasured`.
   - Check both sides' sample counts. Fewer than `minSamples` verified samples
     or any incomplete sample blocks a verdict.
6. Explain the result:
   - `regressed` means the measured median crossed the configured threshold in
     this sample. It does not identify the cause.
   - `improved` is not automatically a success; confirm the behavior is still
     present and instrumented.
   - `unchanged` means no configured threshold was crossed in this sample, not
     that nothing changed.
   - `inconclusive` means fix the evidence (environment, samples, warm-up,
     correlation), not the app.
   - Never call a result statistically significant. Severity is separate from
     status.
7. If no record exists, say so. The MCP tools cannot capture, save, compare,
   delete or edit. Point the user to `stacknext capture`,
   `stacknext baseline save` and `stacknext compare`; do not run those commands
   without being asked and never synthesize a comparison.

**Evidence to report:** comparison id, baseline id, candidate run id,
top-level status/severity, environment compatibility, per-scenario verified
sample counts, the decisive reasons/metrics, and what remains unproven.

**Do not:** treat `inconclusive` as a pass; compare different environments as if
they were equivalent; use trace/span ids or timestamps as matching keys; call a
regressed metric a root cause.

| Observation | Likely meaning | Next action |
| --- | --- | --- |
| Collector unreachable | `stacknext dev` is stopped or the runtime file is stale | Ask the user to start it; do not guess |
| `connection.instrumentation: "waiting"` | Collector is up, app is not connected | Start the app through `stacknext dev`, make a request |
| `total: 0` for a filter | No match in the current retention window | Broaden the filter or check the time range |
| `meta.completeness.reasons` mentions drops | Capacity/retention dropped data | Report the gap; export or raise limits if needed |
| `missingParentSpanIds` is non-empty | Spans arrived late or were dropped | Report an incomplete timeline |
| Query `durationMs: null` | Adapter cannot measure duration | Report unmeasured, not zero |
| Error has no `resolvedTraceId` | No span context and fallback found no match | Use time/route inference and label it |
| Coverage item is `not-observed` | The sample did not exercise the feature, or it is disabled | Check limitations and sample window; ask for a request that uses it |
| Coverage item is `unknown` | Config/evidence cannot determine the state | Report the uncertainty; do not call it a failure |
| Coverage item is `unsupported` | Intentional StackNext boundary | Explain the boundary and the documented alternative, if any |
| Run `status` is `failed`, `interrupted` or `incomplete` | Candidate telemetry is incomplete | Report it; the comparison is inconclusive |
| Sample `correlation.status` is `incomplete` | Trace not found, injected parent missing or no request trace | Do not guess from time; re-capture the scenario |
| Comparison is `inconclusive` | Environment mismatch, missing/incomplete samples, structural change | Fix the evidence; it is not a pass |
| Scenario has no baseline | Annotation changed or scenario is new | Re-baseline the intended scenario |
| Query metric is `unmeasured` | Drizzle duration is null | Report unmeasured, never zero |

## Report template

```text
Finding
  <one sentence answering the question>

Evidence
  - tool: <tool name>
  - route: <route or "unknown">
  - trace/error id: <id or "none">
  - measurement: <duration, status, count, or SQL shape>

Correlation
  exact span context | route+time fallback | unknown

Completeness
  <pagination, drops, missing parents, null durations, verified/incomplete
  samples, or "complete">

Regression
  <status/severity, environment compatibility and verified sample counts, or
  "not relevant">

Unproven
  <what the evidence cannot establish>

Recommended next step
  <one concrete action, or "none">
```

Keep the report shorter than the evidence you inspected. If the user asks for a
fix, propose the smallest code change that addresses the proven failure, and say
which evidence supports it.
