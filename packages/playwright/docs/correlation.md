---
title: Correlation
description: Exact trace injection, probing and the verified/incomplete sample rule.
---

# Correlation

StackNext never links browser and server activity by time or proximity. Each
sample is proven by an injected trace context.

## Injection

`createTraceparent()` generates a W3C `traceparent` with a new trace id and
span id. The fixture adds it to document, fetch and XHR requests whose URL is:

- loopback (`127.0.0.1`, `localhost`, `[::1]`, `::1`); or
- the Playwright project's `baseURL` origin.

Other resource types and cross-origin requests are left untouched.

## Verification

The collector considers a trace verified only when both are true:

1. it stored a trace with the injected trace id; and
2. it contains a server span whose parent span id equals the injected span id.

The fixture probes `GET /api/test-runs/:runId/traces/:traceId` until the
document trace is found or the timeout expires. It submits at most 20 trace
references per sample, document requests first.

If either condition is missing, the sample is `incomplete` with a reason such
as:

- `trace-not-found`;
- `injected-parent-not-found`;
- `no-request-trace-recorded`.

There is no fallback to a nearby request, a time window or a synthetic trace.
An incomplete sample makes the affected comparison inconclusive.

## Why the server must cooperate

`@stacknext/next` installs the W3C composite propagator during registration. If
the app does not run StackNext instrumentation, or another provider replaces the
propagator, the injected trace id never reaches the server and correlation
fails.

The collector's self-instrumentation filter also excludes requests to
`/__stacknext/`, so dashboard and MCP traffic cannot be mistaken for application
requests.

## Limits

- One worker only. Parallel correlation is not verified.
- Redirects and new tabs may create traces that are not in the submitted set.
- Browser-side rendering and network timing are not captured.
- Playwright screenshots, video and trace archives are never read or stored.

See [regression captures](../../regression/docs/captures.md).
