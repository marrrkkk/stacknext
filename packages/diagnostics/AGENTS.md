# AGENTS.md — @stacknext/diagnostics

Scope: the deterministic diagnostic engine. Read the root
[`AGENTS.md`](../../AGENTS.md) first; repository-wide rules still apply.

## Boundary

This package is a pure function over one bounded telemetry sample. It does not
read source files, call a model, run SQL or EXPLAIN, use the network, write
storage or serve HTTP. Do not add an AI provider, index advice, alerting or
long-term anomaly detection.

## Rules

- The six rule ids are stable: `n-plus-one-queries`, `slow-request`,
  `slow-span`, `repeated-external-http`, `error-fingerprint` and
  `server-error-response`.
- Finding ids and fingerprints must be deterministic. Evidence must stay
  bounded and re-sanitized before it leaves the engine.
- `possible` and `observed` are evidence, not confirmed root causes. Keep the
  status, completeness and limitations visible in every consumer.
- Rules and report envelopes live in `src/rules.ts`, `src/engine.ts`,
  `src/fingerprints.ts`, `src/classify.ts` and `src/trace.ts`. Wire types are in
  `@stacknext/core`.
- Bump the engine/rule-set version when rule behavior or output changes. Add
  tests for both a matching and a non-matching sample.
- A new rule or field is not complete until the CLI, dashboard, JSON export,
  MCP output and package docs agree.

## Verification

```bash
pnpm --filter @stacknext/diagnostics typecheck
pnpm exec vitest run packages/diagnostics/test
pnpm test
pnpm build
```

Update `docs/rules.md` or `docs/findings.md` when behavior changes, then run
`pnpm docs:sync` and `pnpm check:docs`.
