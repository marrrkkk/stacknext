---
title: OpenCode setup
description: Configure StackNext MCP and the Agent Skill in OpenCode.
---

OpenCode can load local MCP servers and Agent Skills. This guide uses
project-level configuration so the setup is reviewable and does not change the
user's global OpenCode config.

Verified with OpenCode `v2.2.5` on Linux. The eight-scenario record in
[agent compatibility testing](https://github.com/marrrkkk/stacknext/blob/main/docs/testing/agent-compatibility.md)
includes the 0.3 baseline and the 0.4 diagnostics scenario run with this client.
StackNext 0.10 includes six read-only regression tools; they were verified at
the protocol and e2e level, not through a new model-driven OpenCode scenario.
Check `opencode --version`; menu names can
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
pnpm exec stacknext skill install --client opencode
```

The skill ships inside `@stacknext/cli`. The command copies the whole directory,
including `references/`, into `.opencode/skills/stacknext-debugging/`. Use
`--force` to replace an existing copy. `stacknext skill path` prints the bundled
location.

OpenCode also discovers `.claude/skills/` and `.agents/skills/`. If the project
uses Codex as well, one copy in `.agents/skills/stacknext-debugging/` works for
both OpenCode and Codex:

```bash
pnpm exec stacknext skill install --client codex
```

Do not copy only `SKILL.md`; keep `references/`.

## 3. Add the MCP server

Create or edit `opencode.json` in the project root. OpenCode V2 stores servers
under `mcp.servers`:

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

Use an absolute app path; a relative path depends on where OpenCode starts the
server. `codemode: false` exposes the twenty StackNext tools directly instead
of grouping them behind OpenCode's Code Mode, which keeps the tool names in this
guide and in the skill unchanged. If you prefer Code Mode, omit the field and
call the grouped tools as `tools.stacknext.<tool>`.

If `stacknext` is installed globally, the command can be:

```json
"command": ["stacknext", "mcp"]
```

You can also add the entry with the CLI. It writes to the project config unless
you pass `--global`:

```bash
opencode mcp add stacknext -- \
  pnpm --dir /absolute/path/to/your-app exec stacknext mcp
```

The CLI uses OpenCode's default Code Mode. Add `"codemode": false` to the
generated entry if you want the direct tool names used in this guide.

Check the connection:

```bash
opencode mcp list
```

OpenCode watches configuration files and applies changes without a restart.

## 4. Verify

In an OpenCode session, ask:

```text
Call the StackNext get_project_summary tool and tell me whether instrumentation
is connected. Then list the three slowest requests.
```

A healthy result has `meta.connection.instrumentation: "connected"`. If the tool
does not appear, check the OpenCode MCP/server logs and the absolute path.

To inspect saved regression evidence, ask:

```text
List the StackNext test runs and baselines, then open the newest comparison and
explain its status, severity and any environment differences. Do not treat an
inconclusive result as a pass.
```

The MCP server can read runs, baselines and comparisons, but it cannot capture,
save, compare or delete them. Use the CLI for those actions.

Non-interactive check:

```bash
opencode run "Use the StackNext MCP tool get_project_summary. Report the project name and connection state."
```

## Optional project instructions

Add the short block from
[agent-instructions.md](agent-instructions.md) to `AGENTS.md`. Keep the marker
comments and do not overwrite existing content. The skill provides the detailed
workflows, so the instruction block should stay brief.

## Boundaries

- The MCP server is read-only and loopback-only.
- The six regression tools only read saved records. They cannot capture runs,
  save baselines, run comparisons or delete files.
- The skill teaches the agent to cite evidence, to treat `null` database
  durations as unmeasured, and to report `inconclusive` comparisons as
  inconclusive rather than as a pass.
- OpenCode may log or transmit tool results according to its own policy.
  StackNext does not control the client. Review that policy before using a
  hosted model with project telemetry.
