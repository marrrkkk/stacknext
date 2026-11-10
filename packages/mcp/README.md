# @stacknext/mcp

Read-only Model Context Protocol server for [StackNext](https://github.com/marrrkkk/stacknext)
telemetry, diagnostics, regression records and saved snapshots.

The supported entry point is the CLI:

```bash
npx stacknext mcp
```

It reads `.stacknext/run.json` from the current app, connects to the loopback
collector and reserves stdout for the MCP protocol. Logs go to stderr. The
server exposes twenty read-only tools and five guided prompts; it cannot capture
runs, save baselines or snapshots, edit files or reach a non-loopback URL.

## Tools

The tool surface covers project summary, requests, traces, errors, database
queries, slow requests, diagnostics, test runs, baselines, comparisons and
snapshots. Successful responses include JSON text content, structured content,
output schemas and response metadata with pagination, connection and
completeness information.

The six regression tools read runs, baselines and comparisons only. The three
snapshot tools list and read snapshots, their summary and one scoped trace; they
never create, import or delete a snapshot.

## Configuration

```json
{
  "mcpServers": {
    "stacknext": {
      "command": "npx",
      "args": ["--no-install", "stacknext", "mcp"],
      "cwd": "/absolute/path/to/your-app"
    }
  }
}
```

Start `stacknext dev` before the MCP client. With pnpm, use
`pnpm --dir /absolute/path/to/your-app exec stacknext mcp`.

## Documentation

- [Package overview](docs/index.md)
- [Tools](docs/tools.md)
- [Prompts](docs/prompts.md)
- [Security](docs/security.md)

The `docs/` directory ships in the npm archive. Public setup guides live on the
[documentation site](https://github.com/marrrkkk/stacknext/tree/main/apps/docs).

## AI agents

Start with `get_project_summary`, cite tool evidence, check
`meta.completeness` and treat `null` Drizzle durations as unmeasured. The
portable `stacknext-debugging` skill teaches the evidence-first workflows; it is
installed with `stacknext skill install`.

## Development

```bash
pnpm --filter @stacknext/mcp build
pnpm --filter @stacknext/mcp typecheck
pnpm test
```

The package is ESM-only and requires Node.js 20.9 or newer.

License: MIT.
