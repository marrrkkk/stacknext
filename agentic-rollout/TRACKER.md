# Tracker: agent-native rollout

> Update this after every step. Legend: **Not started** → **In progress** →
> **Done** → **Shipped**. A step is only **Done** when its verification commands
> are recorded below and `git diff` has been reviewed. Never mark a check as
> passed without running it.

## Pre-flight

| Item | Status | Notes |
| --- | --- | --- |
| Land uncommitted dashboard performance work as its own commit | Done | Landed as `1b65468 perf(dashboard): coalesce live refresh and add combined overview read` on `fix/release-audit`. |

## Steps

| Step | Title | Size | Status | PR / commit | Started | Completed |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Trust foundation | S | Done | `68abef9` | 2026-11-18 | 2026-11-18 |
| 2 | Investigation brief | S | Not started | — | — | — |
| 3 | Agent sessions and audit | M | Not started | — | — | — |
| 4 | Evidence hand-off | S | Not started | — | — | — |
| 5 | Investigation cases | L | Not started | — | — | — |
| 6 | Verification | M/L | Not started | — | — | — |

## Step 1 — Trust foundation

- [x] Read `AGENTS.md`, `docs/architecture/boundaries.md`, `docs/testing/testing-strategy.md`, `packages/mcp/docs/tools.md`
- [x] `meta.trust` on every tool result path; detail tools included
- [x] Sanitizer added in core and applied at MCP boundary only
- [x] `SERVER_INSTRUCTIONS`, prompts, skill and public docs carry the warning
- [x] `store.revision` on `HealthResponse`, populated from `getHealth()`
- [x] `doctor` Agents group with additive `--json` fields
- [x] Injection, control-char, revision and doctor tests
- [x] Canonical docs + `CHANGELOG.md`; sync commands run
- [x] Full verification gate run and logged; `git diff` reviewed

## Step 2 — Investigation brief

- [ ] `get_investigation_brief` registered as read-only tool #21 with output schema
- [ ] Bounded arrays: 3 diagnostics, 3 errors, 3 slow requests; no stacks
- [ ] `meta.completeness` and revision present
- [ ] Tool docs, prompts/skill mention, `CHANGELOG.md`
- [ ] Full verification gate + `pnpm test:packages` run and logged

## Step 3 — Agent sessions and audit

- [ ] Local session id in `stacknext mcp`; headers via `client.forTool(name)`
- [ ] Bounded audit ring with drop counter; no query values or bodies
- [ ] `GET /api/agents`, `/api/agents/:id`, `?recordId=`; read auth unchanged
- [ ] Config `agents.audit` default true, documented opt-out
- [ ] Dashboard Agents nav, session list/timeline, read-by chips, stats
- [ ] Privacy docs + secret-leak tests in the same PR
- [ ] Full gate + `test:packages` + `test:e2e` + benchmark run and logged

## Step 4 — Evidence hand-off

- [ ] `packages/dashboard/src/evidence.ts` generator, ids only
- [ ] Copy buttons on five detail pages with untrusted-data warning
- [ ] Case command hint added after step 5
- [ ] Docs and `CHANGELOG.md`
- [ ] Full gate + `test:packages` + `test:e2e` run and logged

## Step 5 — Investigation cases

- [ ] `packages/core/src/cases.ts` schema v1, append-only event format
- [ ] `0700`/`0600`, atomic create, caps, redaction of notes and titles
- [ ] CLI `case new|add|list|show|close`, all `--json`
- [ ] `GET /api/cases`, `/api/cases/:id`; read-only auth
- [ ] MCP `list_cases`, `get_case` (#22–23) with docs and output schemas
- [ ] Dashboard `/cases`, `/cases/:id`, read-only, linked from records
- [ ] Full gate + `test:packages` + `test:e2e` + benchmark run and logged

## Step 6 — Verification

- [ ] Deterministic predicates in `packages/core/src/verify.ts`
- [ ] `stacknext verify` with result shape and exit codes 0/1/2 documented
- [ ] Case `verification` field and skill "verify the fix" workflow
- [ ] Redaction and no-data/ambiguous cases → `unverifiable`
- [ ] Full gate + `test:packages` + `test:e2e` + consumer smoke run and logged

## Verification log

Add one row per command run. Record the exact command and result. Include
"not run" rows when a check could not be performed.

| Date | Step | Command | Result | Notes |
| --- | --- | --- | --- | --- |
| 2026-11-18 | 0 | `git add … && git commit -m "perf(dashboard): …"` | pass | Pre-flight work landed as `1b65468`. |
| 2026-11-18 | 1 | `pnpm --filter @stacknext/core typecheck && pnpm --filter @stacknext/mcp typecheck && pnpm --filter @stacknext/cli typecheck` | pass after fix | `getRevision()` in the plan is `store.storeRevision` in code; corrected. |
| 2026-11-18 | 1 | `pnpm exec vitest run packages/core/test/redact.test.ts packages/mcp/test/mcp.test.ts packages/cli/test/collector.test.ts packages/cli/test/doctor.test.ts` | pass | 49 tests after fixing fixture shape and doctor runtime state. |
| 2026-11-18 | 1 | `pnpm lint` | pass | Clean. |
| 2026-11-18 | 1 | `pnpm typecheck` | pass | All 13 workspace projects. |
| 2026-11-18 | 1 | `pnpm test` | pass | 45 files, 367 tests. |
| 2026-11-18 | 1 | `pnpm build` | pass | All packages and apps. |
| 2026-11-18 | 1 | `pnpm check:docs` | pass | 141 Markdown files, 496 text files, 28 nav pages. |
| 2026-11-18 | 1 | `pnpm test:packages` | pass | StackNext 0.17.0, all 10 archives validated. |
| 2026-11-18 | 1 | `pnpm docs:sync && pnpm changelog:sync` | pass | Regenerated `packages/cli/docs/packages.md`; changelog already current. |
| 2026-11-18 | 1 | Redaction verification (seven secret strings) | pass | MCP injection test asserts all seven strings absent from tool output; collector tests assert `hunter2` absent from health/coverage/summary/errors. Full browser capture run not needed (no new captured field). |

## Decisions log

| Date | Decision | Source |
| --- | --- | --- |
| — | MCP read-only forever; CLI owns writes | User answer, master prompt section 2 |
| — | All six steps in scope, numeric order | User answer, master prompt section 2 |
| — | Agent audit on by default, local only | User answer, master prompt section 2 |
| — | Dashboard case pages read-only; pinning via CLI command | PLAN.md section 5 |
| — | No MCP `verify_claim` in v1 | PLAN.md section 5 |

## Blockers and open questions

| Item | Status | Notes |
| --- | --- | --- |
| In-dashboard case pinning (POST surface) | Deferred | Needs CSRF/auth review before adding |
| MCP-only clients needing `verify_claim` | Deferred | Add only with real client evidence |
| Default-on `init --agents` | Deferred | Separate compatibility discussion |
| Agent compatibility matrix for new clients | Not started | Update `docs/testing/agent-compatibility.md` only after e2e verification |

## Final review checklist (all steps done)

- [ ] `git diff` has no generated output, secrets, stale links or unrelated changes
- [ ] All canonical docs, navigation and `CHANGELOG.md` updated
- [ ] `pnpm docs:sync` / `pnpm changelog:sync` run where inputs changed
- [ ] Shared version bumped consistently across manifests and constants
- [ ] `stacknext dev` stopped with SIGINT/SIGTERM; no orphans on ports 4400–4425
