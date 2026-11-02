# StackNext MCP tool reference

All seventeen tools are read-only, idempotent and restricted to the local
collector. Tool text content is pretty-printed JSON; clients that support
structured content also receive the same object in `structuredContent`. The
object always contains the tool payload plus a top-level `meta` object.

## Common arguments

| Argument | Type | Notes |
| --- | --- | --- |
| `limit` | integer 1-200 | Default 50. The collector caps it at 200. |
| `offset` | integer >= 0 | Use with `meta.result.nextOffset` when `hasMore` is true. |
| `minDurationMs` | number 0-600000 | Inclusive threshold. |
| `sort` | `recent`, `oldest`, `slowest` | List tools that support sorting. |
| `q` | string, max 200 | Case-insensitive text search over the fields the tool exposes. |

## Regression ids and statuses

Regression ids are strict: `run-<16 hex>`, `base-<16 hex>` and
`cmp-<16 hex>`. An id that does not match is rejected before storage is read.
The regression tools read only the collector's configured project directory;
they cannot read arbitrary files.

- Run status: `running`, `completed`, `failed`, `interrupted` or `incomplete`.
- Comparison status: `improved`, `regressed`, `unchanged` or `inconclusive`.
- Severity: `high`, `medium`, `low` or `none`, separate from status.

A scenario sample is `verified` only when the collector found the injected trace
and a server span parented to the injected span id. `incomplete` means the
telemetry could not be proven, never that a time window matched. Baselines are
immutable snapshots and are never deleted by these tools.

## Common response metadata

```json
{
  "meta": {
    "tool": "list_requests",
    "generatedAt": "2026-11-02T12:00:00.000Z",
    "project": "tasklight",
    "timeRange": {
      "firstEventTime": "2026-11-02T11:55:00.000Z",
      "lastEventTime": "2026-11-02T11:59:59.000Z"
    },
    "result": {
      "found": 120,
      "returned": 50,
      "limit": 50,
      "offset": 0,
      "hasMore": true,
      "nextOffset": 50
    },
    "connection": {
      "instrumentation": "connected",
      "instances": 1,
      "lastSeen": "2026-11-02T11:59:59.000Z",
      "sdkVersion": "0.6.0",
      "collectorVersion": "0.6.0"
    },
    "completeness": { "complete": true, "reasons": [] },
    "notes": []
  }
}
```

- `result.found` is the total number of matching records in the retention
  window, not the number returned in this page.
- `result.hasMore` and `nextOffset` describe pagination. `nextOffset` is `null`
  on the last page.
- `connection.instrumentation` is `connected`, `waiting` (collector is running
  but no app has connected) or `unknown` (health lookup failed).
- `completeness.complete` is false when telemetry is dropped, a result is
  paginated, no app is connected, or a trace has missing parents. Read
  `completeness.reasons`.
- `notes` carries short caveats, such as omitted stacks, unmeasured query
  durations or incomplete regression correlation.
- `get_project_summary` adds `meta.coverage` with counts (`observed`, `active`,
  `configured`, `notObserved`, `unsupported`, `unknown`,
  `requestsInSample`). It also returns the full `coverage` report.
- Detail responses also include `meta.identifiers`, for example
  `{ "traceId": "..." }`, `{ "runId": "run-..." }` or
  `{ "comparisonId": "cmp-..." }`.
- Times in payloads are Unix epoch milliseconds. Metadata times are ISO 8601
  strings. Regression records use their own `createdAt` timestamps and are not
  limited by the telemetry retention window.

## get_project_summary

Arguments: none.

Returns `{ health, summary, coverage, meta }`. `summary` contains total/failed/slow
request counts, average and p95 duration, span/error/query/fetch counts, the five
slowest requests, five recent errors (without stacks), and the first/last event
time. `coverage` contains the sample window, status counts and one item per
framework/adapter/custom feature. Start here.

Coverage statuses are `observed`, `active`, `configured`, `not-observed`,
`unknown` and `unsupported`. There is no coverage percentage. A `not-observed`
or `unknown` item means evidence is missing from the current sample, not that
the app is broken. Read `coverage.items[].limitations` before recommending
instrumentation changes.

## list_requests

Arguments: `limit`, `offset`, `q`, `method`, `status`, `slow`, `minDurationMs`,
`sort`.

Returns `{ items, total, limit, offset, meta }`. Each item includes `traceId`,
route, method, status code/class, duration, timestamp, span/error/query/fetch
counts, `failed`, `slow` and service name.

