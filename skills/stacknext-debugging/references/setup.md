# Setup and troubleshooting

StackNext is local-first. It needs no cloud account, AI subscription or API key.
The collector and MCP server run on the developer's machine and only talk over
loopback. The MCP server is read-only.

## 1. Start StackNext

From the Next.js app directory:

```bash
pnpm exec stacknext dev
```

`dev` starts the collector and the app's own `dev` script, then writes
`.stacknext/run.json` with a short-lived bearer token. Leave it running.

If the project is not set up yet, see the repository's
[docs/getting-started.md](../../../docs/getting-started.md). In a source
checkout, run `pnpm install && pnpm build` first.

Check the collector and instrumentation:

```bash
pnpm exec stacknext status
pnpm exec stacknext doctor
pnpm exec stacknext coverage
```

## 2. Install the skill

From the app project root, run the command for your client:

```bash
pnpm exec stacknext skill install --client opencode
pnpm exec stacknext skill install --client codex
pnpm exec stacknext skill install --client claude-code
```

The skill ships inside `@stacknext/cli`. The command copies the whole directory,
including `references/`, into the client's project skill path. Use `--force` to
replace an existing copy; `stacknext skill path` prints the bundled location.

| Client | Project skill location |
| --- | --- |
| OpenCode | `.opencode/skills/stacknext-debugging/`, `.claude/skills/...` or `.agents/skills/...` |
| Codex | `.agents/skills/stacknext-debugging/` |
| Claude Code | `.claude/skills/stacknext-debugging/` |

For a project that uses more than one client, keep one copy in
`.agents/skills/stacknext-debugging/` for OpenCode and Codex, and copy it to
`.claude/skills/stacknext-debugging/` for Claude Code. Reload or restart the
client if it does not discover the new skill automatically.

When working from a source checkout before packing, `skill install` also falls
back to the repository's `skills/stacknext-debugging` directory.

Do not modify a user's global skill directory or global instructions without
asking. Project-level files are easier to review and remove.

## 3. Configure MCP

Use an absolute path to the app. The MCP process must start in (or be pointed
at) the app directory so it can read `.stacknext/run.json`.

### OpenCode

Add to `opencode.json` (project root) or the global OpenCode config. OpenCode V2
stores servers under `mcp.servers`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "stacknext": {
        "type": "local",
        "command": [
          "pnpm",
          "--dir",
          "/absolute/path/to/your-app",
          "exec",
          "stacknext",
          "mcp"
        ],
        "codemode": false
      }
    }
  }
}
```

`codemode: false` exposes the twenty tools directly. If you leave Code Mode
on, the tools are grouped as `tools.stacknext.<tool>`.

### Codex

Add to `~/.codex/config.toml` or a trusted project's `.codex/config.toml`:

```toml
[mcp_servers.stacknext]
command = "pnpm"
args = ["--dir", "/absolute/path/to/your-app", "exec", "stacknext", "mcp"]
cwd = "/absolute/path/to/your-app"
startup_timeout_sec = 20
tool_timeout_sec = 30
```

Codex reads the server's `instructions` during initialization and discovers
repository skills in `.agents/skills/`.

### Claude Code

Add the server with the CLI:

```bash
claude mcp add --scope project stacknext -- \
  pnpm --dir /absolute/path/to/your-app exec stacknext mcp
