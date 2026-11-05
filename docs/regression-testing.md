# Runtime regression testing

StackNext 0.6 includes a local regression loop on top of the existing telemetry
sample. Playwright tests exercise the App Router; the optional StackNext
Playwright fixture correlates each browser scenario with the server traces it
produced; a capture run stores that evidence; a saved baseline and a later
candidate run are compared with deterministic rules.

This is not a performance benchmark, a statistical test, a screenshot diff or a
hosted CI service. It is a conservative, evidence-first record of what changed
between two local runs.

## What you get

- **Capture runs** — Playwright scenario identity, browser result, verified
  server traces, span/query/error evidence and environment facts.
- **Baselines** — immutable, saved snapshots of a completed capture run.
- **Comparisons** — deterministic baseline/candidate classification with
  per-scenario reasons, metrics, severity and environment differences.
- **Three access paths** — CLI, dashboard (`/runs`, `/baselines`,
  `/comparisons`) and six read-only MCP tools.
- **Report-only by default** — CI fails only when `--fail-on` matches.

Nothing is uploaded, and no model, hosted API, screenshot, video or Playwright
trace archive is involved. Records stay under the project's `.stacknext/`
directory.

## Requirements

- Next.js 15 or 16 App Router on the Node.js runtime, with StackNext
  instrumentation working.
- Node.js 20.9 or newer.
- `stacknext dev` running for the normal capture workflow.
- `@playwright/test` 1.40 or newer for the fixture package.
- Playwright browsers installed (`pnpm exec playwright install`).
- One Playwright worker while correlation is verified per request. Use
  `--workers=1`; do not enable parallel workers for captured runs.

The fixture is optional. Existing Playwright tests keep working without it, and
`playwright test` outside `stacknext capture` remains an ordinary browser test.

## Workflow

### 1. Start the app through StackNext

```bash
pnpm exec stacknext dev
```

This starts the loopback collector and the app. A capture attaches to the live
collector and uses its bearer token.

### 2. Instrument the scenarios

Add the fixture and a stable scenario annotation. See
[Playwright integration](playwright-integration.md) for the full setup.

```ts
import { stackNextFixtures } from '@stacknext/playwright'

const { test, expect } = stackNextFixtures()

test(
  'renders the project overview',
  { annotation: { type: 'stacknext.scenario', description: 'tasklight.overview' } },
  async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
  },
)
```

The explicit annotation is the preferred identity. Renaming the test or moving
the file does not create a new scenario; changing the annotation does.

### 3. Warm the routes

The first request to a route can emit one-time framework spans such as
`load route module`. Warm the app before capturing a baseline, or those spans
may appear only on one side and make the comparison inconclusive.

```bash
for path in / /projects/1 /api/n-plus-one; do
  curl -fsS -o /dev/null "http://127.0.0.1:4402$path"
done
```

### 4. Capture a baseline run

```bash
pnpm exec stacknext capture \
  --name "tasklight baseline" \
  --quiet --json \
  -- pnpm exec playwright test --workers=1 --repeat-each=3 \
  > baseline-capture.json
```

Use at least three samples per scenario. `--repeat-each=3` produces three
samples for each test and is the recommended starting point.

### 5. Save the baseline

```bash
RUN_ID=$(jq -r .run.id baseline-capture.json)
pnpm exec stacknext baseline save "$RUN_ID" --name "tasklight baseline" --json > baseline.json
BASELINE_ID=$(jq -r .baseline.id baseline.json)
```

Only a `completed` run with at least one verified sample can become a baseline.
A failed, interrupted or incomplete run is refused.

### 6. Change the app and capture a candidate

```bash
pnpm exec stacknext capture \
  --name "tasklight candidate" \
  --quiet --json \
  -- pnpm exec playwright test --workers=1 --repeat-each=3 \
  > candidate-capture.json

CANDIDATE_ID=$(jq -r .run.id candidate-capture.json)
```

A candidate may be failed or incomplete. It is still stored, but the comparison
will be inconclusive.

### 7. Compare

```bash
pnpm exec stacknext compare \
  "$BASELINE_ID" "$CANDIDATE_ID" \
  --json > comparison.json
```

