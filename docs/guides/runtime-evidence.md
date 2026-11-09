---
title: Runtime evidence
description: Investigate traces, errors and performance with the dashboard, CLI and read-only MCP tools.
---

StackNext is an evidence source, not an answer generator. Every claim about
runtime behavior should point to a route, trace id, error id, span, duration,
status code, query or finding id.

## Start with the sample

```bash
pnpm exec stacknext status
pnpm exec stacknext coverage
```

In MCP clients, call `get_project_summary` first. Check
`meta.connection.instrumentation`: `waiting` means no app is connected. Read
`meta.completeness` and the sample window before drawing conclusions.

## Error investigation

1. Open **Errors** or call `list_errors` with a route, name or query filter.
2. Read the latest matching error and its redacted stack.
3. If `resolvedTraceId` is present, inspect the request timeline and the
   failing span.
4. Check `stacknext_list_diagnostics` with `category: "errors"` for a repeated
   fingerprint or a 5xx response without a correlated error.
5. Report what is proven, what is correlated by the route/time fallback, and
   what remains unknown.

An error grouped by fingerprint shares a normalized signature, not necessarily
a cause.

## Slow request investigation

1. Use **Requests** sorted by duration, `find_slow_requests`, or
   `list_requests` with `sort: "slowest"`.
2. Open the request and compare self time across spans.
3. Inspect database queries inside the trace. Drizzle durations are `null`;
   never treat them as zero.
4. Check `slow-request` and `slow-span` findings. A slow child span may be
   suppressed when the whole request is already reported.
5. Test whether the pattern is isolated by filtering the same route or method.

A parent span includes its children. Do not add parent and child durations.

## Trace investigation

`get_trace` returns the span tree, missing parent ids, errors and associated
queries. A missing parent is a completeness gap, not proof that the span is
unrelated. Use exact span ids when describing a link.

## CLI equivalents

```bash
pnpm exec stacknext coverage
pnpm exec stacknext diagnose
pnpm exec stacknext diagnose --trace-id <trace-id>
pnpm exec stacknext export --stdout
```

The dashboard, CLI, export and MCP all read the same collector sample. A
snapshot is frozen and cannot answer questions about current behavior.

## Related

- [Diagnostics](diagnostics)
- [Instrumentation coverage](../instrumentation-coverage)
- [MCP server](../mcp)
- [Agent workflows](../ai-agents/workflows)
