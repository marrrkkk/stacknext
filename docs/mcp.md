# MCP server

StackNext exposes collected telemetry and saved regression records to AI coding
clients through a **read-only** Model Context Protocol server over stdio. It
reads the same local collector API as the dashboard and never mutates data.

## Start it

Start StackNext first:

```bash
stacknext dev
```

Then, in another terminal from the same app directory:

```bash
stacknext mcp
```

`mcp` reads `.stacknext/run.json` for the collector URL and bearer token. You
can also supply them explicitly:

```bash
stacknext mcp --collector http://127.0.0.1:4400 --token <token>
```

stdout is reserved for MCP protocol messages; diagnostic logging is written to
stderr.

## Client configuration

Most clients accept a JSON server entry. Use an absolute app path:

```json
{
  "mcpServers": {
    "stacknext": {
      "command": "pnpm",
      "args": [
        "--dir",
        "/absolute/path/to/your-app",
        "exec",
        "stacknext",
        "mcp"
      ]
    }
  }
}
```

If your client supports `cwd`, this also works:

```json
{
  "mcpServers": {
    "stacknext": {
      "command": "pnpm",
      "args": ["exec", "stacknext", "mcp"],
      "cwd": "/absolute/path/to/your-app"
    }
  }
}
```

If `stacknext` is installed globally, use `"command": "stacknext"` and
`"args": ["mcp"]` instead. Restart the client after changing its MCP config. The
StackNext collector must be running before the client starts the server.

Client-specific setup:

- [OpenCode](integrations/opencode.md)
- [Codex](integrations/codex.md)
- [Claude Code](integrations/claude-code.md)
- [Project instructions for agents](integrations/agent-instructions.md)

## Tools

All tools are annotated `readOnlyHint: true`, `destructiveHint: false`,
`idempotentHint: true` and `openWorldHint: false`.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `get_project_summary` | none | Project name, connection state, counts, latency summary, recent errors and instrumentation coverage. Start here. |
| `list_requests` | `limit`, `offset`, `q`, `method`, `status`, `slow`, `minDurationMs`, `sort` | Request summaries with route, status, duration, span/error/query counts and trace id. |
| `get_request` | `traceId` | Request summary, full span timeline, errors and database queries. |
| `list_traces` | `limit`, `offset`, `q`, `sort` | Trace summaries with root span, duration and counts. |
| `get_trace` | `traceId` | Full span tree plus correlated errors, database queries and additive diagnostic references. |
| `list_errors` | `limit`, `offset`, `q`, `route`, `name`, `includeStack` | Errors, fingerprint groups and trace correlation. Stacks are omitted unless `includeStack` is true. |
| `get_error` | `errorId` | One error with redacted stack and its correlated trace. |
| `list_database_queries` | `limit`, `offset`, `q`, `minDurationMs`, `traceId`, `databaseSystem` | Redacted SQL, duration (nullable), success state and route. |
| `find_slow_requests` | `minDurationMs`, `limit` | Slowest requests above the threshold, default 500 ms. |
| `stacknext_list_diagnostics` | `limit`, `offset`, `category`, `severity`, `status`, `ruleId`, `route`, `traceId`, `since`, `until`, `q` | Deterministic findings with counts, sample window, notes and limitations. |
| `stacknext_get_diagnostic` | `diagnosticId` | One finding with bounded evidence, verification steps, limitations and a related trace. |
| `stacknext_list_test_runs` | `limit`, `offset` | Live and saved capture runs with status, sample/correlation counts, command timing and environment. |
| `stacknext_get_test_run` | `runId` | One run with scenarios, samples, verified trace/query/error evidence, findings, warnings and limitations. |
| `stacknext_list_baselines` | `limit`, `offset` | Immutable baselines with source run, scenario/sample counts and environment. |
| `stacknext_get_baseline` | `baselineId` | One baseline with its source run, environment and captured scenarios. |
| `stacknext_list_comparisons` | `limit`, `offset` | Deterministic comparison summaries with status, severity, counts and environment compatibility. |
| `stacknext_get_comparison` | `comparisonId` | One comparison with per-scenario reasons, metrics, environment differences and limitations. |

`limit` is between 1 and 200 (default 50). `minDurationMs` is between 0 and
600,000. `status` accepts `2xx`, `3xx`, `4xx`, `5xx` or `none`. `sort` accepts
`recent`, `oldest` or `slowest`. Diagnostic `category` accepts `database`,
`http`, `performance`, `errors` or `runtime`; `severity` accepts `info`,
`warning` or `error`; diagnostic `status` accepts `observed`, `possible` or
`insufficient-evidence`; `ruleId` accepts `n-plus-one-queries`, `slow-span`,
`repeated-external-http` or `error-fingerprint`; `since` and `until` are epoch
milliseconds.

Regression ids are strict: `run-<16 hex>`, `base-<16 hex>` and `cmp-<16 hex>`.
Comparison status is `improved`, `regressed`, `unchanged` or `inconclusive`;
severity is `high`, `medium`, `low` or `none`. An id that does not match the
format is rejected before storage is read.

