---
title: Captures and baselines
description: Test run, scenario and sample correlation model, statuses and baseline rules.
---

# Captures and baselines

## Test run lifecycle

A run is created by the collector when `stacknext capture` starts a child test
command. The CLI passes the collector URL, token, run id and capture flag to the
child environment. The Playwright fixture submits each scenario sample. On exit,
the CLI completes the run and saves it under `.stacknext/runs`.

`TestRun` statuses:

| Status | Meaning |
| --- | --- |
| `running` | Registry record is still live. |
| `completed` | The child exited successfully and telemetry is complete. |
| `failed` | The child command failed. |
| `interrupted` | The child received a signal. |
| `incomplete` | Finalization failed or required telemetry is missing. |

Only a `completed` run with verified samples can become a baseline. A failed or
incomplete run remains readable but supports no regression verdict.

## Scenario identity

`scenarioIdentity()` prefers, in order:

1. an explicit `stacknext.scenario` annotation;
2. the Playwright `testId`;
3. file + title + project.

Changing the annotation creates a new scenario with no matching baseline.

Captured runs use one Playwright worker. Parallel correlation is not verified.

## Samples and correlation

Each sample records the Playwright status, expected status, retry index, repeat
index, duration and capture time.

A trace reference is `verified` only when the collector:

1. finds the injected trace id; and
2. finds a server span whose parent is the injected span id.

There is no time-window, nearest-request or synthetic fallback. If correlation
is ambiguous, the sample is `incomplete` with a reason such as
`trace-not-found`, `injected-parent-not-found` or `no-request-trace-recorded`.
Incomplete samples make the affected comparison inconclusive.

Samples are capped at 100 per scenario, 20 traces per sample, and 500 spans,
200 queries and 100 errors per captured trace.

## Baselines

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:82f70de6927a543f3381425f6ccfd4279d9449b3dc78859c33e5b620c80a7527 -->

Convert a completed run with `baselineFromRun(run, { name })`, then pass the
resulting `Baseline` to `saveBaseline(projectDir, baseline)` to persist the
immutable record. A baseline contains:

<!-- /coderabbit-ai-generated:v1 -->

- `sourceRunId`, project name, scenario identities and samples;
- verified trace/query/error evidence;
- deterministic diagnostic finding references;
- environment snapshot;
- stats, notes and limitations.

A baseline does not follow later telemetry or application changes. It is never
auto-deleted. `stacknext baseline remove <id> --yes` is the explicit removal
path.

## Commands

```bash
stacknext capture --name baseline --quiet --json \
  -- pnpm exec playwright test --workers=1 --repeat-each=3 > baseline.json
stacknext baseline save <run-id> --name baseline
stacknext capture --name candidate --quiet --json \
  -- pnpm exec playwright test --workers=1 --repeat-each=3 > candidate.json
stacknext compare <baseline-id> <candidate-run-id> --fail-on regression
```

See the repository `docs/regression-testing.md` and
`@stacknext/playwright/docs/index.md`.
