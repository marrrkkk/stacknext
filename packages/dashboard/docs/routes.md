---
title: Routes
description: Dashboard routes and deep links served by the StackNext collector.
---

# Routes

The dashboard is a client-side app. The collector serves the shell for these
paths and the browser handles the view.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:e57ee1f7b1fcf11bf9fbed866b8a7ee034e0c005d5cec80dddb2d4245cd2a410 -->

| Path | View |
| --- | --- |
| `/` | Overview: counts, latency, recent errors, coverage, top diagnostics. |
| `/requests` | Legacy redirect to `/traces?view=requests` (request list with filters and sorting). |
| `/requests/:traceId` | Legacy redirect to `/traces/:traceId` (request detail and span timeline). |
| `/traces` | Trace list. |
| `/traces/:traceId` | Trace waterfall, errors and queries. |
| `/database` | Database query list. |
| `/database/:id` | Database query shape detail (`DatabaseQueryDetailPage`). |
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
| `/snapshots/:snapshotId/traces` | Frozen trace list (`TracesPage`). |
| `/snapshots/:snapshotId/traces/:traceId` | Frozen trace waterfall (`TraceDetailPage`). |
| `/snapshots/:snapshotId/errors` | Frozen error list (`ErrorsPage`). |
| `/snapshots/:snapshotId/errors/:errorId` | Frozen error detail (`ErrorDetailPage`). |
| `/snapshots/:snapshotId/database` | Frozen database query list (`DatabasePage`). |
| `/mcp` | MCP setup and connection state (`McpPage`). |
| `/settings` | Retention, bounds, connections and privacy state. |

<!-- /coderabbit-ai-generated:v1 -->

Agent activity adds two read-only views: `/agents` lists local MCP sessions and
`/agents/:sessionId` shows one session's bounded read timeline. Detail pages for
errors, traces, diagnostics, comparisons and snapshots show a "Read by agent"
chip backed by `/api/agents?recordId=<id>`. Session ids are random and local;
these views never expose query values, bodies or tokens. Those detail pages also
offer a "Copy evidence prompt" action that builds an ids-only prompt from
`evidence.ts` without any new API route or network request.

Deep links are stable for the lifetime of a record. A missing or expired
telemetry record shows an empty state rather than inventing data.

## API routes

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:7c1cf7e9433cb99d1f8731529272ab221a8c86e8f6c21fb29ea21a9a02c0eec4 -->

The collector also serves read APIs used by the dashboard, CLI and MCP:
`/api/health`, `/api/summary`, `/api/requests`, `/api/traces`, `/api/errors`,
`/api/database`, `/api/coverage`, `/api/diagnostics`, `/api/export`,
`/api/test-runs`, `/api/baselines`, `/api/comparisons` and `/api/snapshots`.

Investigation cases add two read-only views: `/cases` lists local append-only
cases and `/cases/:caseId` shows the hypothesis, evidence links, session link
and folded event timeline. Cases are created from the CLI with
`stacknext case`; there is no dashboard write surface.

Agent read APIs also include `/api/agents`, `/api/agents/:sessionId`,
`/api/agents?recordId=<id>`, `/api/cases` and `/api/cases/:id`. All require the
same read authorization as every other `/api` route.

<!-- /coderabbit-ai-generated:v1 -->

The Overview page reads `/api/overview`, which combines the `/api/summary`
payload with the recent request page in one authenticated request. Collectors
without that endpoint fall back to `/api/summary` plus `/api/requests`.

Dashboard API access uses a `HttpOnly`, `SameSite=Strict` session cookie issued
when the dashboard HTML is loaded. Ingestion and regression capture writes
require the bearer token.
