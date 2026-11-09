---
title: Data collection
description: What StackNext collects, what it never collects, and where the data goes.
---

StackNext collects only the runtime evidence needed for local debugging and
regression checks.

## Collected

- OpenTelemetry spans from documented Next.js instrumentation: names, span
  ids, parent ids, timings, status, route/resource attributes on an allowlist.
- Drizzle/Prisma query events: redacted SQL shape, source, success, optional
  duration, and a counted parameter count. Bind values are never read.
- Next.js request errors: redacted message and stack, route, method and
  correlation metadata.
- Coverage and collector health information.
- For explicit regression runs: scenario identity, sanitized command line,
  environment facts and verified trace samples.
- For snapshots: a bounded copy of the current redacted sample.

## Never collected

- Request or response bodies.
- Headers, cookies or authorization values.
- URL query values or fragments. Absolute URLs may retain their scheme and
  hostname as well as the path; check hostnames before sharing exports.
- SQL bind parameters.
- Playwright screenshots, videos or trace archives.
- Machine or user identifiers.
- Bearer tokens outside the local runtime file.

## Where it goes

```text
App process --redact--> loopback collector --redact--> in-memory store
                                                   └─> .stacknext records (explicit saves)
```

There is no outbound telemetry. The collector binds to loopback and requires a
bearer token for ingestion. The dashboard, CLI and MCP server read the local
API. Captured runs, baselines, comparisons and snapshots are local JSON files
under `.stacknext`.

The AI client you connect to the MCP server may log or transmit tool results
under its own policy. StackNext does not control that boundary.

## Request and ingestion limits

Body size is capped, envelopes are Zod-validated, and counts are bounded before
storage. Capacity and retention drop old telemetry and expose counters rather
than growing without limit. See [retention](retention).

## Related

- [Redaction](redaction)
- [Privacy and redaction](../privacy)
- [Core schemas](../packages/core/schemas)
- [Core transport](../packages/core/transport)
