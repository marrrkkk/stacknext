# Comparison methodology

A StackNext comparison is a deterministic classification of a saved baseline
and a candidate capture run. It uses stable keys, medians over verified samples
and explicit thresholds. It is not a benchmark suite, a statistical test or a
causal analysis.

The same comparison is produced by `stacknext compare`, the dashboard and the
read-only MCP tools. There is no second algorithm in the dashboard or MCP
server.

## Inputs

| Input | Role |
| --- | --- |
| Baseline | Immutable snapshot saved from a `completed` capture run. |
| Candidate | A capture run, normally from the same Playwright scenarios. It may be `completed`, `failed`, `interrupted` or `incomplete`. |
| Options | Sample minimum, duration thresholds, count threshold and environment override. |

Comparison defaults:

| Option | Default | Valid range |
| --- | --- | --- |
| `minSamples` | 3 | 1-100 |
| `durationRegressionPct` | 20 | 0-10,000 |
| `durationRegressionMs` | 25 | 0-600,000 |
| `durationImprovementPct` | 20 | 0-10,000 |
| `durationImprovementMs` | 25 | 0-600,000 |
| `countRegressionMin` | 1 | 1-1,000 |
| `ignoreEnvironment` | false | boolean |

The CLI maps options to these fields:

```bash
stacknext compare "$BASELINE" "$CANDIDATE" \
  --min-samples 3 \
  --duration-regression-pct 20 \
  --duration-regression-ms 25 \
  --duration-improvement-pct 20 \
  --duration-improvement-ms 25 \
  --count-regression-min 1 \
  --ignore-environment \
  --fail-on regression \
  --json
```

## Stable matching

### Scenarios

Scenarios are matched by their stored `scenarioId`, never by array position,
title, timestamp or trace id. The id is derived in this order:

1. explicit `stacknext*` Playwright annotation;
2. Playwright's stable test id;
3. file, title and project name.

The id is a SHA-256 prefix (`scn-<16 hex>`), so the raw annotation is not used
as a path or identifier. Changing the annotation creates a new scenario with no
baseline. Renaming a test title or moving the file does not change an
annotation-based id.

The comparison uses the union of baseline and candidate scenario ids:

- a scenario only in the baseline is `inconclusive` with
  `scenario-missing-from-candidate`;
- a scenario only in the candidate is `inconclusive` with
  `no-baseline-scenario`;
- a scenario on both sides is compared normally.

### Traces

Trace ids and span ids are stored for evidence links but are never matching
keys. A trace key is built from normalized fields:

```text
<method>|<route>|<normalized root span name>
```

Routes and span names are sanitized; numeric, UUID-like, hex-like and long
token-like path segments become `:id`. Trace keys therefore survive changing
database ids and request parameters.

If both sides have the same trace key set, each shared trace is compared. If the
key sets differ:

- `baseline-trace-missing-from-candidate` is recorded for baseline-only keys;
- `candidate-trace-not-in-baseline` is recorded for candidate-only keys;
- the scenario is structurally changed and normally becomes `inconclusive`.

If any verified sample on one side has a different trace key set from the other
verified samples on that same side, that side is marked
`baseline-variable-trace-shape` or `candidate-variable-trace-shape` and the
scenario is inconclusive. A scenario whose trace shape varies between samples
is not a stable comparison target.

### Spans and queries

Span keys are built from category, kind, documented `next.span_type`, HTTP
method and normalized endpoint/name. A span that appears only on one side adds a
`span-shape-changed` reason. Span shape changes are structural: they normally
make the scenario inconclusive.

Query keys are SQL fingerprints. SQL literals and bind parameters are not part
of the key, and bind parameters are never captured. A query key present on only
one side can still be compared, but query metrics are only produced for trace
keys shared by both sides.

### Findings