- `status` is one of `2xx`, `3xx`, `4xx`, `5xx`, `none`.
- `method` is matched case-insensitively by the collector.
- `slow` uses the project's `slowRequestMs` threshold.
- `sort` defaults to `recent`.

## get_request

Arguments: `traceId` (32 hexadecimal characters).

Returns the request summary, every captured span, correlated errors and database
queries, start/end/duration and `missingParentSpanIds`. The request may be
`null` when the trace exists but no request root was derived.

Use the span tree to find the longest span, the failing span, or the gap between
request start and first child.

## list_traces

Arguments: `limit`, `offset`, `q`, `sort`.

Returns `{ items, total, limit, offset, meta }`. Each trace summary includes the
root span, service, start/end, duration, span/error/query counts, `failed` and an
optional request summary.

## get_trace

Arguments: `traceId` (32 hexadecimal characters).

Returns the same detail shape as `get_request`, plus an additive `diagnostics`
array of finding references that mention this trace. Prefer `get_trace` when you
do not know whether the id has a request root; prefer `get_request` when the user
gave you a request trace id.

Each reference has `id`, `ruleId`, `category`, `severity`, `status` and `title`.
The array is a pointer, not a second full trace: call
`stacknext_get_diagnostic` for the finding and its bounded evidence.

## list_errors

Arguments: `limit`, `offset`, `q`, `route`, `name`, `includeStack`.

Returns `{ items, total, limit, offset, groups, meta }`. Items include the error
id, fingerprint, name, message, route, timestamps, trace correlation and
`resolvedTraceId`. `groups` aggregates by fingerprint with count and first/last
seen.

Stacks are omitted by default for context efficiency. Set `includeStack: true`
only when the list itself needs stack evidence; otherwise call `get_error` for
one error. When stacks are omitted, `meta.notes` says so.

## get_error

Arguments: `errorId`.

Returns `{ error, trace, meta }`. `error` includes the redacted stack and
`resolvedTraceId`. `trace` is the full correlated trace detail or `null` when no
trace could be resolved. Treat the correlation as exact only when the error has
a captured span context; route/time fallback is weaker.

## list_database_queries

Arguments: `limit`, `offset`, `q`, `minDurationMs`, `traceId`,
`databaseSystem`.

Returns `{ items, total, limit, offset, meta }`. Each item includes redacted
`sql`, `databaseSystem`, `operation`, `success`, `errorMessage`, `source`,
`durationMs`, `resolvedTraceId` and `route`.

`durationMs` is `null` for Drizzle queries because the Drizzle logger does not
expose duration. `null` means unmeasured, never zero. `minDurationMs` excludes
null-duration queries because they cannot be compared to a threshold.

## find_slow_requests

Arguments: `minDurationMs` (default 500), `limit`.

Returns `{ items, total, limit, offset, meta }`, sorted slowest first. This is a
convenience wrapper over `list_requests` with `sort: "slowest"` and the duration
filter applied. Use `list_requests` when you also need method/status filters.

## stacknext_list_diagnostics

Arguments: `limit`, `offset`, `category`, `severity`, `status`, `ruleId`,
`route`, `traceId`, `since`, `until`, `q`.

Returns `{ items, total, limit, offset, generatedAt, engineVersion,
ruleSetVersion, sample, counts, notes, limitations, meta }`.

- `category`: `database`, `http`, `performance`, `errors` or `runtime`.
- `severity`: `info`, `warning` or `error`.
- `status`: `observed`, `possible` or `insufficient-evidence`.
- `ruleId`: `n-plus-one-queries`, `slow-span`, `repeated-external-http` or
  `error-fingerprint`.
- `since`/`until` are epoch milliseconds and filter the finding window.

Findings are deterministic heuristics over the current retention window. Read
`sample`, `notes` and `limitations` before drawing conclusions. `total` is the
number of matching findings; `items` is the current page. Use
`stacknext_get_diagnostic` to inspect one.

## stacknext_get_diagnostic

Arguments: `diagnosticId` in the form `diag-xxxxxxxx-xxxxxxxx`.

Returns `{ finding, trace, meta }`. `finding` contains the rule, category,
severity, status, route, time window, fingerprint, bounded evidence,
`verification` steps and `limitations`. `trace` is a related trace context
bounded by the server, or `null` when the evidence aged out. Use `get_trace` for
the complete span tree when the detail response is truncated.

A diagnostic id is not a credential. It identifies a deterministic finding in
the current sample; it can disappear when the underlying telemetry ages out.

## stacknext_list_test_runs

