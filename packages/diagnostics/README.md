# @stacknext/diagnostics

Deterministic, evidence-backed diagnostics for [StackNext](https://github.com/marrrkkk/stacknext)
telemetry. The engine evaluates six conservative rules over the current
retention sample: repeated SQL shapes, slow requests and spans, repeated
external HTTP endpoints, request errors and server-error responses.

Findings are heuristics, not confirmed root causes. The same report is exposed
by the StackNext CLI, dashboard, JSON export and read-only MCP server.

```bash
npm install --save-dev @stacknext/cli @stacknext/next
npx stacknext diagnose
```

This package is normally consumed through the StackNext CLI and collector. It
is ESM-only and requires Node.js 20.9 or newer.

License: MIT.
