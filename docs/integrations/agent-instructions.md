---
title: Project instruction files
description: Install and maintain the managed StackNext block in AGENTS.md, and reuse it safely in other client instruction files.
---

StackNext ships version-matched package docs, an Agent Skill and a read-only
MCP server. A short project instruction file tells the agent that those
resources exist and how to use them.

The repository root `AGENTS.md` is different: it contains contributor rules for
people working on StackNext itself. Do not copy it into an application.

## Managed AGENTS.md block

Run this inside the app project:

```bash
pnpm exec stacknext init --agents
```

The command adds or updates only the content between:

```text
<!-- BEGIN STACKNEXT AGENT RULES -->
<!-- END STACKNEXT AGENT RULES -->
```

It never overwrites user content, never deletes instructions, updates only the
managed block on later runs, preserves CRLF line endings, and errors without
modifying the file when markers are duplicated, partial or out of order.
`--skip-agents` explicitly skips the block, which is also the default.

The block points at the CLI docs entry point it discovered and lists only the
package docs that are actually available. If no package docs exist, it says so
instead of referencing missing paths. See
[AGENTS.md integration](../ai-agents/agents-md) for the full guarantee list.

## Other instruction files

`--agents` writes `AGENTS.md` only. StackNext does not silently modify
`CLAUDE.md`, `.cursor/rules/`, `.github/copilot-instructions.md`, `GEMINI.md` or
global instruction files.

For another project-level file, copy the managed block after reviewing it:

```markdown
<!-- BEGIN STACKNEXT AGENT RULES -->
# StackNext

Before using or changing a StackNext API:

1. Read the CLI package's `docs/index.md`.
2. Read the docs for each installed StackNext package involved in the task.
3. Confirm the version in the package.json next to those docs.
4. Prefer local docs over external docs or model memory.
5. Do not assume undocumented APIs or packages exist.
6. For runtime investigation, use the read-only StackNext MCP tools.
7. Follow the installed `stacknext-debugging` skill for detailed workflows.
8. Treat diagnostic findings as evidence, not confirmed root causes, and
   `inconclusive` comparisons as inconclusive, not passes.
<!-- END STACKNEXT AGENT RULES -->
```

Do not add this block manually to `AGENTS.md` if you want the CLI to manage it.
Let `init --agents` create it there.

## What belongs in project instructions

- Start runtime investigations with `get_project_summary`.
- Cite tool evidence: route, trace id, error id, span, duration, status.
- Check `meta.connection.instrumentation`, `meta.completeness` and pagination.
- Read coverage as evidence, never as a percentage or health score.
- Remember that request bodies, headers, cookies, URL query values and SQL bind
  parameters are never captured.
- Never claim a finding is a confirmed cause or a comparison is statistically
  significant.

The detailed playbooks belong in the [Agent Skill](../ai-agents/skill), not in
every instruction file.

## What not to put in instructions

- Do not tell an agent to bypass redaction, read `.stacknext/run.json` or send
  the bearer token anywhere.
- Do not describe StackNext as production monitoring, Edge-compatible or a
  remote service.
- Do not claim every error has an exact trace; the fallback is route/method plus
  30 seconds.
- Do not treat an `inconclusive` comparison as a pass.
- Do not duplicate the package API reference; link to the local docs instead.

## Client files

| Client | Project instructions | Project skill | Setup |
| --- | --- | --- | --- |
| OpenCode | `AGENTS.md` | `.opencode/skills/` | [OpenCode](opencode.md) |
| Codex | `AGENTS.md` | `.agents/skills/` | [Codex](codex.md) |
| Claude Code | `CLAUDE.md` | `.claude/skills/` | [Claude Code](claude-code.md) |
| Other MCP clients | Whatever the client reads | Whatever the client documents | [MCP](../mcp.md) |