Tool text content remains pretty-printed JSON for compatibility. Successful
calls also return `structuredContent` and advertise an `outputSchema` when the
client supports structured tool output.

## Response metadata

Every successful response adds a top-level `meta` object:

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
      "sdkVersion": "0.6.1",
      "collectorVersion": "0.6.1"
    },
    "completeness": { "complete": true, "reasons": [] },
    "notes": []
  }
}
```

- `result.found` is the total in the retention window; `returned` is this page.
- `connection.instrumentation` is `connected`, `waiting` or `unknown`.
- `completeness.complete` is false for pagination, dropped data, an unconnected
  app, an empty result or missing parent spans. Read `completeness.reasons`.
- Detail responses add `meta.identifiers` (`traceId`, `errorId`,
  `diagnosticId`, `runId`, `baselineId`, `comparisonId` and/or `candidateId`).
- `notes` carries short caveats such as omitted stacks, unmeasured query
  durations, diagnostic findings that are not confirmed root causes, or
  regression records that are incomplete or inconclusive.

The server also publishes MCP `instructions` during initialization. Codex reads
these directly; other clients may show or ignore them.

## Coverage in the summary

`get_project_summary` returns the same coverage report as
`GET /api/coverage` and `stacknext coverage --json`. It also adds a compact
summary to `meta.coverage`:

```json
{
  "coverage": {
    "observed": 5,
    "active": 1,
    "configured": 0,
    "notObserved": 4,
    "unsupported": 3,
    "unknown": 1,
    "requestsInSample": 12
  }
}
```

`coverage.sample` gives the retention window and connection state, while each
`coverage.items[]` entry carries a status, evidence count/types, last-seen time
and limitations. Read those before recommending instrumentation work.

Coverage separates missing instrumentation from an absent runtime problem:

- `observed` means the current sample contains matching evidence.
- `active` means the app is connected but no request has exercised the feature
  yet.
- `configured` means no app is connected and the config suggests the feature is
  enabled.
- `not-observed` means the sample was connected and had requests, but the
  evidence was absent, or the feature is disabled.
- `unknown` means the state cannot be determined from the sample/config.
- `unsupported` is an intentional boundary.

There is deliberately no percentage or composite score. `not-observed` and
`unknown` are not proof of a broken app. The existing tool names and arguments
are unchanged; coverage is additive. See
[instrumentation coverage](instrumentation-coverage.md) for the full status
model.

## Diagnostics

`stacknext_list_diagnostics` and `stacknext_get_diagnostic` expose the same
deterministic findings as `stacknext diagnose`, the dashboard and
`GET /api/diagnostics`. The server does not run a second engine and does not
call an AI service.

The four rules are conservative:

| Rule | Category | Status | Evidence |
| --- | --- | --- | --- |
| `n-plus-one-queries` | `database` | `possible` | Repeated normalized SQL shapes within one trace. |
| `slow-span` | `performance` | `observed` | A measured span above its category threshold. |
| `repeated-external-http` | `http` | `possible` | Repeated normalized external endpoints within one trace. |
| `error-fingerprint` | `errors` | `observed` | Errors sharing a route-independent normalized fingerprint. |

A list response includes `total`, `counts`, `sample`, `notes`, `limitations`,
`engineVersion` and `ruleSetVersion`. Read the sample window before drawing
conclusions: findings are computed over the current in-memory retention window,
not all history. `total` is the number of matching findings; `items` is the
current page. The default finding cap is 100.

`stacknext_get_diagnostic` returns `{ finding, trace, meta }`. The finding
contains the rule, category, severity, status, route, time window, fingerprint,
bounded evidence, `verification` steps and `limitations`. The related trace is
bounded; use `get_trace` for the complete span tree when it is truncated.

`get_trace` adds a `diagnostics` array of references (`id`, `ruleId`,
`category`, `severity`, `status`, `title`) without changing the existing trace
shape. The array is a pointer; call `stacknext_get_diagnostic` for evidence.

Findings are evidence, not confirmed root causes. `possible` means the pattern
is consistent with a problem; `observed` means the measurement exists. Neither
proves why the app behaves that way. Diagnostic ids are deterministic within the
current sample but are not credentials and can disappear when telemetry ages
out.

## Runtime regression records

The six regression tools expose the same records as `stacknext runs`,
`stacknext baseline`, `stacknext compare` and the dashboard. They are
read-only: the MCP server cannot capture a run, save a baseline, compare a
candidate, remove a record or edit a file.

### Test runs

`stacknext_list_test_runs` returns live and saved capture runs. Live runs come
from the collector registry; saved runs come from `.stacknext/runs/`. Summaries
include `status`, sample and correlation counts, command timing and the captured
environment.

`stacknext_get_test_run` returns one run with its scenarios and samples. A
sample is `verified` only when the collector found the injected trace and a
server span parented to the injected span id. Incomplete samples show reasons
such as `trace-not-found`, `injected-parent-not-found` or
`no-request-trace-recorded`. Never infer a missing sample from a time window;
call it incomplete.

Run status is `running`, `completed`, `failed`, `interrupted` or `incomplete`.
Only a `completed` run with verified samples can become a baseline. A failed or
incomplete run is still readable, but no regression verdict can be inferred from
it.

### Baselines

`stacknext_list_baselines` and `stacknext_get_baseline` read immutable snapshots
saved with `stacknext baseline save`. A baseline includes its `sourceRunId`,
environment, scenarios, sample evidence, stats, notes and limitations. Saving a
baseline does not follow later telemetry or app changes. Baselines are never
deleted automatically; an MCP caller cannot delete one.

### Comparisons

`stacknext_list_comparisons` and `stacknext_get_comparison` read deterministic
baseline/candidate comparisons. A detail includes:

- top-level `status` and `severity`;
- `environment.compatible`, `environment.ignored` and differences;
- `summary` counts and resolved `options`;
- per-scenario `status`, `severity`, `reasons`, `baseline`, `candidate` and
  `metrics`;
- `warnings` and `limitations`.

Statuses are `improved`, `regressed`, `unchanged` and `inconclusive`. Severity
is separate. Environment differences, a candidate that did not complete,
incomplete correlation, insufficient samples, missing scenarios and variable
trace shapes make the result inconclusive by default. `--ignore-environment` is
a CLI option; the MCP server only reads the saved record.

Comparisons use medians and explicit thresholds. They are not statistical
significance tests and do not prove causality. An `inconclusive` result is not a
pass. Never describe a regression as significant or a finding as a confirmed
root cause.

## Prompts

The server offers five optional prompts. They shape an investigation but do not
add capabilities or execute tools on their own.

| Prompt | Arguments | Use |
| --- | --- | --- |
| `diagnose-error` | `errorId?`, `route?` | Find an error, inspect its stack, and follow the correlated trace. |
| `investigate-slow-request` | `minDurationMs?`, `route?` | Rank slow requests and break down the slowest trace. |
| `inspect-database-activity` | `traceId?`, `minDurationMs?` | Inspect SQL, failures, null durations and trace correlation. |
| `investigate-trace` | `traceId` | Inspect one timeline, its errors and queries. |
| `diagnose-runtime-issue` | `diagnosticId?`, `traceId?`, `route?` | Start from a finding or trace, verify the evidence and report what remains unproven. |

## Agent Skill

The portable skill at
[`skills/stacknext-debugging`](../skills/stacknext-debugging/SKILL.md) teaches
evidence-first workflows for runtime errors, slow requests, database activity,
general investigation, diagnostic findings and runtime regression evidence. It
also carries mandatory reasoning rules for observation-versus-causation, null
durations, overlapping spans, coverage gaps and non-significant regression
statuses. Install the whole directory into the client's project skill path; see
[agent instructions](integrations/agent-instructions.md) and the client setup
guides. The skill is optional. The MCP tools and server instructions remain
usable without it.

## Example prompts

- “What is the slowest request in the last few minutes, and which database
  queries ran inside it?”
- “Summarize the errors captured for `/api/error` and link each one to a trace.”
- “Find requests over 250 ms, then tell me which route has the worst p95.”
- “List the SQL queries correlated with trace `…` and flag missing durations.”
- “Is instrumentation connected, and is any telemetry being dropped?”
- “Which instrumentation features are unsupported, missing or simply not
  exercised in the current sample?”
- “List the current diagnostics, then verify the strongest database finding.”
- “Open diagnostic `diag-…`, show its evidence and tell me what is still
  unproven.”
- “List the latest test runs and tell me which scenarios have incomplete
  correlation.”
- “Show the newest baseline and compare it with run `run-…`. Is the result
  regressed, inconclusive or unchanged?”
- “Open comparison `cmp-…` and explain the regressed metrics and environment
  differences without claiming statistical significance.”
- “Group the recent errors and link one group to a trace.”

## Security model

- The server connects only to loopback collector URLs. Non-loopback URLs are
  rejected by the API client.
- The bearer token is read from the runtime file and stays inside the MCP
  process. Tool callers never receive it.
- The collector's API is read-only. The MCP server does not expose ingestion,
  configuration changes, file access or arbitrary HTTP requests.
- Data returned to the model is the same redacted data shown in the dashboard.
  It can still contain routes, error text, SQL fragments, span attribute values,
  timings, scenario file paths and environment facts. Coverage, diagnostic and
  regression evidence are derived from that redacted data. Treat the client's
  conversation and logs as part of your local debugging environment.
- Regression tools can read any run, baseline or comparison in the collector's
  configured project directory. They cannot write, delete or read arbitrary
  files, and they never receive the collector token.
- Do not wrap StackNext in a remote MCP transport or proxy. The server is meant
  for a local stdio client.

## Compatibility and testing

See [agent-testing.md](agent-testing.md) for the compatibility suite and the
current, honestly reported results per client. Connecting successfully is not the
same as completing an investigation with correct evidence; the table records
both.
