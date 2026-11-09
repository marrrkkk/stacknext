---
title: Agent setup
description: Install managed AGENTS.md instructions, the Agent Skill and the read-only MCP server.
---

StackNext supports AI coding agents through three complementary layers. They
do not duplicate each other:

| Layer | Installed by | Purpose |
| --- | --- | --- |
| Managed `AGENTS.md` block | `stacknext init --agents` | Point the agent at version-matched local docs |
| Agent Skill | `stacknext skill install` | Evidence-first debugging workflows |
| MCP server | Client configuration | Read-only runtime and regression evidence |

## 1. AGENTS.md

```bash
pnpm exec stacknext init --agents
```

This adds or updates a block between `<!-- BEGIN STACKNEXT AGENT RULES -->` and
`<!-- END STACKNEXT AGENT RULES -->`. Existing content is preserved, repeated
runs are idempotent, and line endings are kept. `--skip-agents` explicitly
skips the block, which is also the default.

The block lists only packages whose `node_modules/@stacknext/<package>/docs/`
directory actually exists. If none are installed, it says so instead of
referencing missing paths. See [AGENTS.md integration](../ai-agents/agents-md).

## 2. Agent Skill

```bash
pnpm exec stacknext skill install --client opencode
pnpm exec stacknext skill install --client codex
pnpm exec stacknext skill install --client claude-code
```

The skill is copied from the installed `@stacknext/cli` archive. Use
`--force` to replace an existing copy and `stacknext skill path` to inspect the
bundled location. See [Agent Skill](../ai-agents/skill).

## 3. MCP server

```bash
pnpm exec stacknext mcp
```

Configure the client to run that command with the app directory as its working
directory. The server reads `.stacknext/run.json` and exposes twenty read-only
tools plus five prompts.

- [OpenCode](../integrations/opencode)
- [Codex](../integrations/codex)
- [Claude Code](../integrations/claude-code)

## Order of operations

1. Start `stacknext dev`.
2. Install the skill and managed instructions.
3. Configure MCP.
4. Ask the agent to call `get_project_summary` before investigating.

The managed block and skill are safe to commit if the project commits its
client configuration. `.stacknext/run.json` contains a bearer token and must
never be committed.
