---
title: "@stacknext/diagnostics"
description: Deterministic, evidence-backed diagnostic rules over a StackNext telemetry sample.
---

# @stacknext/diagnostics

`@stacknext/diagnostics` turns one bounded telemetry sample into deterministic
findings. It implements fingerprinting, rule evaluation, report filtering and
the overview/detail shapes used by the CLI, dashboard and MCP server.

## Who should read this

Maintainers and advanced contributors. This is an **internal implementation
package**: applications do not install it directly. It is a dependency of
`@stacknext/cli`, `@stacknext/regression` and `@stacknext/mcp`.

## Package boundary

`diagnostics` depends on `@stacknext/core`. It does not read source files, run
SQL or EXPLAIN, call an AI provider, write storage or expose an HTTP server.
The caller provides a snapshot of the current sample and its config.

## Public API

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:229f05792b12cd2c7b8ecfd7ca0dd7a43169429e4dafaf6f3a989b137a4d9d1d -->

```ts
import {
  generateDiagnosticReport,
  listDiagnosticFindings,
  getDiagnosticDetail,
  diagnosticOverview,
  evaluateDiagnosticRules,
  DIAGNOSTICS_ENGINE_VERSION,
} from '@stacknext/diagnostics'
import {
  DIAGNOSTIC_RULES,
  STACKNEXT_DIAGNOSTICS_FORMAT,
  STACKNEXT_DIAGNOSTICS_FORMAT_VERSION,
  STACKNEXT_DIAGNOSTICS_RULE_SET_VERSION,
} from '@stacknext/core'
```

<!-- /coderabbit-ai-generated:v1 -->

| Function | Purpose |
| --- | --- |
| `generateDiagnosticReport(snapshot, options)` | Runs enabled rules and returns a bounded `DiagnosticReport`. |
| `evaluateDiagnosticRules(context)` | Runs the six rules without building the report envelope. |
| `listDiagnosticFindings(report, filters?)` | Applies category/severity/status/rule/route/trace/time/search filters and pagination. |
| `getDiagnosticDetail(report, id, snapshot)` | Returns one finding and a bounded related trace. |
| `diagnosticOverview(report, topLimit?)` | Returns counts and the top findings for the dashboard/MCP summary. |

Fingerprint and classification helpers are also exported for tests and custom
tooling. See the installed TypeScript declarations for the complete list.

## Usage

```ts
const report = generateDiagnosticReport(
  {
    spans,
    errors,
    databaseQueries,
    requestTraces,
    missingParentSpanIds,
  },
  {
    projectName: 'my-app',
    collectorVersion: '<installed-version>',
    config,
    slowRequestMs: 500,
  },
)

const page = listDiagnosticFindings(report, {
  category: 'database',
  severity: 'warning',
  limit: 20,
})
```

`DiagnosticSnapshot` is the current sample, not storage. The engine reads only
what the caller passes and does not mutate it.

## Engine versions

- `STACKNEXT_DIAGNOSTICS_FORMAT` — `stacknext-diagnostics`.
- `STACKNEXT_DIAGNOSTICS_FORMAT_VERSION` — `1`.
- `STACKNEXT_DIAGNOSTICS_RULE_SET_VERSION` — `2`.
- `DIAGNOSTICS_ENGINE_VERSION` — the installed package version.

Regression comparisons consider the rule-set version part of the environment.
A mismatch makes a comparison inconclusive by default.

## Required reasoning

Findings are conservative heuristics, not confirmed root causes:

- `possible` means the pattern is consistent with a problem.
- `observed` means the measurement exists.
- `insufficient-evidence` means the sample cannot support a conclusion.

Never present a finding as proof of why the application behaves a certain way.
Read the evidence, verification steps and limitations.

## Documentation map

- [Rules](rules.md) — the six rules, thresholds and exclusions.
- [Findings](findings.md) — report shape, evidence fields and limits.