Captured diagnostic findings use the diagnostic fingerprint key. The comparison
counts finding occurrences across verified samples. Findings are evidence, not
root causes; a changed finding count is a signal to inspect the trace, not proof
that the underlying behavior improved or regressed.

## Samples

Only **verified** samples contribute measurements:

- `correlation.status === "verified"` and
- at least one correlated trace.

Every other sample is incomplete: a failed browser sample without telemetry, a
skipped sample with no request, a missing trace, a trace with no spans, or a
trace without a server span parented to the injected span.

Incomplete samples are stored and counted. If either side has any incomplete
sample, the scenario gets `baseline-incomplete-samples:<n>` or
`candidate-incomplete-samples:<n>` and is inconclusive. StackNext never drops a
missing sample silently or replaces it with a time-window guess.

The comparison requires at least `minSamples` verified samples per scenario on
each side. The default is three. If either side has fewer, the scenario is
inconclusive with a reason such as
`candidate-insufficient-samples:2<3`.

Samples, traces, spans, queries and errors are bounded when captured:

| Item | Bound |
| --- | --- |
| Samples per scenario | 100 |
| Traces per sample | 20 |
| Spans per trace | 500 |
| Queries per trace | 200 |
| Errors per trace | 100 |
| Findings per sample/scenario | 100 |

A capped record is still compared, but the cap is part of what the evidence can
support. Do not infer that a missing span or query never occurred.

## Environment gate

Before comparing metrics, StackNext compares:

- Node.js version;
- Next.js version;
- platform and architecture;
- `nodejs` runtime;
- enabled database adapters;
- instrumentation flags: verbose tracing, fetch capture and error capture;
- SDK version;
- Playwright version;
- project name.

Any difference is recorded in `environment.differences` and makes the
comparison `inconclusive` by default. Each scenario also receives the reason
`environment-mismatch`. This protects against comparing a baseline captured on
Node.js 22 with a candidate on Node.js 24, or a standard-span baseline with a
verbose-span candidate.

`--ignore-environment` sets `environment.ignored` and adds a warning, but
`environment.compatible` remains false and the differences remain in the
report. The option says "compute a result anyway"; it does not claim equivalence
and it does not hide the mismatch.

A candidate run that is not `completed` also makes the comparison inconclusive,
regardless of metrics. Its sample evidence is still available for inspection.

## Per-side aggregation

For each scenario and side:

1. Partition samples into verified and incomplete.
2. Collect the traces of verified samples by stable trace key.
3. Compute per-sample values, then a median across samples.
4. Collect findings by key.

Medians are used at two levels:

- **Within a sample:** when a sample has several matching traces, spans or
  queries, their values are reduced to one median for that sample.
- **Across samples:** the per-sample values are reduced to one median per side.

This prevents a single trace with many spans from dominating a side. It is not a
weighted average and it does not pool all spans into one distribution.

### Scenario metrics

| Metric key | Kind | Per-sample input | Across samples |
| --- | --- | --- | --- |
| `scenario:duration` | duration | Median duration of the sample's traces. | Median. |
| `scenario:spans` | count | Sum of `spanCount` across the sample's traces. | Median. |
| `scenario:queries` | count | Sum of `databaseQueryCount` across the sample's traces. | Median. |
| `scenario:errors` | count | Sum of `errorCount` across the sample's traces. | Median. |
| `scenario:failed-tests` | test status | Count of verified samples whose Playwright status is `failed`, `timedOut` or `interrupted`. | Total count. |

### Trace, span and query metrics

For each shared trace key, up to the first 50 sorted trace keys:

- `trace:<key>:duration` — median trace duration per sample, then median
  across samples;
- `trace:<key>:queries` — median query count per sample, then median across
  samples;
- `span:<traceKey>:<spanKey>` — median span duration per sample, then median
  across samples, for up to 200 shared span keys;
- `query-duration:<traceKey>:<queryKey>` — median query duration per sample,
  then median across samples, for up to 100 query keys.

