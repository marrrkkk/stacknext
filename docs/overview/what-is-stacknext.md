---
title: What is StackNext?
description: StackNext turns a Next.js development session into a bounded, inspectable runtime sample with local evidence for debugging and regression checks.
---

A Next.js dev server already emits OpenTelemetry spans, but the evidence is
scattered across terminals, framework internals and database logs. StackNext
collects the supported spans, query events and request errors into one bounded
in-memory sample, then gives you several ways to read it:

- a dashboard served by the local collector;
- `stacknext` CLI commands for status, coverage, diagnostics, export and
  regression records;
- a read-only MCP server for AI coding agents;
- deterministic diagnostic findings with bounded evidence;
- frozen snapshots and Playwright-linked regression comparisons stored under
  `.stacknext`.

## Why local-first

Runtime evidence often contains enough information to identify a bug, but
sending it to a hosted service adds an account, a network boundary and a new
privacy decision. StackNext keeps the collector on `127.0.0.1`, requires a
bearer token for ingestion, stores telemetry in memory with capacity and
retention limits, and keeps captured records in redacted local files.

The result is a debugging loop that works offline and never needs an AI API key.
The client you connect may still send tool results to a hosted model; that is
the client's policy, not a StackNext network path.

## What you can answer

| Question | Evidence source |
| --- | --- |
| Which routes are slow? | Requests, spans, `find_slow_requests` and slow-request findings |
| Did a query pattern repeat? | Query events and the `n-plus-one-queries` rule |
| Is an error repeating? | Error records, fingerprint findings and trace correlation |
| What did this sample actually observe? | Instrumentation coverage |
| Did a covered Playwright flow regress? | Saved baseline and candidate comparison |
| What did the app look like earlier? | A saved, redacted snapshot |

## What it deliberately does not do

- It does not capture bodies, headers, cookies, URL query values or SQL bind
  parameters.
- It does not support Edge runtime, production instrumentation or frameworks
  other than Next.js App Router.
- It does not run SQL or `EXPLAIN`, edit source code or recommend indexes from
  telemetry alone.
- It does not treat a heuristic finding as a confirmed root cause or a
  comparison as a statistical test.
- It does not replace an existing OpenTelemetry provider.

Read [limitations](../limitations) and
[security and privacy](../security/data-collection) before relying on it.