`compare` saves the comparison under `.stacknext/comparisons/` by default. Use
`--no-save` for a dry run or `--fail-on regression` for CI.

Read [comparison methodology](comparison-methodology.md) before changing
thresholds or interpreting a verdict.

## Scenario identity

A scenario id is `scn-` plus a 16-character SHA-256 prefix. Identity is chosen
in this order:

1. an explicit `stacknext*` Playwright annotation description;
2. Playwright's stable test id;
3. file, title and project name.

The annotation value is hashed and sanitized; it is never used as a path or raw
id. Use a short, versioned name such as `tasklight.overview`. A changed
annotation is a new scenario and has no baseline.

Trace and span identities are also stable and id-free. They use normalized
method, route, span name, category, kind and Next.js span type. Numeric,
UUID-like, hex-like and long token-like path segments become `:id`. Trace ids,
span ids and timestamps are never matching keys.

## Correlation rules

The fixture injects a fresh W3C `traceparent` into browser document, fetch and
XHR requests to the app. The collector must return the trace and at least one
server span must name the injected span id as its parent. Only then is the
sample `verified`.

A sample is `incomplete` when a submitted trace is missing, has no spans or
does not prove that parent relationship. StackNext never fills the gap from a
time window or a "nearby" trace. Incomplete samples are stored and reported;
they force the affected comparison to `inconclusive`.

## Run status and exit codes

| Run status | Meaning |
| --- | --- |
| `running` | Collector registry has an active capture; this is not persisted as a final run. |
| `completed` | Child command succeeded, at least one sample was verified and no sample is incomplete. |
| `failed` | The child command exited non-zero or ended on a signal. |
| `interrupted` | `stacknext capture` received SIGINT/SIGTERM. |
| `incomplete` | Finalization failed, no verified telemetry arrived, or correlation was incomplete. |

`stacknext capture` preserves the child's exit code. If the child succeeds but
the saved run is not `completed`, it exits with code **3**. SIGINT maps to 130
and SIGTERM to 143. This makes "tests passed but telemetry was not captured" a
CI failure instead of a silent pass.

## Capture modes

Without `--url`, `capture` attaches to the project's live `stacknext dev`
runtime. If none is running, it starts an ephemeral loopback collector for the
duration of the child command. The child receives the collector URL, token and
run id in its environment, so a test command that starts the app itself can
still produce correlated telemetry. `--attach` refuses to fall back to an
ephemeral collector.

```bash
stacknext capture --attach -- pnpm exec playwright test --workers=1
stacknext capture --url http://127.0.0.1:4400 --token "$TOKEN" -- <command>
```

Use `--quiet --json` for machine-readable output. Child stdout is forwarded to
stderr in JSON mode so stdout stays valid JSON.

## Status and severity

Comparison statuses are:

| Status | Meaning |
| --- | --- |
| `regressed` | At least one metric crossed a regression threshold. |
| `improved` | No regression metric, at least one improvement, no blocking inconclusive evidence. |
| `unchanged` | No metric crossed a regression or improvement threshold and no blocking evidence. |
| `inconclusive` | Environment mismatch, incomplete minimum samples, missing scenario, unverified correlation, failed candidate or structural change prevents a verdict. |

`severity` is separate: `high`, `medium`, `low` or `none`. An `inconclusive`
result is not a pass. It means the evidence cannot support either outcome.

Comparisons are report-only unless `--fail-on regression` (or
`--fail-on inconclusive` / `any`) is used. There is no statistical significance
claim; see [comparison methodology](comparison-methodology.md).

## CLI reference

```bash
stacknext capture [--name <name>] [--project <name>] [--attach]
                 [--url <url> --token <token>] [--json] [--quiet]
                 -- <test command...>
stacknext runs list [--limit <n>] [--offset <n>] [--json]
stacknext runs show <run-id> [--json]
stacknext baseline save <run-id> --name <name> [--notes <text>] [--json]
stacknext baseline list [--limit <n>] [--offset <n>] [--json]
stacknext baseline show <baseline-id> [--json]
stacknext baseline remove <baseline-id> --yes [--json]
stacknext compare <baseline-id> <candidate-run-id> [--json]
                 [--min-samples <n>] [--ignore-environment]
                 [--duration-regression-pct <n>] [--duration-regression-ms <n>]
                 [--duration-improvement-pct <n>] [--duration-improvement-ms <n>]
                 [--count-regression-min <n>] [--fail-on regression|inconclusive|any]
                 [--no-save]
```

