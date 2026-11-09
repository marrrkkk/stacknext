---
title: Agent workflows
description: An evidence-first loop for runtime errors, slow requests, diagnostics, regressions and snapshots.
---

The Agent Skill contains the full playbooks. This page is the shared loop they
all use.

## The loop

1. **Locate the version.** Read the installed package docs for every StackNext
   package involved. Confirm the version in `package.json`.
2. **Confirm the sample.** Call `get_project_summary`; check connection,
   retention window, counts and coverage.
3. **Choose one question.** Pick an error, a slow route, a query pattern, a
   diagnostic finding, a comparison or a snapshot.
4. **Collect bounded evidence.** Use list tools with a narrow filter, then fetch
   one record by id. Paginate with `offset`; do not dump everything.
5. **Verify correlation.** Exact span context is stronger than the route/time
   fallback. A verified regression sample requires the injected trace and a
   parented server span.
6. **State what is unproven.** Diagnostics are heuristics; comparisons are not
   statistical tests; snapshots are not live.
7. **Recommend one next step.** Prefer a measurement or a targeted request over
   a large refactor.

## Error

`list_errors` → `get_error` → `get_request` / `get_trace` →
`stacknext_list_diagnostics` with `category: "errors"`. Report the error id,
route, status and whether the trace link is exact or fallback.

## Slow request

`find_slow_requests` → `get_request` → compare self time and query evidence.
Read `slow-request` and `slow-span` findings, but verify the contributor in the
trace. Do not call a `null`-duration query slow.

## Diagnostics

`stacknext_list_diagnostics` → `stacknext_get_diagnostic`. Read `counts`,
`sample`, `notes` and `limitations`. Report the finding id, rule, status,
severity and the evidence actually checked.

## Regression

`stacknext_list_test_runs` → `stacknext_get_test_run` →
`stacknext_list_baselines` / `get_baseline` →
`stacknext_list_comparisons` / `get_comparison`. Report status and severity
separately. Never create a comparison from telemetry.

## Snapshot

`stacknext_list_snapshots` → `stacknext_get_snapshot` →
`stacknext_get_snapshot_trace`. State the snapshot id, source and save time.
Do not present it as current telemetry.

## Related

- [Agent Skill](skill)
- [MCP tools](../packages/mcp/tools)
- [Agent Skill workflows](https://github.com/marrrkkk/stacknext/tree/main/skills/stacknext-debugging/references/workflows.md)
