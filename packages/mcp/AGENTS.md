# AGENTS.md — @stacknext/mcp

Scope: the read-only stdio MCP server. Read the root
[`AGENTS.md`](../../AGENTS.md) first; repository-wide rules still apply.

## Boundary

The server reads the local collector API and saved records. It never captures,
saves, compares, imports, deletes or edits anything. The API client performs
GET requests only and refuses non-loopback URLs. stdout is reserved for MCP
protocol messages; logs go to stderr.

## Compatibility surface

- Keep the twenty tool names, argument schemas and `readOnlyHint: true`
  annotations stable. Response metadata and output fields may be added.
- Keep the five guided prompts and the Agent Skill aligned with the same
  evidence-first workflows. Prompts cannot add capabilities or bypass
  redaction.
- The six regression tools read runs, baselines and comparisons only. The
  three snapshot tools list/read snapshots and one scoped trace; they never
  create, import, rotate or delete.
- Treat `meta.completeness`, `meta.connection` and pagination metadata as part
  of the output contract. Never present diagnostics or comparisons as
  confirmed causes.
- Do not embed a collector, run diagnostics in-process, write files or add a
  remote transport/proxy.
- `src/server.ts` owns registration; `src/client.ts` owns HTTP access;
  `src/schemas.ts` owns output schemas. Update all three together.

## Verification

```bash
pnpm --filter @stacknext/mcp typecheck
pnpm exec vitest run packages/mcp/test
pnpm test
pnpm build
pnpm test:e2e
pnpm test:packages
```

Update `docs/tools.md`, `docs/prompts.md` or `docs/security.md` and the public
MCP pages when the surface changes. The skill test also verifies the recorded
agent compatibility document.