List and detail commands accept the strict ids `run-<16 hex>`,
`base-<16 hex>` and `cmp-<16 hex>`. Invalid ids fail before reading storage.
`baseline save` always creates a new baseline id. `--overwrite` is only an
explicit storage-layer collision override, not a replace-by-name or
replace-by-run flow. Deleting a baseline is a separate
`baseline remove --yes` operation.

## Storage

Records are written by the CLI, not by the collector:

```
.stacknext/
  .gitignore            # "*"
  runs/run-<id>.json
  baselines/base-<id>.json
  comparisons/cmp-<id>.json
```

Directories are created with mode `0700`; records use mode `0600`. Writes use a
temporary file and a hard link so a partial record is never visible. Existing
records are not overwritten unless the code path explicitly requests it. Each
record is capped at 16 MiB and validated with a strict versioned Zod schema on
read. Baselines are never deleted automatically. See [baselines](baselines.md)
for the lifecycle.

## Dashboard

The local dashboard serves:

| Route | Content |
| --- | --- |
| `/runs` | Capture history with status, environment, sample and correlation counts. A run is not a baseline. |
| `/runs/:id` | Scenario samples, verified traces, findings, warnings and limitations. |
| `/baselines` | Immutable reference snapshots and the runs they were copied from. |
| `/baselines/:id` | Baseline environment and captured scenarios. |
| `/comparisons` | Report-only baseline-to-candidate results with status, severity and summary. |
| `/comparisons/:id` | Per-scenario reasons, metrics and environment differences. |

The three list pages share a Capture → Baseline → Compare workflow strip so the
role of each record is visible before opening it. The dashboard reads the same
disk-backed records through the collector's loopback APIs. It does not compute
a second comparison.

## MCP

The six read-only regression tools keep the same output and metadata contract as
the existing tools:

- `stacknext_list_test_runs` / `stacknext_get_test_run`
- `stacknext_list_baselines` / `stacknext_get_baseline`
- `stacknext_list_comparisons` / `stacknext_get_comparison`

They accept bounded pagination or a validated id, and they return evidence with
warnings and limitations. They cannot capture, save, compare, delete or mutate
anything. See [MCP server](mcp.md) and the
[Agent Skill](../skills/stacknext-debugging/SKILL.md).

## Privacy

Capture stores only the same redacted evidence used elsewhere: scenario titles,
files, routes, span names, redacted error text, normalized SQL shapes, timings,
findings and sanitized environment facts. Command arguments are redacted and
local account paths are shortened to `~`. Request/response bodies, headers,
cookies, URL query values and SQL bind parameters are still never captured.
Playwright screenshots, videos and trace archives are not read or stored.

Regression records are local files, not in-memory telemetry. Review a record
before sharing it; see [privacy](privacy.md).

## Limitations

- Playwright is the only supported scenario runner. Sequential workers are
  required until parallel correlation has been verified.
- A capture is tied to one local app and collector. There is no distributed
  tracing, remote runner or hosted history.
- Comparisons use medians and explicit thresholds. They are not statistical
  significance tests and do not prove causality.
- Null durations remain unmeasured. Drizzle query durations cannot be compared
  as if they were zero.
- Environment differences force `inconclusive` by default. Compare baselines
  from the same Node.js, Next.js, OS, database and instrumentation setup.
- Record retention is manual. Runs, baselines and comparisons are never pruned.
- `capture` records telemetry only for requests the fixture or other capture
  code submits. Browser activity without the fixture is not correlated.
- Playwright retries and `repeat-each` are recorded, but retries are not a
  substitute for stable scenarios. Prefer deterministic tests and a fixed
  sample count.

## Related documentation

- [Playwright integration](playwright-integration.md)
- [Baselines](baselines.md)
- [Comparison methodology](comparison-methodology.md)
- [CI integration](ci-integration.md)
- [MCP server](mcp.md)
- [Privacy and redaction](privacy.md)
- [Limitations](limitations.md)
