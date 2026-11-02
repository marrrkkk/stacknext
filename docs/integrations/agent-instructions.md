# Project instructions for coding agents

StackNext works best when the agent knows five things:

1. StackNext is the runtime evidence source for this project.
2. The MCP server is read-only and local.
3. The agent should start with `get_project_summary` and cite tool evidence.
4. Coverage shows what the current sample observed; it is not a score and
   absence is not proof of a broken feature.
5. Saved regression records are readable through six read-only tools. Only the
   CLI can capture runs, save baselines or compare records.

The portable [Agent Skill](../../skills/stacknext-debugging/SKILL.md) carries the
detailed workflows. Project instructions are a short pointer for clients that
read `AGENTS.md`, `CLAUDE.md` or another instruction file, including clients that
do not load skills.

## Safe installation rules

- **Never overwrite an existing instruction file.** Read it first.
- Add a clearly marked block and keep the user's existing content.
- Ask before editing a global file (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`,
  global OpenCode instructions, and so on). Prefer project-level files.
- If the marker is already present, update that block instead of appending a
  duplicate.
- Keep the block short. The MCP server already publishes `instructions` and tool
  descriptions; the skill contains the long workflows.
- Do not add secrets, tokens or machine-specific absolute paths to committed
  instruction files.

## Recommended block

Use this block in `AGENTS.md` (Codex, OpenCode and other AGENTS.md-aware tools)
and `CLAUDE.md` (Claude Code). Keep the markers so future updates are safe.

```markdown
<!-- stacknext:begin -->
## StackNext runtime debugging

When debugging this Next.js app at runtime, use the local StackNext MCP server
before guessing. It is read-only and only reads the loopback collector.

- Start with `get_project_summary`. Check `meta.connection.instrumentation`;
  `waiting` means no app is connected.
- Read the coverage report and `meta.coverage`. `not-observed` or `unknown`
  means the sample lacks evidence, not that the app is broken. Never turn
  coverage into a percentage.
- Use `list_errors` / `get_error` for runtime errors, `find_slow_requests` /
  `get_request` for latency, `list_database_queries` for SQL activity, and
  `get_trace` for a full timeline.
- Use `stacknext_list_test_runs` / `stacknext_get_test_run`,
  `stacknext_list_baselines` / `stacknext_get_baseline`, and
  `stacknext_list_comparisons` / `stacknext_get_comparison` for saved regression
  records. `inconclusive` is not a pass; never claim statistical significance.
- Cite tool evidence (route, trace id, error id, span, duration, status).
  Check `meta.completeness` and paginate with `meta.result.nextOffset`.
- Drizzle query durations are `null` (unmeasured), not zero. Bodies, headers,
  cookies, URL query values and SQL bind parameters are never captured.
- The StackNext MCP server cannot edit the app, replay requests or create
  regression records. If the collector is unreachable, ask the user to start
  `stacknext dev`.
- Detailed playbooks: the installed `stacknext-debugging` skill.
<!-- stacknext:end -->
```

## Appending without overwriting

After reviewing the block above, this shell pattern appends it only when the
marker is absent. Adjust the file name for `CLAUDE.md` or another target.

```bash
if [ -f AGENTS.md ] && grep -q '<!-- stacknext:begin -->' AGENTS.md; then
  echo "StackNext block already present; edit it in place."
else
  cat >> AGENTS.md <<'EOF'
<!-- stacknext:begin -->
## StackNext runtime debugging

When debugging this Next.js app at runtime, use the local StackNext MCP server
before guessing. It is read-only and only reads the loopback collector.

- Start with `get_project_summary`. Check `meta.connection.instrumentation`;
  `waiting` means no app is connected.
- Read the coverage report and `meta.coverage`. `not-observed` or `unknown`
  means the sample lacks evidence, not that the app is broken. Never turn
  coverage into a percentage.
- Use `list_errors` / `get_error` for runtime errors, `find_slow_requests` /
  `get_request` for latency, `list_database_queries` for SQL activity, and
  `get_trace` for a full timeline.
- Use `stacknext_list_test_runs` / `stacknext_get_test_run`,
  `stacknext_list_baselines` / `stacknext_get_baseline`, and
  `stacknext_list_comparisons` / `stacknext_get_comparison` for saved regression
  records. `inconclusive` is not a pass; never claim statistical significance.
- Cite tool evidence (route, trace id, error id, span, duration, status).
  Check `meta.completeness` and paginate with `meta.result.nextOffset`.
- Drizzle query durations are `null` (unmeasured), not zero. Bodies, headers,
  cookies, URL query values and SQL bind parameters are never captured.
- The StackNext MCP server cannot edit the app, replay requests or create
  regression records. If the collector is unreachable, ask the user to start
  `stacknext dev`.
- Detailed playbooks: the installed `stacknext-debugging` skill.
<!-- stacknext:end -->
EOF
fi
```

Do not run this against a file you have not read. If the file uses a different
structure, paste the block at the end manually.

## Client-specific files

| Client | Project instructions | Project skill location | Setup guide |
| --- | --- | --- | --- |
| OpenCode | `AGENTS.md` | `.opencode/skills/`, `.claude/skills/` or `.agents/skills/` | [opencode.md](opencode.md) |
| Codex | `AGENTS.md` | `.agents/skills/` | [codex.md](codex.md) |
| Claude Code | `CLAUDE.md` | `.claude/skills/` | [claude-code.md](claude-code.md) |
| Other MCP clients | Whatever file the client reads | Whatever path the client documents | [../mcp.md](../mcp.md) |

Other tools may use `.github/copilot-instructions.md`, `.cursor/rules/`,
`GEMINI.md` or a proprietary settings file. Use the same short block, but do not
assume the tool reads `AGENTS.md` or loads Agent Skills. If it does not, the MCP
tool descriptions and server instructions are still available.

## What not to put in instructions

- **Do not** tell the agent to bypass redaction, read `.stacknext/run.json`, or
  send the bearer token anywhere.
- **Do not** describe StackNext as production monitoring, Edge-compatible or a
  remote service.
- **Do not** claim that an error is always correlated to a trace. The fallback is
  route/method plus a 30-second window.
- **Do not** treat an `inconclusive` comparison as a pass, or describe a
  deterministic comparison as statistically significant.
- **Do not** add workflow details that duplicate the skill. Link to it instead.
