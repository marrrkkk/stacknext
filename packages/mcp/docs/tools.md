---
title: Tools
description: The twenty read-only StackNext MCP tools, arguments and response metadata.
---

# Tools

Every tool is annotated `readOnlyHint: true`, `destructiveHint: false`,
`idempotentHint: true` and `openWorldHint: false`.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `get_project_summary` | none | Project, connection state, counts, latency, recent errors, coverage. Start here. |
| `list_requests` | `limit`, `offset`, `q`, `method`, `status`, `slow`, `minDurationMs`, `sort` | Request summaries with route, status, duration and trace id. |
| `get_request` | `traceId` | Compatibility alias for `get_trace`. |
| `list_traces` | `limit`, `offset`, `q`, `sort` | Trace summaries. |
| `get_trace` | `traceId` | Span tree, errors, queries and diagnostic references. |
| `list_errors` | `limit`, `offset`, `q`, `route`, `name`, `includeStack` | Errors, groups and correlation. Stacks omitted by default. |
| `get_error` | `errorId` | One error with redacted stack and correlated trace. |
| `list_database_queries` | `limit`, `offset`, `q`, `minDurationMs`, `traceId`, `databaseSystem` | Redacted SQL, nullable duration, success and route. |
| `find_slow_requests` | `minDurationMs`, `limit` | Slowest requests above the threshold (default 500 ms). |
| `stacknext_list_diagnostics` | `limit`, `offset`, `category`, `severity`, `status`, `ruleId`, `route`, `traceId`, `since`, `until`, `q` | Deterministic findings, counts, sample and limitations. |
| `stacknext_get_diagnostic` | `diagnosticId` | One finding, bounded evidence, verification and related trace. |
| `stacknext_list_test_runs` | `limit`, `offset` | Live and saved runs. |
| `stacknext_get_test_run` | `runId` | Scenarios, samples, verified evidence, warnings. |
| `stacknext_list_baselines` | `limit`, `offset` | Immutable baselines. |
| `stacknext_get_baseline` | `baselineId` | Baseline environment and scenarios. |
| `stacknext_list_comparisons` | `limit`, `offset` | Comparison summaries. |
| `stacknext_get_comparison` | `comparisonId` | Per-scenario reasons, metrics and environment differences. |
| `stacknext_list_snapshots` | `limit`, `offset` | Frozen snapshots with source, time, stats and invalid count. |
| `stacknext_get_snapshot` | `snapshotId` | Snapshot config, limitations and first records. |
| `stacknext_get_snapshot_trace` | `snapshotId`, `traceId` | One scoped trace without live diagnostics. |

## Limits and enums

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:7db5ccc5e057299c65170bdefbd1b81dff6cc558d08acf2b6c062a910bedb8a4 -->

- `limit` is 1–200, default 50 except for `find_slow_requests`, which defaults
  to 20. Callers can request a larger limit within that range.
- `minDurationMs` is 0–600,000.
- Request `status` is `2xx`, `3xx`, `4xx`, `5xx` or `none`.
- `sort` is `recent`, `oldest` or `slowest`.
- Diagnostic `category` is `database`, `http`, `performance`, `errors` or
  `runtime`.
- Diagnostic `severity` is `info`, `warning` or `error`.
- Diagnostic `status` is `observed`, `possible` or `insufficient-evidence`.
- Diagnostic `ruleId` is one of the six documented rule ids.
- `since` and `until` are epoch milliseconds.
- Regression ids are `run-`, `base-` or `cmp-` plus 16 lowercase hexadecimal characters.
- Snapshot ids are `snap-` plus 16 lowercase hexadecimal characters.

<!-- /coderabbit-ai-generated:v1 -->

Invalid ids are rejected before storage is read.

## Response metadata

Successful responses add `meta`:

```json
{
  "meta": {
    "tool": "list_requests",
    "generatedAt": "2026-11-09T12:00:00.000Z",
    "project": "my-app",
    "timeRange": { "firstEventTime": "...", "lastEventTime": "..." },
    "result": { "found": 120, "returned": 50, "limit": 50, "offset": 0, "hasMore": true, "nextOffset": 50 },
    "connection": { "instrumentation": "connected", "instances": 1, "lastSeen": "...", "sdkVersion": "<installed-version>", "collectorVersion": "<installed-version>" },
    "completeness": { "complete": true, "reasons": [] },
    "notes": []
  }
}
```

Read `meta.completeness` and `meta.result` on every response. Detail responses
add `meta.identifiers`. `notes` carries caveats such as omitted stacks,
unmeasured durations, non-confirmed findings, inconclusive comparisons or
snapshot data that is not live telemetry.

Tool text content is pretty-printed JSON. Successful calls also return
`structuredContent` and advertise an `outputSchema` when the client supports it.

## Read-only contract

The tools cannot edit the app, capture runs, save baselines, compare records,
save/import/delete snapshots, replay requests, read arbitrary files or run SQL.
Use the CLI for those actions.