```

Or add a project `.mcp.json`:

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

Verify with `claude mcp list` and `claude mcp get stacknext`. Claude Code
discovers project skills in `.claude/skills/`.

### Other MCP clients

Use the stdio command form:

```json
{
  "command": "pnpm",
  "args": ["--dir", "/absolute/path/to/your-app", "exec", "stacknext", "mcp"]
}
```

If `stacknext` is installed globally, `"command": "stacknext"` with
`"args": ["mcp"]` also works. Do not use SSE, HTTP or a remote proxy: the MCP
server is designed for local stdio and refuses non-loopback collector URLs.

## 4. Verify the connection

Ask the client to call `get_project_summary`. A healthy response has
`meta.connection.instrumentation: "connected"` and a non-empty project name.
Then make a request to the app and call `list_requests`.

The six regression tools read saved records from `.stacknext/runs`,
`.stacknext/baselines` and `.stacknext/comparisons`. They do not create records.
Capture runs, baselines and comparisons are written by the CLI:

```bash
pnpm exec stacknext capture --name before -- pnpm exec playwright test --workers=1
pnpm exec stacknext baseline save --run <run-id> --name main
pnpm exec stacknext compare <baseline-id> <candidate-run-id>
```

See [runtime regression testing](../../../docs/regression-testing.md) and
[Playwright integration](../../../docs/playwright-integration.md).

The three snapshot tools read frozen records from `.stacknext/snapshots`. They
cannot save, import, rotate or delete a snapshot. Save one from the dashboard
`/snapshots` page or the CLI while the collector is running:

```bash
pnpm exec stacknext snapshot save --label "before change"
pnpm exec stacknext snapshot list
pnpm exec stacknext snapshot export snap-0123456789abcdef -o sample.json
pnpm exec stacknext snapshot import sample.json --label "reported issue"
```

Snapshots contain no live diagnostics or coverage and never update. Automatic
exit/error snapshots keep the newest ten by default; manual and imported
snapshots are never rotated away.

## Troubleshooting

| Symptom | Check | Fix |
| --- | --- | --- |
| MCP tools do not appear | Client config path and connection status | Fix the absolute path, then reload the client |
| `Cannot reach the StackNext collector` | `stacknext status` | Start `stacknext dev`; remove a stale `.stacknext/run.json` if the pid is dead |
| `rejected the token` | Collector restarted after the client started | Restart the MCP client or pass `--token` explicitly |
| Summary is empty, instrumentation `waiting` | Is the app running through `stacknext dev`? | Restart the app with `stacknext dev`, make a request |
| Requests appear but no database queries | Adapter registration | Follow the Drizzle/Prisma setup in the getting-started guide |
| Query durations are `null` | Drizzle logger limitation | Expected; do not treat as zero |
| Error has no trace | Fallback found no match | Use the route and timestamp; label the correlation as inferred |
| Coverage says `not-observed` | The sample did not exercise the feature, or capture is disabled | Check `configured` and item limitations; make a request that uses it |
| Coverage says `unknown` | Adapter/config state cannot be inferred | Report uncertainty; check the config and registration manually |
| No successful Server Action spans | Actions are not wrapped | Use `withStackNextAction`; failures may still reach `onRequestError` |
| Old data disappeared | In-memory retention (10 minutes by default) | Reproduce the request, or inspect/export a saved snapshot before restarting |
| No regression records | No capture/baseline/comparison has been saved for this project directory | Run `stacknext capture`, `baseline save` and `compare`; MCP is read-only |
| No snapshots | No manual/exit/error snapshot has been saved for this project directory | Save one with `stacknext snapshot save` or the dashboard; MCP is read-only |
| Comparison is `inconclusive` | Environment mismatch, incomplete correlation or too few samples | Fix the evidence; do not report it as a pass |
| Scenario has no baseline | The annotation or scenario id changed | Re-baseline the intended scenario |

## Privacy boundary

StackNext never captures request/response bodies, headers, cookies, URL query
values or SQL bind parameters. Redaction runs in the app and again in the
collector. Error messages and stacks are text-redacted, and resource attributes
are allowlisted. The MCP server receives the same redacted data as the dashboard.

Captured runs, baselines, comparisons and snapshots are redacted local JSON
files under `.stacknext`. They can include scenario titles, file paths, routes,
span and query evidence, environment facts and a sanitized command line. They
never include Playwright screenshots, video or trace archives. Review them
before sharing or uploading them as CI artifacts.

The bearer token stays in `.stacknext/run.json` (mode `0600`) and is read by the
MCP process. Tool callers never receive it. The client you connect may log or
transmit tool results according to its own policy; review that policy before
using StackNext with a hosted model.
