# @stacknext/mcp

Read-only Model Context Protocol server for [StackNext](https://github.com/marrrkkk/stacknext)
telemetry, diagnostics and regression records.

The supported entry point is the CLI:

```bash
npx stacknext mcp
```

It reads `.stacknext/run.json` from the current app, connects to the loopback
collector and reserves stdout for the MCP protocol. Logs go to stderr. The
server exposes twenty read-only tools and five guided prompts; it cannot
capture runs, save baselines or snapshots, edit files or reach a non-loopback URL.

The package is ESM-only and requires Node.js 20.9 or newer.

License: MIT.
