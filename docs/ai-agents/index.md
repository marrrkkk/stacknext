---
title: AI agent support
description: How StackNext gives coding agents version-matched docs, evidence-first workflows and read-only runtime access.
---

StackNext is designed for agents that need runtime evidence before changing
code, and for agents that must use the APIs of the installed version rather than
the latest documentation on the internet.

## The four pieces

| Piece | What it gives the agent | Where it lives |
| --- | --- | --- |
| Package docs | Version-matched API references | `node_modules/@stacknext/*/docs/` and this site's [Packages](../packages/index) section |
| Managed `AGENTS.md` | A pointer to local docs and evidence rules | Project `AGENTS.md`, installed by `stacknext init --agents` |
| Agent Skill | Debugging, diagnostics, regression and snapshot workflows | Client skill directory, installed by `stacknext skill install` |
| MCP server | Read-only access to live telemetry and saved records | `stacknext mcp` over stdio |

The pieces are intentionally separate. Package docs contain technical
reference; the skill contains procedures; the MCP server contains runtime data;
`AGENTS.md` carries the short project-level rules.

## The evidence contract

An agent using StackNext must:

1. Start with `get_project_summary` and confirm the app is connected.
2. Cite routes, trace ids, error ids, spans, durations, statuses or finding ids.
3. Treat diagnostic findings as evidence, not confirmed root causes.
4. Treat `inconclusive` comparisons as inconclusive, not passes.
5. Say when a result comes from a snapshot instead of the live sample.
6. Respect the redaction boundary and never try to recover removed values.
7. Never claim support for an API, config key or package that is not in the
   installed docs.

## Start here

- [Local documentation](local-docs)
- [AGENTS.md integration](agents-md)
- [Agent Skill](skill)
- [Supported agents](supported-agents)
- [Evidence-first workflows](workflows)
- [MCP server](../mcp)
