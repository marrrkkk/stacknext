---
title: Runtime regression workflow
description: Capture a Playwright run, save an immutable baseline and compare a later candidate deterministically.
---

StackNext links Playwright scenarios to the server traces they produced, saves
verified samples as local records and compares a later run against a baseline.
It is report-only unless `--fail-on` is used.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:a77bfa337901f7fdd7def7b125f917412ac3e47f1efe7fbf8da10fa813de499a -->

## Prerequisites

- A working StackNext collector and instrumented app.
- `@stacknext/playwright` installed. Ordinary Playwright capture tests must
  import `test` from `@stacknext/playwright` so the fixture submits samples; see
  [fixture setup](../playwright-integration#use-the-fixture-and-annotation).
- Annotated scenarios with stable ids. The explicit `stacknext.scenario`
  annotation is preferred.
- One Playwright worker for captured runs. Parallel correlation is not verified.
- At least three samples for a meaningful comparison, and warm `/`, `/projects/1`
  and `/api/n-plus-one` before capturing a baseline in the example app.

<!-- /coderabbit-ai-generated:v1 -->

## Capture, save, compare

```bash
pnpm exec stacknext capture --name "before" \
  -- pnpm exec playwright test --workers=1 --repeat-each=3

pnpm exec stacknext baseline save <run-id> --name "main"
pnpm exec stacknext compare <baseline-id> <candidate-run-id>
```

Use `--json` for machine-readable output and `--fail-on regression` (or
`inconclusive` / `any`) as the only CI gate.

## Verified correlation

A sample is `verified` only when the collector found the injected trace id and
a server span parented to the injected span id. StackNext never falls back to a
time window, nearest request or synthetic sample. An ambiguous sample is
`incomplete` and forces the affected comparison to `inconclusive`.

## Result semantics

| Status | Meaning |
| --- | --- |
| `improved` | The candidate crossed a threshold in the better direction |
| `regressed` | The candidate crossed a threshold in the worse direction |
| `unchanged` | No metric crossed its threshold |
| `inconclusive` | Evidence or environment was insufficient |

Severity is reported separately. A comparison is not a statistical test and
does not establish causality. `inconclusive` is not a pass.

## Storage

Records live under `.stacknext/{runs,baselines,comparisons}` with strict
versioned schemas, `0700`/`0600` permissions, atomic writes and a 16 MiB cap.
StackNext never auto-deletes them and never uploads them.

## Related

- [Runtime regression testing](../regression-testing)
- [Playwright integration](../playwright-integration)
- [Baselines](../baselines)
- [Comparison methodology](../comparison-methodology)
- [CI integration](../ci-integration)
