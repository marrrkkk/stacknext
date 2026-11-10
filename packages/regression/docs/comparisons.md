---
title: Comparisons
description: Deterministic median and threshold comparison, environment compatibility and inconclusive rules.
---

# Comparisons

## API

```ts
import { compareBaseline } from '@stacknext/regression'

const comparison = compareBaseline(baseline, candidateRun, {
  minSamples: 3,
  durationRegressionPct: 20,
  durationRegressionMs: 25,
  durationImprovementPct: 20,
  durationImprovementMs: 25,
  countRegressionMin: 1,
  ignoreEnvironment: false,
})
```

`compareBaseline(baseline, candidate, options?, meta?)` returns a
`Comparison`. Ids and timestamps are never used to match scenarios or traces;
matching uses stored stable keys.

## Defaults

`DEFAULT_COMPARISON_OPTIONS`:

| Option | Default |
| --- | --- |
| `minSamples` | 3 |
| `durationRegressionPct` | 20 |
| `durationRegressionMs` | 25 |
| `durationImprovementPct` | 20 |
| `durationImprovementMs` | 25 |
| `countRegressionMin` | 1 |
| `ignoreEnvironment` | false |

A duration change must cross both the percent and absolute threshold to be
classified. Medians reduce noise.

## Status and severity

Statuses: `improved`, `regressed`, `unchanged`, `inconclusive`.

Severity: `high`, `medium`, `low`, `none`, reported separately from status.

`inconclusive` is not a pass. It means the evidence cannot support a verdict.
`unchanged` means no configured threshold was crossed in this sample, not proof
that nothing changed. `improved` is not automatically good: fewer spans or
queries can mean missing instrumentation or skipped work.

## Why a comparison becomes inconclusive

- environment differences, unless `ignoreEnvironment` is set (a warning is still
  recorded);
- a candidate run that did not complete;
- incomplete or missing scenario correlation;
- fewer than `minSamples` verified samples per side;
- missing scenarios;
- variable trace shapes within one side or a changed trace key set;
- changed diagnostic rule-set versions;
- null database durations for a query-duration metric (unmeasured, not zero).

Environment facts include Node.js, Next.js, platform, architecture, runtime,
database adapters, instrumentation flags, verbose tracing, SDK version, rule-set
version and Playwright version.

## Metrics

Comparison metrics can be `duration`, `count`, `test-status`, `error` or
`finding` kinds. Evidence is bounded to 50 trace keys, 200 span keys, 100 query
keys, 100 finding keys and 1,000 metrics per scenario.

## What comparisons do not claim

- No statistical significance, confidence intervals, p-values or effect sizes.
- No causality.
- No source, SQL or index analysis.
- No automatic pass/fail unless the CLI `--fail-on` flag matches.

The full methodology is in
the repository `apps/docs/comparison-methodology.md`.
