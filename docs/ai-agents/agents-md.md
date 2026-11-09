---
title: AGENTS.md integration
description: Install and update a safe, marker-delimited StackNext block in a consuming project's AGENTS.md.
---

The repository's root `AGENTS.md` is for people working on StackNext itself.
Applications that use StackNext can opt into a short, managed block that points
their agents at the locally installed documentation.

## Install

```bash
pnpm exec stacknext init --agents
```

The block is added only when requested. `--skip-agents` explicitly skips it,
which is also the default.

## What is written

```markdown
<!-- BEGIN STACKNEXT AGENT RULES -->
# StackNext
...
<!-- END STACKNEXT AGENT RULES -->
```

The block tells an agent to:

1. Read the local documentation entry point listed in the block.
2. Read the docs for each StackNext package involved in the task, listing only
   packages that are actually installed.
3. Confirm the installed version in the adjacent `package.json`.
4. Prefer local docs over external docs or model memory.
5. Not assume undocumented APIs, configuration or internal packages exist.
6. Use the read-only MCP tools for runtime investigation.
7. Follow the `stacknext-debugging` skill for deeper workflows.
8. Treat diagnostics and comparisons as evidence, not confirmed causes.
9. Verify against the installed implementation and tests.

## Safety guarantees

- A missing `AGENTS.md` is created.
- An existing file is never overwritten.
- Content outside the markers is preserved byte-for-byte, including CRLF.
- The block is replaced in place on later runs.
- Repeated runs are idempotent.
- Duplicate or partial markers cause a clear error; the file is not modified.
- No `CLAUDE.md`, client config or global instruction file is touched.

## Updating

Run `stacknext init --agents` again after upgrading StackNext. Only the managed
block changes. Review the diff before committing.

## Removing

Delete the block between the two markers, or delete `AGENTS.md` when it contains
nothing else. StackNext does not delete user files automatically.

## Related

- [Agent setup](../cli/agent-setup)
- [Project instruction files](../integrations/agent-instructions)
- [Agent Skill](skill)
