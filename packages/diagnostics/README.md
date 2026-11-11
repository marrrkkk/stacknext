# @stacknext/diagnostics

Deterministic, evidence-backed diagnostics for [StackNext](https://github.com/marrrkkk/stacknext)
telemetry. The engine evaluates six conservative rules over the current
retention sample: N+1 query shapes, slow requests, slow spans, repeated external
HTTP endpoints, request error fingerprints and server-error responses.

Findings are heuristics, not confirmed root causes. The same report is exposed
by the StackNext CLI, dashboard, JSON export and read-only MCP server.

```bash
npm install --save-dev @stacknext/cli @stacknext/next
npx stacknext diagnose
```

This package is normally consumed through the StackNext CLI and collector. It
has no network, storage or model dependency; the caller supplies one bounded
telemetry snapshot.

## Public API

```ts
import {
  generateDiagnosticReport,
  listDiagnosticFindings,
  getDiagnosticDetail,
  diagnosticOverview,
  evaluateDiagnosticRules,
} from '@stacknext/diagnostics'
```

| Function | Purpose |
| --- | --- |
| `generateDiagnosticReport(snapshot, options)` | Runs enabled rules and returns a bounded report. |
| `evaluateDiagnosticRules(context)` | Runs the six rules without the report envelope. |
| `listDiagnosticFindings(report, filters?)` | Applies category/severity/status/rule/route/trace/time/search filters and pagination. |
| `getDiagnosticDetail(report, id, snapshot)` | Returns one finding and a bounded related trace. |
| `diagnosticOverview(report, topLimit?)` | Returns counts and top findings for the dashboard/MCP summary. |

## Documentation

- [Package overview](docs/index.md)
- [Rules](docs/rules.md)
- [Findings and filtering](docs/findings.md)

The `docs/` directory ships in the npm archive. Public user guides live on the
[documentation site](https://stack-next.mintlify.site).

## AI agents

Agents should read the installed package docs before interpreting findings.
Report the rule, status, evidence and limitations; never present `possible` or
`observed` as a confirmed root cause. The MCP tools that expose this report are
documented in `@stacknext/mcp/docs`.

## Development

```bash
pnpm --filter @stacknext/diagnostics build
pnpm --filter @stacknext/diagnostics typecheck
pnpm test
```

The package is ESM-only and requires Node.js 20.9 or newer.

License: MIT.