### Finding metrics

For every finding key, `finding:<key>` is the total occurrence count across
verified samples on each side. A finding that appears in the candidate but not
the baseline starts at a baseline value of zero and can be classified as a
regression. A finding that disappears can be classified as an improvement.

Selection is bounded: at most 50 trace keys, 200 span keys, 100 query keys, 100
finding keys and 1,000 metrics per scenario. Reasons are capped at 50.

## Duration classification

For each duration metric:

```text
delta   = candidateMedian - baselineMedian
percent = baselineMedian > 0 ? (delta / baselineMedian) * 100 : null
```

- **regressed** when `delta > 0`, `delta >= durationRegressionMs`, and either
  the percent threshold is not applicable or `percent >= durationRegressionPct`.
- **improved** when `delta < 0`, `abs(delta) >= durationImprovementMs`, and
  either the percent threshold is not applicable or `-percent >=
  durationImprovementPct`.
- **unchanged** otherwise.

Both the absolute and percentage thresholds must pass. The percentage guards
against noise on large values; the absolute threshold prevents a large
percentage on a tiny duration from becoming a regression. When the baseline
median is zero, the percentage is undefined and only the absolute threshold
applies.

A metric with fewer than `minSamples` measured values on either side is
`inconclusive` with a note explaining the requirement.

### Null query durations

Query durations are nullable. Drizzle's logger does not expose a duration, and
StackNext never substitutes zero.

If any matching query duration is null, the query duration metric is
`inconclusive`, `delta` and `percent` are null, and `unmeasured: true` is set.
Null is never treated as a zero-duration measurement.

An unmeasured metric does not by itself force an otherwise unchanged scenario
to `inconclusive`. It also does not count as an improvement or a regression. It
is reported so a reader can see that the metric could not be evaluated. Other
blocking inconclusive evidence (missing samples, insufficient samples,
structural changes) still makes the scenario inconclusive.

## Count and status classification

For count, test-status, error and finding metrics:

```text
delta = candidateValue - baselineValue
```

- `delta >= countRegressionMin` → `regressed`;
- `delta <= -countRegressionMin` → `improved`;
- otherwise `unchanged`.

With the default `countRegressionMin: 1`, one additional span, query, error or
finding occurrence crosses the threshold. Counts are medians per sample for
spans/queries/errors, failed samples are totals, and finding counts are totals
across verified samples.

A count change is not automatically bad or good:

- fewer spans can mean less work or missing instrumentation;
- fewer queries can mean batching, caching or removed behavior;
- fewer errors can mean a fix or a route that was not exercised;
- fewer findings can mean the evidence changed, not that the root cause is
  gone.

Read the reasons and the underlying trace before acting.

## Severity

Severity is separate from status. It is `high`, `medium`, `low` or `none`.

Duration regression severity:

| Condition | Severity |
| --- | --- |
| `delta >= 100 ms` or `percent >= 100` | `high` |
| `delta >= 50 ms` or `percent >= 50` | `medium` |
| Any other duration regression | `low` |

The conditions are ORed. A 30 ms regression on a 20 ms baseline is `medium`
because the percentage is at least 50%, even though the absolute delta is below
50 ms.

Count regression severity:

| Metric kind | Severity |
| --- | --- |
| `error`, `finding`, `test-status` | `high` |
| `count` (spans, queries) | `medium` |

Only regressed metrics have non-`none` severity. A scenario's severity is the
worst severity among its regressed metrics. A comparison's severity is the worst
severity among its regressed scenarios. Improvement, unchanged and inconclusive
results have severity `none`.

## Scenario status precedence

For each scenario, apply these rules in order:

1. **Force inconclusive** for blocking evidence:
   - environment mismatch (unless ignored);
   - candidate run not `completed`;
   - no baseline scenario;
   - scenario missing from candidate;
   - incomplete samples on either side;
   - fewer than `minSamples` verified samples on either side;
   - variable trace shape on either side.
