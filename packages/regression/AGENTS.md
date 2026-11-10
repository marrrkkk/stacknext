# AGENTS.md — @stacknext/regression

Scope: capture, baseline and comparison schemas plus local storage. Read the
root [`AGENTS.md`](../../AGENTS.md) first; repository-wide rules still apply.

## Boundary

This package owns the regression data model. It does not run Playwright, start
a collector, serve HTTP or contact a remote service. Playwright correlation
lives in `@stacknext/playwright`; the CLI writes records.

## Invariants

- A sample is verified only when the collector finds the injected trace id and
  a server span parented to the injected span id. Never add a time-window,
  nearest-request or synthetic fallback.
- Match scenarios by stable scenario id and traces/spans by normalized keys,
  never by ids or timestamps.
- Comparisons use medians and explicit thresholds. Statuses are `improved`,
  `regressed`, `unchanged` or `inconclusive`; severity is separate. Never claim
  statistical significance or causality.
- Ids are strict: `run-<16 hex>`, `base-<16 hex>`, `cmp-<16 hex>`,
  `scn-<16 hex>` and `smp-<16 hex>`.
- Records live under `.stacknext/{runs,baselines,comparisons}` with versioned
  schemas, `0700`/`0600` permissions, atomic writes and a 16 MiB cap. Never
  auto-delete, upload or silently overwrite a record.
- Bump the format or engine version when a schema changes. Keep old records
  readable or report them as invalid; never repair them silently.
- Environment differences must be reported before a comparison. Do not hide an
  inconclusive result.

## Verification

```bash
pnpm --filter @stacknext/regression typecheck
pnpm exec vitest run packages/regression/test
pnpm test
pnpm build
pnpm test:e2e
```

Update `docs/captures.md`, `docs/comparisons.md` or `docs/storage.md` and the
public regression pages when the data model or user-visible result changes.
