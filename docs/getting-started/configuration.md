---
title: Configuration
description: How StackNext discovers and validates stacknext.config.json, and where the authoritative field reference lives.
---

StackNext reads `stacknext.config.json` from the project directory when
`stacknext dev` starts. `stacknext init` creates it with mode `0600` when it is
missing. The file is optional: a project without it uses the defaults.

## Example

```json
{
  "projectName": "my-app",
  "dashboard": { "port": 4400 },
  "collector": { "maxSpans": 5000, "retentionMs": 600000 },
  "instrumentation": {
    "verbose": false,
    "captureFetch": true,
    "captureErrors": true
  },
  "privacy": {
    "captureHeaders": false,
    "captureRequestBodies": false,
    "captureSqlParameters": false,
    "redactSensitiveData": true
  },
  "database": { "drizzle": false, "prisma": false },
  "slowRequestMs": 500,
  "snapshots": {
    "autoOnExit": true,
    "autoOnError": true,
    "autoKeep": 10,
    "maxBytes": 67108864
  }
}
```

The full field list, validation ranges and defaults are documented in the
version-matched `@stacknext/core` package's `docs/configuration.md`. Follow its
relative path in the installed `packages.md`; the same reference is available at
[Core configuration](../packages/core/configuration).

## Environment variables

`stacknext dev` sets the runtime environment for the Next.js child process:

| Variable | Purpose |
| --- | --- |
| `STACKNEXT_COLLECTOR_URL` | Loopback collector endpoint |
| `STACKNEXT_TOKEN` | Ingestion bearer token |
| `STACKNEXT_PROJECT_NAME` | Project name reported to the collector |
| `STACKNEXT_CAPTURE_FETCH` | `0` or `1` for fetch span capture |
| `STACKNEXT_CAPTURE_ERRORS` | `0` or `1` for the error hook |
| `STACKNEXT_DEBUG` | Collector transport debug logging |
| `NEXT_OTEL_VERBOSE` | Documented Next.js verbose span switch |

An explicit inherited `NEXT_OTEL_VERBOSE` wins over
`instrumentation.verbose`. That includes `NEXT_OTEL_VERBOSE=0`. Verbose tracing
adds spans and overhead; see
[instrumentation coverage](../instrumentation-coverage).

## Privacy fields

StackNext refuses to enable headers, bodies or SQL parameters. Those fields must
stay `false`; they exist so the boundary is explicit and validated. See
[redaction](../security/redaction).

## Related

- [Instrumentation configuration](../packages/next/configuration)
- [Drizzle configuration](../packages/drizzle/configuration)
- [Prisma configuration](../packages/prisma/configuration)
- [Snapshots configuration](../packages/core/snapshots)