Arguments: `limit`, `offset`.

Returns `{ items, total, limit, offset, meta }`. Items combine live collector
runs with saved runs from `.stacknext/runs`. Each summary includes `id`, `name`,
`projectName`, `status`, `createdAt`, `completedAt`, `durationMs`, scenario and
sample counts (`samples`, `verifiedSamples`, `incompleteSamples`) and the
captured `environment`. Live runs can be `running`; a non-completed run has
incomplete telemetry and supports no regression verdict.

## stacknext_get_test_run

Arguments: `runId` (`run-<16 hex>`).

Returns the full run plus `meta`: `format`, `version`, `id`, `name`,
`projectName`, `status`, `createdAt`, `completedAt`, `command`, `environment`,
`collector`, `scenarios`, `warnings`, `notes`, `limitations` and `stats`. Each
scenario contains its stable `identity` (including `scenarioId`, title, file and
project), `samples`, aggregated `findings`, notes and limitations.

Each sample has its Playwright `status`, expected status, retry/repeat index,
duration, `capturedAt`, findings and `correlation`. Correlation is `verified` or
`incomplete` with bounded `reasons` and captured traces. Never turn an
incomplete sample into evidence by matching timestamps or nearby requests.

## stacknext_list_baselines

Arguments: `limit`, `offset`.

Returns `{ items, total, limit, offset, meta }`. Each baseline summary includes
`id`, `name`, `projectName`, `createdAt`, `sourceRunId`, scenario/sample counts
and the recorded `environment`. Baselines are immutable and are never removed
automatically.

## stacknext_get_baseline

Arguments: `baselineId` (`base-<16 hex>`).

Returns the baseline plus `meta`: `format`, `version`, `id`, `name`,
`projectName`, `createdAt`, `sourceRunId`, `environment`, `scenarios`,
`warnings`, `notes`, `limitations` and `stats`. `meta.identifiers` also carries
`sourceRunId`. The baseline does not follow later telemetry or app changes.

## stacknext_list_comparisons

Arguments: `limit`, `offset`.

Returns `{ items, total, limit, offset, meta }`. Each item includes `id`,
`projectName`, `baselineId`, `candidateId`, `createdAt`, `status`, `severity`,
`summary` counts and `environmentCompatible`. Status and severity are separate;
`inconclusive` is not a pass.

## stacknext_get_comparison

Arguments: `comparisonId` (`cmp-<16 hex>`).

Returns the comparison plus `meta`: `format`, `version`, `id`, `projectName`,
`createdAt`, `baselineId`, `candidateId`, `status`, `severity`, `environment`,
`options`, `summary`, `scenarios`, `warnings` and `limitations`.

- `environment.compatible`, `environment.ignored` and `environment.differences`
  explain the environment gate. `--ignore-environment` is a CLI option; this
  tool only reads the saved record.
- Each scenario includes `scenarioId`, title, file, project, `status`,
  `severity`, `reasons`, `metrics`, and baseline/candidate sample counts.
- Metrics include `kind`, `status`, `severity`, `baselineValue`,
  `candidateValue`, `delta`, `percent`, `sampleCount`, optional `note` and
  `unmeasured`.

Comparisons use medians and explicit thresholds. They are not significance
tests and do not prove causality. Read the reasons and metrics before explaining
a result.

## Error responses

Tool failures return `isError: true` with a short text message and no structured
content. Typical messages:

- `Cannot reach the StackNext collector at ...` — the collector is stopped or
  the runtime file is stale. Ask the user to run `stacknext dev`.
- `StackNext collector rejected the token ...` — the token changed after a
  restart. Restart the MCP client or pass the current token.
- `No request with trace id ... was found ...` — the id is wrong or the trace
  aged out of the retention window. Use `list_requests` to find a current id.
- `No error with id ... was found ...` — the error aged out or the id is wrong.
  Use `list_errors`.
- `No diagnostic with id ... was found ...` — the finding aged out or the id is
  wrong. Use `stacknext_list_diagnostics` to find a current id.
- `No saved test run with id ... was found ...` — the run id is wrong or the
  record is outside the collector's project directory. Use
  `stacknext_list_test_runs`.
- `No baseline with id ... was found ...` — use `stacknext_list_baselines`.
- `No comparison with id ... was found ...` — use
  `stacknext_list_comparisons`.

Do not treat an empty result as a tool failure. Empty results are successful
responses with `total: 0` and a completeness reason. Missing regression records
mean the MCP server has nothing saved to read; they do not justify creating a
record from telemetry.
