---
title: Diagnostics
description: Understand the six deterministic rules, finding statuses, evidence and limits.
---

StackNext rebuilds a deterministic diagnostic report from the current sample.
The same report is available in the dashboard, `stacknext diagnose`, JSON
export, the read-only MCP tools and the Agent Skill.

## The six rules

| Rule | What it observes |
| --- | --- |
| `n-plus-one-queries` | The same normalized SQL shape repeated within one trace |
| `slow-request` | A route's request duration distribution above the configured threshold |
| `slow-span` | A non-root span whose self time crosses its category threshold |
| `repeated-external-http` | The same normalized external endpoint called repeatedly in a trace |
| `error-fingerprint` | Request errors grouped by a route-independent signature |
| `server-error-response` | A request root returned 5xx without a correlated non-control-flow error |

These are conservative heuristics. They do not prove an ORM bug, a causal
bottleneck, a retry policy problem or a shared error cause. Read the evidence,
verification and limitations on each finding.

## Status and severity

- `possible` — the pattern is consistent with a problem.
- `observed` — the evidence was measured directly.
- `insufficient-evidence` — the sample cannot support a conclusion.

Severity is separate from status. A high-severity finding still needs
verification. A capped report (`maxFindings`) is not a complete inventory.

## CLI

```bash
pnpm exec stacknext diagnose
pnpm exec stacknext diagnose --category database
pnpm exec stacknext diagnose --severity warning
pnpm exec stacknext diagnose --trace-id <trace-id>
pnpm exec stacknext diagnose --id <diagnostic-id> --json
```

The report includes the sample window, counts, notes and limitations. A finding
id is deterministic for its evidence but is not a durable database key.

## MCP

- `stacknext_list_diagnostics` filters by category, severity, status, rule,
  route, trace id, time, query and pagination.
- `stacknext_get_diagnostic` returns one finding plus bounded evidence and a
  related trace reference.

The MCP server is read-only and cannot create, acknowledge or delete findings.

## What diagnostics cannot do

- Execute SQL or `EXPLAIN`, inspect source code or recommend indexes.
- Detect long-term anomalies or alert.
- Call an LLM or external service.
- Turn `not-observed` coverage into proof that a feature is broken.
- Establish causality or statistical significance.

## Related

- [Diagnostics package reference](../packages/diagnostics/index)
- [Rule reference](../packages/diagnostics/rules)
- [Finding evidence](../packages/diagnostics/findings)
- [Limitations](../limitations)
