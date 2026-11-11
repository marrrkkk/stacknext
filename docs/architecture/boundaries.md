# Architecture boundaries

These invariants keep the runtime, privacy and evidence model consistent. They
are part of review. If a change crosses one, stop and document the decision
before proceeding.

## Local-only network

- Bind the collector to `127.0.0.1` or `localhost`; reject other hosts.
- Ingestion requires the bearer token.
- Read APIs and SSE accept the bearer token or the dashboard session cookie.
- Keep Host, Origin and `Sec-Fetch-Site` checks, CSP and security headers.
- There is no remote transport, managed container runtime or cloud service.

Enforced in `packages/cli/src/collector/server.ts` and covered by collector and
e2e tests. Tokens live in `.stacknext/run.json` with mode `0600`.

## Native-only runtime

The collector, dashboard and CLI run in one Node process started by
`stacknext dev`. Do not add a `runtime.mode` field, `--docker`/`--native`
flags, a managed container runtime or a `stop` command. See
[ADR 0001](../decisions/0001-native-only-runtime.md).

## Validate at the boundary

Every ingest envelope is Zod-validated, body size is capped, and counts are
bounded before entering the store. Validate external data with Zod and use the
inferred types. Do not pass raw JSON or `any` into the store, dashboard, MCP or
regression layer.

## Bounded memory

The store is in memory with capacity and retention limits and drop counters.
Instrumentation must never block a request on network I/O. Keep transport
queues bounded, batch on a timer, and preserve the drop counters in health,
status and summary output.

## Two-layer redaction

Redact in the app process before enqueueing and again in the collector before
storing. A new captured field is not done until:

1. the app-side redaction and normalization paths handle it;
2. the collector-side redaction handles it again;
3. `apps/docs/privacy.mdx` and the package privacy docs describe it;
4. tests assert the secret does not appear in API, export, regression,
   comparison, snapshot or MCP output.

Never capture request/response bodies, headers, cookies, URL query values or
fragments, SQL bind parameters, Playwright screenshots/videos/traces or
machine/user identifiers.

## Coverage is evidence, not a score

Coverage statuses come from the current store sample plus collector
config/connection state. Never invent a composite percentage or treat
`not-observed`/`unknown` as proof that a feature is broken. Keep the sample
window and item limitations visible in CLI, dashboard and MCP.

## Diagnostics are deterministic evidence

The six rules are conservative heuristics over the current store sample. Keep
finding ids deterministic, evidence bounded and re-sanitized, and expose the
same report through CLI, dashboard, export, MCP and the Agent Skill. Never
present `possible` or `observed` as a confirmed root cause. No LLM/AI provider,
source edits, SQL or EXPLAIN execution, index advice, alerting or long-term
anomaly detection.

## Regression evidence is proven, not guessed

A Playwright sample is verified only when the collector finds the injected
trace id and a server span parented to the injected span id. Never fall back to
a time window, nearest request or synthetic sample. Ambiguous correlation
becomes `incomplete` and forces the affected comparison to `inconclusive`.

Comparisons match scenarios by stable scenario id and traces/spans by
normalized keys, never by ids or timestamps. Use medians and explicit
thresholds; never claim statistical significance or causality. Report
`improved`, `regressed`, `unchanged` or `inconclusive` with severity
separately. `--fail-on` is the only CI gate.

## Regression storage is local and immutable

Write runs, baselines and comparisons under
`.stacknext/{runs,baselines,comparisons}` with strict versioned schemas,
`0700`/`0600` permissions, atomic writes and a 16 MiB cap. Never auto-delete,
never upload, and never overwrite an existing record without an explicit
overwrite request. Keep invalid ids and incomplete records visible rather than
repairing them.

## Snapshots are frozen, redacted evidence

A snapshot is a versioned copy of one sample under `.stacknext/snapshots`,
never a replay into the live store. Save manually, on graceful exit and on the
first error with a 60-second cooldown; rotate only automatic snapshots beyond
`snapshots.autoKeep` (default 10). Manual and imported snapshots are never
auto-deleted. Write atomically with `0700`/`0600` permissions, refuse implicit
overwrite, cap each snapshot at `snapshots.maxBytes` (default 64 MiB) and fail
oversized saves instead of truncating. Re-normalize and re-redact imports.
Snapshot reads use a detached store and carry no live diagnostics or coverage.

## Read-only MCP

All tools stay `readOnlyHint: true`; the API client only performs GETs and
refuses non-loopback URLs. stdout is protocol-only. Prompts and the Agent Skill
shape investigations but cannot add capabilities, mutate data or bypass
redaction. Keep tool names and arguments stable; response metadata is additive.
The six regression tools read runs, baselines and comparisons only, and the
three snapshot tools read snapshots only.

## Playwright stays optional and sequential

`@stacknext/playwright` must be inert outside an active capture run and must not
replace Playwright or change assertions. Use one worker for captured runs until
parallel correlation is explicitly verified. Prefer the explicit
`stacknext.scenario` annotation for identity; never use time windows to link
browser and server activity.

## Supported surface only

Next.js 15/16 App Router on the Node.js runtime. Do not patch undocumented
Next.js internals and do not claim Edge or production support. Keep the
documented span allowlist in `packages/core/src/framework.ts` aligned with the
supported versions and retain unknown span types as verbose evidence.

## Manual helpers stay optional

`withStackNextSpan`, `withStackNextSpanSync` and `withStackNextAction` use the
existing OpenTelemetry context/provider, preserve return values and errors,
sanitize attributes, and must not create a second SDK. Never claim automatic
Server Component or Server Action tracing.

## Verification

Run the checks in [testing strategy](../testing/testing-strategy.md). For
captured-data changes, verify the example error route still redacts
`demo-url-secret`, `super-secret-demo-token` and `hunter2`, and that action and
custom-span attributes do not leak `action-attribute-secret`,
`custom-attribute-secret`, `custom-url-secret` or `e2e-url-secret`.

## Related

- [Architecture overview](overview.md)
- [Package architecture](packages.md)
- [Public core concepts](../../apps/docs/overview/core-concepts.mdx)
- [Privacy and security rules](../../AGENTS.md#privacy-and-security)
