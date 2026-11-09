---
title: Routes
description: Dashboard routes and deep links served by the StackNext collector.
---

# Routes

The dashboard is a client-side app. The collector serves the shell for these
paths and the browser handles the view.

| Path | View |
| --- | --- |
| `/` | Overview: counts, latency, recent errors, coverage, top diagnostics. |
| `/requests` | Request list with filters and sorting. |
| `/requests/:traceId` | Request detail and span timeline. |
| `/traces` | Trace list. |
| `/traces/:traceId` | Trace waterfall, errors and queries. |
| `/database` | Database query list. |
| `/errors` | Error list and fingerprints. |
| `/errors/:errorId` | Error detail and correlated trace. |
| `/diagnostics` | Deterministic findings list. |
| `/diagnostics/:diagnosticId` | Finding evidence, verification and limitations. |
| `/runs` | Capture runs. |
| `/runs/:runId` | Run scenarios, samples and correlation. |
| `/baselines` | Saved baselines. |
| `/baselines/:baselineId` | Baseline detail. |
| `/comparisons` | Saved comparisons. |
| `/comparisons/:comparisonId` | Comparison status, severity and metrics. |
| `/snapshots` | Saved snapshots. |
| `/snapshots/:snapshotId` | Frozen sample summary. |
| `/settings` | Retention, bounds, connections and privacy state. |

Deep links are stable for the lifetime of a record. A missing or expired
telemetry record shows an empty state rather than inventing data.

## API routes

The collector also serves read APIs used by the dashboard, CLI and MCP:
`/api/health`, `/api/overview`, `/api/requests`, `/api/traces`, `/api/errors`,
`/api/database`, `/api/coverage`, `/api/diagnostics`, `/api/export`,
`/api/test-runs`, `/api/baselines`, `/api/comparisons` and `/api/snapshots`.

Dashboard API access uses a `HttpOnly`, `SameSite=Strict` session cookie issued
when the dashboard HTML is loaded. Ingestion and regression capture writes
require the bearer token.
