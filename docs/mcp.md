# MCP server

NextScope exposes collected telemetry to AI coding clients through a
**read-only** Model Context Protocol server over stdio. It reads the same local
collector API as the dashboard and never mutates data.

## Start it

Start NextScope first:

```bash
nextscope dev
```

Then, in another terminal from the same app directory:

```bash
nextscope mcp
```

`mcp` reads `.nextscope/run.json` for the collector URL and bearer token. You
can also supply them explicitly:

```bash
nextscope mcp --collector http://127.0.0.1:4400 --token <token>
```

stdout is reserved for MCP protocol messages; diagnostics are written to
stderr.

## Client configuration

Most clients accept a JSON server entry. Use an absolute app path:

```json
{
  "mcpServers": {
    "nextscope": {
      "command": "pnpm",
      "args": [
        "--dir",
        "/absolute/path/to/your-app",
        "exec",
        "nextscope",
        "mcp"
      ]
    }
  }
}
```

If your client supports `cwd`, this also works:

```json
{
  "mcpServers": {
    "nextscope": {
      "command": "pnpm",
      "args": ["exec", "nextscope", "mcp"],
      "cwd": "/absolute/path/to/your-app"
    }
  }
}
```

If `nextscope` is installed globally, use `"command": "nextscope"` and
`"args": ["mcp"]` instead. Restart the client after changing its MCP config. The
NextScope collector must be running before the client starts the server.

## Tools

All tools return JSON as MCP text content. Every tool is annotated
`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true` and
`openWorldHint: false`.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `get_project_summary` | none | Project name, connection state, counts, latency summary, recent errors. Start here. |
| `list_requests` | `limit`, `offset`, `q`, `method`, `status`, `slow`, `minDurationMs`, `sort` | Request summaries with route, status, duration, span/error/query counts and trace id. |
| `get_request` | `traceId` | Request summary, full span timeline, errors and database queries. |
| `list_traces` | `limit`, `offset`, `q`, `sort` | Trace summaries with root span, duration and counts. |
| `get_trace` | `traceId` | Full span tree plus correlated errors and database queries. |
| `list_errors` | `limit`, `offset`, `q`, `route`, `name` | Errors, fingerprint groups and trace correlation. |
| `get_error` | `errorId` | One error with redacted stack and its correlated trace. |
| `list_database_queries` | `limit`, `offset`, `q`, `minDurationMs`, `traceId`, `databaseSystem` | Redacted SQL, duration (nullable), success state and route. |
| `find_slow_requests` | `minDurationMs`, `limit` | Slowest requests above the threshold, default 500 ms. |

`limit` is between 1 and 200. `minDurationMs` is between 0 and 600,000.
`status` accepts `2xx`, `3xx`, `4xx`, `5xx` or `none`. `sort` accepts `recent`,
`oldest` or `slowest`.

## Example prompts

- “What is the slowest request in the last few minutes, and which database
  queries ran inside it?”
- “Summarize the errors captured for `/api/error` and link each one to a trace.”
- “Find requests over 250 ms, then tell me which route has the worst p95.”
- “List the SQL queries correlated with trace `…` and flag missing durations.”

## Security model

- The server connects only to loopback collector URLs. Non-loopback URLs are
  rejected by the API client.
- The bearer token is read from the runtime file and stays inside the MCP
  process. Tool callers never receive it.
- The collector's API is read-only. The MCP server does not expose ingestion,
  configuration changes, file access or arbitrary HTTP requests.
- Data returned to the model is the same redacted data shown in the dashboard.
  It can still contain routes, error text, SQL fragments and timing information.
  Treat the client's conversation and logs as part of your local debugging
  environment.
- Do not wrap NextScope in a remote MCP transport or proxy. The server is meant
  for a local stdio client.
