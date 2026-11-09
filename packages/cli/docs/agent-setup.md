---
title: Agent setup
description: Install StackNext agent instructions, the Agent Skill and the MCP server.
---

# Agent setup

StackNext has three complementary agent surfaces. They do not replace one
another.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:6cb91359416b90497c8a30b4e48bca6633004719cf0d0075494ac3fd6e33f50a -->

| Surface | Purpose | Command |
| --- | --- | --- |
| Local package documentation | Version-matched API reference | Ships in the seven documented packages |
| Managed `AGENTS.md` block | Short project rules and documentation pointers | `stacknext init --agents` |
| Agent Skill | Detailed evidence-first workflows | `stacknext skill install` |
| MCP server | Read-only runtime evidence | `stacknext mcp` |

<!-- /coderabbit-ai-generated:v1 -->

## 1. Local documentation

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:5322f074c4bd22377289b52567028ebfbba0bcf2a8678742f28a42cbc3ec8e3c -->

The seven packages listed in `DOCUMENTED_PACKAGES` ship `docs/`:
`@stacknext/cli`, `@stacknext/next`, `@stacknext/core`,
`@stacknext/regression`, `@stacknext/playwright`, `@stacknext/drizzle` and
`@stacknext/prisma`. Start with the CLI package's
`docs/index.md`; the managed block below records its actual path, which may be
at the workspace root. The generated [package index](packages.md) lists the
documented packages and which docs to read.

<!-- /coderabbit-ai-generated:v1 -->

No command is needed; the docs are part of the package archive.

## 2. Managed `AGENTS.md` block

```bash
stacknext init --agents
```

This adds a marked block to the project's `AGENTS.md`:

```md
<!-- BEGIN STACKNEXT AGENT RULES -->
...
<!-- END STACKNEXT AGENT RULES -->
```

Safety properties:

- An existing `AGENTS.md` is never overwritten.
- Content outside the markers is preserved byte-for-byte (line endings are
  preserved).
- Re-running updates only the block; it never duplicates it.
- If only one marker exists, the file is left unchanged and the command fails
  with a clear error instead of guessing.
- If no `AGENTS.md` exists, one is created.
- `--skip-agents` is an explicit opt-out for scripts. Agent setup is off by
  default.

The block points agents at available package docs and the current StackNext
version. If no package docs are found, it says so instead of referencing
nonexistent paths.

## 3. Agent Skill

```bash
stacknext skill install --client opencode
stacknext skill install --client codex
stacknext skill install --client claude-code
```

| Client | Project path |
| --- | --- |
| OpenCode | `.opencode/skills/stacknext-debugging` |
| Codex | `.agents/skills/stacknext-debugging` |
| Claude Code | `.claude/skills/stacknext-debugging` |

`stacknext skill path` prints the bundled directory and version. `--force`
replaces an existing skill copy; without it, an existing destination is left
untouched and the command exits 1.

## 4. MCP server

```bash
stacknext dev     # collector must be running
stacknext mcp     # stdio server
```

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:95c82a21ffd412dd8a9b62c44104a3f93a3959e02214cd944fb055ce979258e0 -->

Configure the client to start the command from the app directory. See
[commands](commands.md) for `stacknext mcp` and
[troubleshooting](troubleshooting.md) for client connection issues.

<!-- /coderabbit-ai-generated:v1 -->

## Recommended order

1. Install and initialize StackNext.
2. Run `stacknext init --agents` if the project uses `AGENTS.md`.
3. Install the skill for the client you use.
4. Configure the MCP server.
5. Start `stacknext dev` before the agent investigates.

## What StackNext does not do

- It does not modify `CLAUDE.md`, `.cursor/rules`, Copilot instructions or
  global client configuration.
- It does not install the skill without an explicit client flag.
- It does not add MCP configuration automatically to arbitrary clients.
