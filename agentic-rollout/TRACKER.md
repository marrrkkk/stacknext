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
| 1 | Trust foundation | S | Done | `6742052` | 2026-11-18 | 2026-11-18 |
| 2 | Investigation brief | S | Done | `9eac026` | 2026-11-18 | 2026-11-18 |
| 3 | Agent sessions and audit | M | Done | `7137991` | 2026-11-18 | 2026-11-19 |
| 4 | Evidence hand-off | S | Done | `6101d69` | 2026-11-19 | 2026-11-19 |
| 5 | Investigation cases | L | Done | `40582ae` | 2026-11-19 | 2026-11-19 |
| 6 | Verification | M/L | Done | `b628837` | 2026-11-19 | 2026-11-19 |

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

- [x] `get_investigation_brief` registered as read-only tool #21 with output schema
- [x] Bounded arrays: 3 diagnostics, 3 errors, 3 slow requests; no stacks
- [x] `meta.completeness` and revision present
- [x] Tool docs, prompts/skill mention, `CHANGELOG.md`
- [x] Full verification gate + `pnpm test:packages` run and logged

## Step 3 — Agent sessions and audit

- [x] Local session id in `stacknext mcp`; headers via `client.forTool(name)`
- [x] Bounded audit ring with drop counter; no query values or bodies
- [x] `GET /api/agents`, `/api/agents/:id`, `?recordId=`; read auth unchanged
- [x] Config `agents.audit` default true, documented opt-out
- [x] Dashboard Agents nav, session list/timeline, read-by chips, stats
- [x] Privacy docs + secret-leak tests in the same PR
- [x] Full gate + `test:packages` + `test:e2e` + benchmark run and logged

## Step 4 — Evidence hand-off

- [x] `packages/dashboard/src/evidence.ts` generator, ids only
- [x] Copy buttons on five detail pages with untrusted-data warning
- [x] Case command hint added after step 5
- [x] Docs and `CHANGELOG.md`
- [x] Full gate + `test:packages` + `test:e2e` run and logged

## Step 5 — Investigation cases

