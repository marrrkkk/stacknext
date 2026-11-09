---
title: Agent Skill
description: Use the portable stacknext-debugging skill for evidence-first runtime investigations.
---

`stacknext-debugging` is a portable Agent Skill bundled with `@stacknext/cli`.
It carries the investigation workflows that are too detailed for
`AGENTS.md`, while leaving API reference to the package docs.

## Install

```bash
pnpm exec stacknext skill install --client opencode
pnpm exec stacknext skill install --client codex
pnpm exec stacknext skill install --client claude-code
```

| Client | Project skill path |
| --- | --- |
| OpenCode | `.opencode/skills/stacknext-debugging/` (also reads `.claude/skills/` and `.agents/skills/`) |
| Codex | `.agents/skills/stacknext-debugging/` |
| Claude Code | `.claude/skills/stacknext-debugging/` |

`--force` replaces an existing copy. `stacknext skill path` prints the bundled
location. The skill is also available from
[`skills/stacknext-debugging`](https://github.com/marrrkkk/stacknext/tree/main/skills/stacknext-debugging)
in the repository.

## What it covers

- Runtime error investigation with `list_errors` / `get_error`.
- Slow requests with `find_slow_requests` / `get_request`.
- Database activity with `list_database_queries`.
- The six diagnostic rules and how to verify their evidence.
- Runtime regression records and verified correlation.
- Saved snapshots and their limits.
- Coverage checks for missing telemetry.
- The evidence-first report format.

## What it does not do

- It does not replace the MCP server or grant new capabilities.
- It does not duplicate the package API reference; it points to local docs.
- It does not make findings causal or comparisons statistically significant.
- It does not capture, save, compare or delete records.

## Version awareness

The installed skill matches the installed CLI version. Its metadata version is
checked during release packaging. After upgrading StackNext, reinstall the
skill with `--force` so the workflow and tool list match.

## Related

- [Agent setup](../cli/agent-setup)
- [Skill commands](../packages/cli/skill)
- [Workflows](workflows)
