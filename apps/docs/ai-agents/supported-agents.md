---
title: Supported agents
description: Supported MCP clients and skill installation targets, with the boundaries of each integration.
---

StackNext supports any MCP client that can launch a local stdio server. The
repository records real setup checks for OpenCode, Codex and Claude Code.

| Client | MCP | Project skill | Project instructions | Guide |
| --- | --- | --- | --- | --- |
| OpenCode | `opencode.json` | `.opencode/skills/` | `AGENTS.md` | [Setup](../integrations/opencode) |
| Codex | `config.toml` | `.agents/skills/` | `AGENTS.md` | [Setup](../integrations/codex) |
| Claude Code | CLI or `.mcp.json` | `.claude/skills/` | `CLAUDE.md` | [Setup](../integrations/claude-code) |

Other clients can use the same stdio command:

```json
{
  "command": "pnpm",
  "args": ["--dir", "/absolute/path/to/app", "exec", "stacknext", "mcp"]
}
```

Do not use SSE, HTTP or a remote proxy. The server refuses non-loopback
collector URLs, and the collector binds to loopback only.

## Instruction files

`stacknext init --agents` writes `AGENTS.md` only. Tools that read
`CLAUDE.md`, `.cursor/rules/`, `GEMINI.md` or a proprietary file need a manual
paste of the same managed block. StackNext does not silently modify files it
does not own. See [project instruction files](../integrations/agent-instructions).

## What no client gets

- Write access to the app, collector or saved records.
- Request or response bodies, headers, cookies, URL query values or SQL bind
  parameters.
- A way to bypass redaction or read the bearer token.
- Cloud or remote telemetry forwarding from StackNext.

The connected client may log or transmit tool results under its own policy.
Review that policy before using StackNext with a hosted model.

## Compatibility record

[Agent compatibility testing](https://github.com/marrrkkk/stacknext/blob/main/docs/testing/agent-compatibility.md)
records the protocol and client checks that were actually run. A client is not
listed as supported without one.