2. **Regressed** if any metric is `regressed`. This wins over structural
   reasons and blocking metric inconclusiveness.
3. **Inconclusive** if there is a structural change (trace key set difference
   or span shape change) or a blocking inconclusive metric (not marked
   `unmeasured`) and no metric improved.
4. **Improved** if at least one metric improved and no regression or blocking
   condition applies.
5. **Unchanged** otherwise.

A structural change is normally decisive even when some shared metrics look
fine: the traces no longer describe the same shape. A metric-level inconclusive
result, such as too few measured values for one span, blocks a verdict unless a
different metric improved and no other blocking condition exists.

## Comparison status precedence

The whole comparison status is:

1. `inconclusive` if the environments differ and `ignoreEnvironment` is false;
2. `inconclusive` if the candidate run is not `completed`;
3. `regressed` if at least one scenario is `regressed`;
4. `inconclusive` if at least one scenario is `inconclusive`;
5. `improved` if at least one scenario is `improved`;
6. `unchanged` otherwise.

This means one unmeasured or structurally changed scenario can make the overall
result inconclusive even when another scenario improved. Read the per-scenario
summary and reasons rather than only the top-level status.

## No significance claim

StackNext does not compute p-values, confidence intervals, effect sizes,
statistical power or multiple-comparison corrections. It does not claim that a
result is statistically significant, that a threshold is universally correct or
that a changed metric caused a user-visible problem.

The medians reduce the influence of outliers, but the underlying samples are
local wall-clock measurements affected by:

- dev-server compilation and route warm-up;
- garbage collection and CPU scheduling;
- filesystem and database caches;
- Playwright browser startup and test isolation;
- machine load and CI runner variability;
- the number of samples and the selected thresholds.

That is why a baseline and candidate must share an environment, why at least
three verified samples are required, and why an inconclusive result is not a
pass. A `regressed` classification means "the measured median crossed the
configured threshold in this sample", not "the app is slower for users".

## Report-only by default

`stacknext compare` saves a comparison and prints the result without failing.
CI behavior is opt-in:

| Option | Exits 1 when |
| --- | --- |
| `--fail-on regression` | Status is `regressed`. |
| `--fail-on inconclusive` | Status is `inconclusive`. |
| `--fail-on any` | Status is `regressed` or `inconclusive`. |

`--no-save` computes without persisting. The comparison JSON includes the
resolved options, environment differences, summary, per-scenario reasons and
metrics, warnings and limitations.

## Interpreting a comparison

Start with the top-level status, then read the evidence in this order:

1. `environment.compatible` and `environment.differences`;
2. `summary` and each scenario's `status`;
3. each scenario's `reasons`;
4. the regressed or inconclusive metrics, including `sampleCount`, `delta`,
   `percent` and `note`;
5. the baseline and candidate sample/trace/finding counts;
6. `warnings` and `limitations`.

Useful rules of thumb:

- `inconclusive` means fix the evidence, not the app: match the environment,
  collect more samples, warm the routes, remove flaky scenarios, or restore the
  baseline scenario.
- `regressed` means investigate the metric and its trace. It does not identify
  the cause.
- `improved` is not automatically a success. Confirm that the behavior you care
  about is still present and instrumented.
- `unchanged` means no configured threshold was crossed in this sample. It is
  not proof that nothing changed.

## Bounds and storage

A comparison is saved under `.stacknext/comparisons/` with a `cmp-<16 hex>` id,
mode `0600` and the same atomic-write rules as runs and baselines. Records are
validated with a strict versioned schema and capped at 16 MiB. Comparisons are
not pruned automatically.

## Related documentation

- [Runtime regression testing](regression-testing.md)
- [Baselines](baselines.md)
- [Playwright integration](playwright-integration.md)
- [CI integration](ci-integration.md)
- [Privacy and redaction](privacy.md)
