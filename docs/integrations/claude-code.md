# Claude Code setup

Claude Code can load stdio MCP servers from project or user scope and discovers
project skills in `.claude/skills/`.

Setup was verified with Claude Code `2.1.303` on Linux: the project skill was
discovered and the MCP server connected over stdio. The model-driven workflows
were not run because the test environment was not logged in; see
[agent-testing.md](../agent-testing.md) for the exact result. StackNext 0.7
includes six read-only regression tools; they were verified at the protocol and
e2e level, but no new model-driven Claude Code scenario was run. Check
`claude --version`; command flags can change between releases.

## 1. Start StackNext

From the Next.js app directory:

```bash
pnpm exec stacknext dev
```

Leave it running. The MCP server reads `.stacknext/run.json` for the collector
URL and token.

## 2. Install the skill

From the project root:

```bash
pnpm exec stacknext skill install --client claude-code
```

The skill ships inside `@stacknext/cli`. The command copies the whole directory,
including `references/`, into `.claude/skills/stacknext-debugging/`. Use
`--force` to replace an existing copy. `stacknext skill path` prints the bundled
location. Restart Claude Code after installing.

## 3. Add the MCP server

Use project scope so the configuration can be reviewed with the repository:

```bash
claude mcp add --scope project stacknext -- \
  pnpm --dir /absolute/path/to/your-app exec stacknext mcp
```

Or create `.mcp.json` in the project root:

```json
{
  "mcpServers": {
    "stacknext": {
      "command": "pnpm",
      "args": [
        "--dir",
        "/absolute/path/to/your-app",
        "exec",
        "stacknext",
        "mcp"
      ]
    }
  }
}
```

Use an absolute app path. If `stacknext` is installed globally, use
`"command": "stacknext"` and `"args": ["mcp"]`.

Verify the registration:

```bash
claude mcp list
claude mcp get stacknext
```

Restart Claude Code if the server was added while a session was open.

## 4. Verify the tools

In a Claude Code session, ask:

```text
Use the StackNext MCP tools. Call get_project_summary, then get the most recent
error and its correlated trace. Cite the error id, trace id and key span.
```

To inspect saved regression evidence, ask:

```text
List the StackNext baselines and comparisons, then open the newest comparison
and explain its status, severity and environment compatibility. Do not describe
an inconclusive result as a pass or as statistically significant.
```

The MCP server can read runs, baselines and comparisons, but it cannot capture,
save, compare or delete them. Use the CLI for those actions.

Non-interactive check:

```bash
claude -p "Use the StackNext MCP tool get_project_summary. Report the project name and whether instrumentation is connected."
```

A healthy result has `meta.connection.instrumentation: "connected"`. Claude Code
may ask for permission before running MCP tools; approve only the StackNext
read-only tools you intend to use.

## Optional project instructions

Claude Code reads `CLAUDE.md`. Add the marked block from
[agent-instructions.md](agent-instructions.md) without replacing existing
content. Keep it short: the skill and MCP server instructions carry the detailed
workflows.

## Boundaries

- The MCP server is read-only and loopback-only.
- The six regression tools only read saved records. They cannot capture runs,
  save baselines, run comparisons or delete files.
- The bearer token stays in `.stacknext/run.json` (mode `0600`); do not paste it
  into `.mcp.json` or `CLAUDE.md`.
- Claude Code may log or transmit tool results according to its own policy.
  StackNext does not control the client.
