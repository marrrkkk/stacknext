# Codex setup

Codex CLI can load stdio MCP servers from `config.toml` and repository skills
from `.agents/skills/`. Codex also reads the MCP server's `instructions` during
initialization, so the StackNext workflow is available even without the skill.

Verified with Codex CLI `0.164.0` on Linux. The eight-scenario record in
[agent-testing.md](../agent-testing.md) includes the 0.3 baseline and the 0.4
diagnostics scenario run with this client. StackNext 0.7 includes six read-only
regression tools; they were verified at the protocol and e2e level, not through
a new model-driven Codex scenario. Check `codex --version`; config keys can
change between releases.

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
pnpm exec stacknext skill install --client codex
```

The skill ships inside `@stacknext/cli`. The command copies the whole directory,
including `references/`, into `.agents/skills/stacknext-debugging/`. Use
`--force` to replace an existing copy. `stacknext skill path` prints the bundled
location. Restart Codex after installing.

## 3. Add the MCP server

For a user-level setup, edit `~/.codex/config.toml`. For a project-level setup,
edit `.codex/config.toml` in a trusted project:

```toml
[mcp_servers.stacknext]
command = "pnpm"
args = ["--dir", "/absolute/path/to/your-app", "exec", "stacknext", "mcp"]
cwd = "/absolute/path/to/your-app"
startup_timeout_sec = 20
tool_timeout_sec = 30
```

Use an absolute app path. If `stacknext` is installed globally:

```toml
[mcp_servers.stacknext]
command = "stacknext"
args = ["mcp"]
cwd = "/absolute/path/to/your-app"
```

Project config is only loaded for projects Codex trusts. If the server does not
appear, check the trust setting and the Codex logs before changing the command.

## 4. Verify

Ask Codex:

```text
Use the StackNext MCP tools. Call get_project_summary, then list the three
slowest requests and the most recent error. Cite the trace or error ids.
```

To inspect saved regression evidence, ask:

```text
List the StackNext test runs and open the newest comparison. Explain its status,
severity, verified sample counts and any environment differences. Do not treat
an inconclusive result as a pass.
```

The MCP server can read runs, baselines and comparisons, but it cannot capture,
save, compare or delete them. Use the CLI for those actions.

Non-interactive check:

```bash
codex exec "Use the StackNext MCP tool get_project_summary. Report the project name and whether instrumentation is connected."
```

A healthy result has `meta.connection.instrumentation: "connected"`.

## Optional project instructions

Codex reads `AGENTS.md`. Add the marked block from
[agent-instructions.md](agent-instructions.md) without replacing existing
content. Keep it short: the server instructions and skill carry the detailed
workflow.

## Boundaries

- The MCP server is read-only and only accepts loopback collector URLs.
- The six regression tools only read saved records. They cannot capture runs,
  save baselines, run comparisons or delete files.
- Codex may log or transmit tool results according to its own policy. StackNext
  does not control the client.
- Do not add the StackNext bearer token to `config.toml`; the server reads it
  from `.stacknext/run.json`.
