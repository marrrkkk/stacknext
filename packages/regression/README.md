# @stacknext/regression

Versioned capture-run, baseline and comparison schemas plus deterministic
comparison logic for [StackNext](https://github.com/marrrkkk/stacknext).

Playwright-linked samples are compared using medians and explicit thresholds.
Statuses are `improved`, `regressed`, `unchanged` or `inconclusive`; comparisons
are not statistical tests and do not prove causality. Records are redacted
local JSON files under `.stacknext`.

```bash
npm install --save-dev @stacknext/cli @stacknext/next @stacknext/playwright
npx stacknext capture --name baseline -- npx playwright test --workers=1
```

This package is normally consumed through the CLI and the optional Playwright
fixture. It does not run Playwright, start a collector or contact a remote
service.

## Main concepts

| Concept | Purpose |
| --- | --- |
| `scenarioIdentity` | Stable `scn-...` id from an explicit annotation, test id or file/title/project fallback. |
| `verifyTraceCorrelation` | Accepts a sample only when the injected trace and a server span parented to the injected span exist. |
| `buildEnvironmentSnapshot` | Records Node.js, Next.js, OS, runtime, adapters, instrumentation, rule set and Playwright versions. |
| `compareEnvironments` | Lists environment differences before a comparison. |
| `compareBaseline` | Deterministic median/threshold comparison of a baseline and candidate. |
| `saveRun` / `saveBaseline` / `saveComparison` | Atomic local writes under `.stacknext`. |

Ids are strict: `run-<16 hex>`, `base-<16 hex>`, `cmp-<16 hex>`,
`scn-<16 hex>` and `smp-<16 hex>`.

## Storage

Runs, baselines and comparisons live under
`.stacknext/{runs,baselines,comparisons}` with strict versioned schemas,
`0700`/`0600` permissions, atomic writes and a 16 MiB cap. Records are never
auto-deleted and are never uploaded.

## Documentation

- [Package overview](docs/index.md)
- [Captures](docs/captures.md)
- [Comparisons](docs/comparisons.md)
- [Storage](docs/storage.md)

The `docs/` directory ships in the npm archive. Public guides live on the
[documentation site](https://stack-next.mintlify.site).

## AI agents

Agents should read `docs/comparisons.md` before explaining a result. Never
present a comparison as a statistical test or a confirmed cause. Report
`inconclusive` as inconclusive, and cite the environment differences and
correlation reasons.

## Development

```bash
pnpm --filter @stacknext/regression build
pnpm --filter @stacknext/regression typecheck
pnpm test
```

The package is ESM-only and requires Node.js 20.9 or newer.

License: MIT.
