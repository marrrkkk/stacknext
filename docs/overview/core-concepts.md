---
title: Core concepts
description: The sample, traces, coverage, diagnostics, snapshots and regression records that StackNext exposes.
---

## Sample and retention

A **sample** is the telemetry currently held in the collector's in-memory store.
`collector.maxSpans` limits spans. Error and query buffers have separate
capacities derived from that setting; each type can hold up to its own capacity.
`collector.retentionMs` bounds retention (10 minutes by default). When capacity or retention removes data, the store records drops.
Every count and finding describes this sample, not all activity since the app
started. See [configuration](../packages/core/configuration).

## Requests, traces and spans

A **request** is an incoming HTTP request to the Next.js app. A **trace** is the
tree of spans produced while handling it. StackNext preserves documented
Next.js span types and parent ids; unknown span types remain visible as verbose
evidence rather than being guessed.

A span's duration includes its children. To find where time is spent, compare
child spans or inspect self time; never sum a parent and its child as if they
ran sequentially.

## Queries and errors

Drizzle query events never include durations, so `durationMs` is `null`, not
zero. Prisma events can include a duration. SQL text is redacted; bind
parameters are neither read nor sent. Request errors arrive through the Next.js
error hook with a redacted message and stack. A trace link may be exact (active
span context) or a route/method plus 30-second fallback.

## Coverage is evidence

**Instrumentation coverage** answers what the current sample observed for a
feature such as fetch spans, database adapters, custom spans, Server Actions or
verbose tracing. Statuses include `observed`, `active`, `configured`,
`not-observed`, `unknown` and `unsupported`. They are not a percentage or health
score, and absence is not proof that a feature is broken. See
[instrumentation coverage](../instrumentation-coverage).

## Diagnostics are deterministic findings

**Diagnostics** are six conservative rules over the current sample. A finding
has a deterministic id, a rule, a status (`possible`, `observed` or
`insufficient-evidence`), a severity, bounded evidence and limitations.
`possible` means the pattern is consistent with a problem; `observed` means the
measurement exists. Neither proves a root cause. See [diagnostics](../guides/diagnostics).

## Snapshots are frozen evidence

A **snapshot** is a versioned, redacted copy of one sample saved under
`.stacknext/snapshots`. It is never replayed into the live store. Snapshot reads
use a detached store and carry no live diagnostics or coverage. Manual and
imported snapshots never rotate automatically. See
[snapshots](../guides/snapshots).

## Regression records

A **capture run** contains Playwright scenarios and their verified runtime
samples. A **baseline** is an immutable saved run. A **comparison** matches
scenarios by stable id and traces/spans by normalized keys, then reports
`improved`, `regressed`, `unchanged` or `inconclusive` with a separate severity.
A sample is verified only when the collector found the injected trace and a
server span parented to the injected span id. See
[runtime regression testing](../guides/regression).

## Redaction

Redaction happens twice: in the app process before enqueueing, and in the
collector before storing. URLs keep the path only; sensitive keys become
`[redacted]`; error text is sanitized; resource attributes use an allowlist.
Captured files are re-redacted. See [redaction](../security/redaction).