- [x] `packages/core/src/cases.ts` schema v1, append-only event format
- [x] `0700`/`0600`, atomic create, caps, redaction of notes and titles
- [x] CLI `case new|add|list|show|close`, all `--json`
- [x] `GET /api/cases`, `/api/cases/:id`; read-only auth
- [x] MCP `list_cases`, `get_case` (#22–23) with docs and output schemas
- [x] Dashboard `/cases`, `/cases/:id`, read-only, linked from records
- [x] Full gate + `test:packages` + `test:e2e` + benchmark run and logged

## Step 6 — Verification

- [x] Deterministic predicates in `packages/core/src/verify.ts`
- [x] `stacknext verify` with result shape and exit codes 0/1/2 documented
- [x] Case `verification` field and skill "verify the fix" workflow
- [x] Redaction and no-data/ambiguous cases → `unverifiable`
- [x] Full gate + `test:packages` + `test:e2e` + consumer smoke run and logged

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
| 2026-11-18 | 2 | `pnpm exec vitest run packages/mcp/test/mcp.test.ts packages/cli/test/doctor.test.ts` | pass | 28 tests including populated, empty and over-cap brief fixtures. |
| 2026-11-18 | 2 | `pnpm lint` | pass | Clean. |
| 2026-11-18 | 2 | `pnpm typecheck` | pass after fix | Test casts updated for `unknown` payload fields. |
| 2026-11-18 | 2 | `pnpm test` | pass | 45 files, 370 tests. |
| 2026-11-18 | 2 | `pnpm build` | pass | All packages and apps. |
| 2026-11-18 | 2 | `pnpm check:docs` | pass | Docs and changelog current. |
| 2026-11-18 | 2 | `pnpm test:packages` | pass | `@stacknext/mcp` archive now 50.6 KiB; all 10 archives valid. |
| 2026-11-19 | 3 | `pnpm exec vitest run packages/mcp/test/mcp.test.ts packages/cli/test/collector.test.ts packages/cli/test/agent-activity.test.ts` | pass after fix | 48 tests. `--check` sends no attribution after gating the tool header on a session; fetch headers cannot contain bidi characters, so control-char sanitization is covered by the store unit test. |
| 2026-11-19 | 3 | `pnpm lint` | pass after fix | Removed two unused type imports. |
| 2026-11-19 | 3 | `pnpm typecheck` | pass | All 13 workspace projects. |
| 2026-11-19 | 3 | `pnpm test` | pass | 46 files, 381 tests. |
| 2026-11-19 | 3 | `pnpm build` | pass | All packages and apps; new `AgentsPage` and `ReadByAgents` chunks remain small. |
| 2026-11-19 | 3 | `pnpm check:docs` | pass | 141 Markdown files, 500 text files. |
| 2026-11-19 | 3 | `pnpm test:packages` | pass | All 10 archives valid; dashboard 312.3 KiB, CLI 157.4 KiB. |
| 2026-11-19 | 3 | `pnpm test:e2e` | pass | 45 checks including 21 read-only tools, brief trust/revision, attributed MCP reads with no secrets, and `/agents` deep link. |
| 2026-11-19 | 3 | Port check after e2e | pass | No listeners on 4400-4429; no `apps/example/.stacknext/run.json` left behind. |
| 2026-11-19 | 3 | `pnpm benchmark:dashboard -- --enforce` | pass | Initial JS 118.7 KiB gzip (budget 121), all enforced budgets passed. |
| 2026-11-19 | 3 | Redaction verification (seven secret strings) | pass | Collector secret-leak test injected `q=demo-url-secret` plus Bearer token and asserted all seven strings absent from `/api/agents`; e2e asserts all seven absent from the live agent audit. |
| 2026-11-19 | 4 | `pnpm exec vitest run packages/dashboard/test/evidence.test.ts` | pass | 8 tests covering all five kinds, id rejection, bound and secret strings. |
| 2026-11-19 | 4 | `pnpm lint` | pass | Clean. |
| 2026-11-19 | 4 | `pnpm typecheck` | pass | All 13 workspace projects. |
| 2026-11-19 | 4 | `pnpm test` | pass | 47 files, 389 tests. |
| 2026-11-19 | 4 | `pnpm build` | pass | All packages and apps. |
| 2026-11-19 | 4 | `pnpm check:docs` | pass | 141 Markdown files, 502 text files. |
| 2026-11-19 | 4 | `pnpm test:packages` | pass | All 10 archives valid. |
| 2026-11-19 | 4 | `pnpm test:e2e` | pass | 46 checks including browser clipboard assertion that the copied prompt names `stacknext_get_diagnostic`, the finding id and the untrusted-data warning with no client error. |
| 2026-11-19 | 4 | Port check after e2e | pass | No listeners on 4400-4429. |
| 2026-11-19 | 5 | `pnpm exec vitest run packages/core/test/cases.test.ts packages/cli/test/case-commands.test.ts packages/mcp/test/mcp.test.ts` | pass after fix | 31 tests; fixed ESM `.js` import, typed event param and JSON capture in tests. |
| 2026-11-19 | 5 | `pnpm lint` | pass after fix | `prefer-const` in a test. |
| 2026-11-19 | 5 | `pnpm typecheck` | pass | All 13 workspace projects. |
| 2026-11-19 | 5 | `pnpm test` | pass | 49 files, 395 tests. |
| 2026-11-19 | 5 | `pnpm build` | pass | All packages and apps; new `CasesPage` and `CaseDetailPage` chunks. |
| 2026-11-19 | 5 | `pnpm check:docs` | pass | 141 Markdown files, 509 text files. |
| 2026-11-19 | 5 | `pnpm test:packages` | pass | All 10 archives valid. |
| 2026-11-19 | 5 | `pnpm test:e2e` | pass | 48 checks including CLI case round-trip, collector case detail, `list_cases`/`get_case` with trust metadata, and `/cases` deep links. |
| 2026-11-19 | 5 | Port check after e2e | pass | No listeners on 4400-4429. |
| 2026-11-19 | 5 | `pnpm benchmark:dashboard -- --enforce` | pass | Initial JS 119.6 KiB gzip (budget 121), all enforced budgets passed. |
| 2026-11-19 | 5 | Redaction verification (seven secret strings) | pass | CLI case test asserts title/hypothesis secrets are redacted; e2e asserts all seven absent from case files and collector case detail. |
| 2026-11-19 | 6 | `pnpm exec vitest run packages/core/test/verify.test.ts packages/cli/test/verify.test.ts` | pass after fix | 9 tests; fixed trace-id correlation in fixtures, 404 handling and `--case` arg loading. |
| 2026-11-19 | 6 | `pnpm lint` | pass | Clean. |
| 2026-11-19 | 6 | `pnpm typecheck` | pass | All 13 workspace projects. |
| 2026-11-19 | 6 | `pnpm test` | pass | 51 files, 404 tests. |
| 2026-11-19 | 6 | `pnpm build` | pass | All packages and apps. |
| 2026-11-19 | 6 | `pnpm check:docs` | pass | 141 Markdown files, 513 text files. |
| 2026-11-19 | 6 | `pnpm test:packages` | pass | All 10 archives valid. |
| 2026-11-19 | 6 | `pnpm test:e2e` | pass on third run | First two runs had flaky example-app scenario timeouts (a 30 s `waitForResponse` and a seeded-task visibility timeout) that retried successfully; third run passed all 49 checks including supported/contradicted/unverifiable verify exit codes. No product code was changed between runs. |
| 2026-11-19 | 6 | Port check after e2e | pass | No listeners on 4400-4429. |
| 2026-11-19 | 6 | `pnpm test:consumer --next 16.4.3 --pm npm --skip-build` | pass after fix | Updated consumer tool count to 23; handshake now reports 23 read-only tools and 5 prompts. |

## Decisions log

| Date | Decision | Source |
| --- | --- | --- |
| — | MCP read-only forever; CLI owns writes | User answer, master prompt section 2 |
| — | All six steps in scope, numeric order | User answer, master prompt section 2 |
| — | Agent audit on by default, local only | User answer, master prompt section 2 |
| — | Dashboard case pages read-only; pinning via CLI command | PLAN.md section 5 |
| — | No MCP `verify_claim` in v1 | PLAN.md section 5 |
| 2026-11-19 | Dashboard case pinning stays a copyable CLI command | Step 5 prompt; no POST surface added |
| 2026-11-19 | MCP-only verification client deferred until evidence of need | Step 6 prompt; `verify` lives in the CLI |
| 2026-11-19 | Default-on `init --agents` deferred to a separate compatibility discussion | Master prompt non-goals |

## Blockers and open questions

| Item | Status | Notes |
| --- | --- | --- |
| In-dashboard case pinning (POST surface) | Deferred | Needs CSRF/auth review before adding |
| MCP-only clients needing `verify_claim` | Deferred | Add only with real client evidence |
| Default-on `init --agents` | Deferred | Separate compatibility discussion |
| Agent compatibility matrix for new clients | Not started | Update `docs/testing/agent-compatibility.md` only after e2e verification |

## Final review checklist (all steps done)

- [x] `git diff` has no generated output, secrets, stale links or unrelated changes
- [x] All canonical docs, navigation and `CHANGELOG.md` updated
- [x] `pnpm docs:sync` / `pnpm changelog:sync` run where inputs changed
- [x] Shared version bumped consistently across manifests and constants (0.16.0 → 0.17.0)
- [x] `stacknext dev` stopped with SIGINT/SIGTERM; no orphans on ports 4400–4425
- [x] MCP annotations remain read-only for all 23 tools
- [x] Redaction verification passed for steps 1, 3 and 5
- [x] Deferred items recorded in the tracker decisions log
