import {
  DEFAULT_COMPARISON_OPTIONS,
  STACKNEXT_COMPARISON_FORMAT,
  STACKNEXT_REGRESSION_FORMAT_VERSION,
  REGRESSION_LIMITATIONS,
  type RegressionSeverity,
  type RegressionStatus,
} from './constants.js'
import { createComparisonId } from './capture.js'
import { compareEnvironments } from './environment.js'
import type {
  Baseline,
  CapturedFinding,
  CapturedSample,
  CapturedScenario,
  CapturedTrace,
  Comparison,
  ComparisonOptions,
  ComparisonSummary,
  EnvironmentDifference,
  RegressionMetric,
  ScenarioComparison,
  TestRun,
} from './schema.js'
import { comparisonOptionsSchema } from './schema.js'

const SEVERITY_RANK: Record<RegressionSeverity, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
}

interface SideAggregate {
  samples: CapturedSample[]
  verified: CapturedSample[]
  incomplete: CapturedSample[]
  tracesByKey: Map<string, CapturedTrace[]>
  traceKeys: Set<string>
  findings: Map<string, CapturedFinding>
  variableTraceShape: boolean
}

interface ScenarioComparisonInput {
  baseline: CapturedScenario | null
  candidate: CapturedScenario | null
  options: ComparisonOptions
  environmentCompatible: boolean
  environmentIgnored: boolean
  candidateStatus: TestRun['status']
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? null
  const left = sorted[middle - 1]
  const right = sorted[middle]
  return left === undefined || right === undefined ? null : (left + right) / 2
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function aggregate(scenario: CapturedScenario | null): SideAggregate {
  if (!scenario) {
    return {
      samples: [],
      verified: [],
      incomplete: [],
      tracesByKey: new Map(),
      traceKeys: new Set(),
      findings: new Map(),
      variableTraceShape: false,
    }
  }
  const verified = scenario.samples.filter(
    (sample) => sample.correlation.status === 'verified' && sample.correlation.traces.length > 0,
  )
  const incomplete = scenario.samples.filter(
    (sample) => sample.correlation.status !== 'verified' || sample.correlation.traces.length === 0,
  )
  const tracesByKey = new Map<string, CapturedTrace[]>()
  const traceKeys = new Set<string>()
  for (const sample of verified) {
    for (const trace of sample.correlation.traces) {
      const existing = tracesByKey.get(trace.key)
      if (existing) existing.push(trace)
      else tracesByKey.set(trace.key, [trace])
      traceKeys.add(trace.key)
    }
  }
  const findings = new Map<string, CapturedFinding>()
  const sampleFindings = verified.flatMap((sample) => sample.findings)
  const sourceFindings = sampleFindings.length > 0 ? sampleFindings : scenario.findings
  for (const finding of sourceFindings) {
    if (!findings.has(finding.key)) findings.set(finding.key, finding)
  }
  const variableTraceShape = verified.some((sample) => {
    const keys = new Set(sample.correlation.traces.map((trace) => trace.key))
    if (keys.size !== traceKeys.size) return true
    for (const key of traceKeys) {
      if (!keys.has(key)) return true
    }
    return false
  })
  return {
    samples: scenario.samples,
    verified,
    incomplete,
    tracesByKey,
    traceKeys,
    findings,
    variableTraceShape,
  }
}

function sideSummary(side: SideAggregate): ScenarioComparison['baseline'] {
  return {
    samples: side.samples.length,
    verifiedSamples: side.verified.length,
    incompleteSamples: side.incomplete.length,
    traces: [...side.tracesByKey.values()].reduce((sum, traces) => sum + traces.length, 0),
    findings: side.findings.size,
  }
}

function durationSeverity(
  deltaMs: number,
  percent: number | null,
): RegressionSeverity {
  if (deltaMs >= 100 || (percent !== null && percent >= 100)) return 'high'
  if (deltaMs >= 50 || (percent !== null && percent >= 50)) return 'medium'
  return 'low'
}

function durationMetric(input: {
  key: string
  label: string
  baselineValues: number[]
  candidateValues: number[]
  minSamples: number
  options: ComparisonOptions
  baselineNulls?: number
  candidateNulls?: number
}): RegressionMetric {
  const baselineMedian = median(input.baselineValues)
  const candidateMedian = median(input.candidateValues)
  const sampleCount = Math.min(input.baselineValues.length, input.candidateValues.length)
  const nulls = (input.baselineNulls ?? 0) + (input.candidateNulls ?? 0)
  if (nulls > 0) {
    return {
      key: input.key,
      label: input.label,
      kind: 'duration',
      status: 'inconclusive',
      severity: 'none',
      baselineValue: baselineMedian === null ? null : round(baselineMedian),
      candidateValue: candidateMedian === null ? null : round(candidateMedian),
      delta: null,
      percent: null,
      sampleCount,
      note: 'One or more durations are null (unmeasured). Null is never treated as zero.',
      unmeasured: true,
    }
  }
  if (
    baselineMedian === null ||
    candidateMedian === null ||
    input.baselineValues.length < input.minSamples ||
    input.candidateValues.length < input.minSamples
  ) {
    return {
      key: input.key,
      label: input.label,
      kind: 'duration',
      status: 'inconclusive',
      severity: 'none',
      baselineValue: baselineMedian === null ? null : round(baselineMedian),
      candidateValue: candidateMedian === null ? null : round(candidateMedian),
      delta: null,
      percent: null,
      sampleCount,
      note: `At least ${input.minSamples} measured values per side are required.`,
    }
  }
  const delta = candidateMedian - baselineMedian
  const percent = baselineMedian > 0 ? (delta / baselineMedian) * 100 : null
  let status: RegressionStatus = 'unchanged'
  if (
    delta > 0 &&
    delta >= input.options.durationRegressionMs &&
    (percent === null || percent >= input.options.durationRegressionPct)
  ) {
    status = 'regressed'
  } else if (
    delta < 0 &&
    Math.abs(delta) >= input.options.durationImprovementMs &&
    (percent === null || -percent >= input.options.durationImprovementPct)
  ) {
    status = 'improved'
  }
  return {
    key: input.key,
    label: input.label,
    kind: 'duration',
    status,
    severity:
      status === 'regressed' ? durationSeverity(Math.abs(delta), percent) : 'none',
    baselineValue: round(baselineMedian),
    candidateValue: round(candidateMedian),
    delta: round(delta),
    percent: percent === null ? null : round(percent, 1),
    sampleCount,
  }
}

function countMetric(input: {
  key: string
  label: string
  kind: 'count' | 'test-status' | 'error' | 'finding'
  baselineValue: number
  candidateValue: number
  sampleCount: number
  options: ComparisonOptions
}): RegressionMetric {
  const delta = input.candidateValue - input.baselineValue
  let status: RegressionStatus = 'unchanged'
  if (delta >= input.options.countRegressionMin) status = 'regressed'
  else if (delta <= -input.options.countRegressionMin) status = 'improved'
  const severity: RegressionSeverity =
    status !== 'regressed'
      ? 'none'
      : input.kind === 'error' ||
          input.kind === 'finding' ||
          input.kind === 'test-status'
        ? 'high'
        : 'medium'
  return {
    key: input.key,
    label: input.label,
    kind: input.kind,
    status,
    severity,
    baselineValue: round(input.baselineValue),
    candidateValue: round(input.candidateValue),
    delta: round(delta),
    percent:
      input.baselineValue > 0 ? round((delta / input.baselineValue) * 100, 1) : null,
    sampleCount: Math.max(input.sampleCount, 0),
  }
}

function perSampleValues(
  side: SideAggregate,
  traceKey: string | null,
  selector: (traces: CapturedTrace[]) => number[],
): number[] {
  const values: number[] = []
  for (const sample of side.verified) {
    const traces = sample.correlation.traces.filter(
      (trace) => traceKey === null || trace.key === traceKey,
    )
    if (traceKey !== null && traces.length === 0) continue
    const selected = selector(traces)
    const value = median(selected)
    if (value !== null) values.push(value)
  }
  return values
}

function countPerSample(
  side: SideAggregate,
  traceKey: string | null,
  selector: (traces: CapturedTrace[]) => number,
): number[] {
  const values: number[] = []
  for (const sample of side.verified) {
    const traces = sample.correlation.traces.filter(
      (trace) => traceKey === null || trace.key === traceKey,
    )
    if (traceKey !== null && traces.length === 0) continue
    values.push(selector(traces))
  }
  return values
}

function spanKeySet(traces: CapturedTrace[]): Set<string> {
  return new Set(traces.flatMap((trace) => trace.spans.map((span) => span.key)))
}

function traceSpanDurationValues(
  side: SideAggregate,
  traceKey: string,
  spanKey: string,
): number[] {
  const values: number[] = []
  for (const sample of side.verified) {
    const matching = sample.correlation.traces.filter((trace) => trace.key === traceKey)
    if (matching.length === 0) continue
    const durations = matching.flatMap((trace) =>
      trace.spans.filter((span) => span.key === spanKey).map((span) => span.durationMs),
    )
    const value = median(durations)
    if (value !== null) values.push(value)
  }
  return values
}

function queryDurationValues(
  side: SideAggregate,
  traceKey: string,
  queryKey: string,
): { values: number[]; nulls: number } {
  const values: number[] = []
  let nulls = 0
  for (const sample of side.verified) {
    const matching = sample.correlation.traces.filter((trace) => trace.key === traceKey)
    if (matching.length === 0) continue
    const durations: number[] = []
    for (const query of matching.flatMap((trace) => trace.queries)) {
      if (query.key !== queryKey) continue
      if (query.durationMs === null) nulls += 1
      else durations.push(query.durationMs)
    }
    const value = median(durations)
    if (value !== null) values.push(value)
  }
  return { values, nulls }
}

function findingCounts(side: SideAggregate): Map<string, number> {
  const counts = new Map<string, number>()
  for (const sample of side.verified) {
    for (const finding of sample.findings) {
      counts.set(finding.key, (counts.get(finding.key) ?? 0) + 1)
    }
  }
  if (counts.size === 0) {
    for (const finding of side.findings.values()) counts.set(finding.key, 1)
  }
  return counts
}

function metricWorstSeverity(metrics: RegressionMetric[]): RegressionSeverity {
  let severity: RegressionSeverity = 'none'
  for (const metric of metrics) {
    if (
      metric.status === 'regressed' &&
      (SEVERITY_RANK[metric.severity] ?? 0) > (SEVERITY_RANK[severity] ?? 0)
    ) {
      severity = metric.severity
    }
  }
  return severity
}

function compareScenario(input: ScenarioComparisonInput): ScenarioComparison {
  const baseline = aggregate(input.baseline)
  const candidate = aggregate(input.candidate)
  const scenarioId =
    input.baseline?.identity.id ?? input.candidate?.identity.id ?? 'scn-0000000000000000'
  const identity = input.candidate?.identity ?? input.baseline?.identity
  const reasons: string[] = []
  const metrics: RegressionMetric[] = []
  const forceInconclusive: string[] = []

  if (!input.environmentCompatible && !input.environmentIgnored) {
    forceInconclusive.push('environment-mismatch')
  }
  if (input.candidateStatus !== 'completed') {
    forceInconclusive.push(`candidate-run-${input.candidateStatus}`)
  }
  if (!input.baseline) {
    forceInconclusive.push('no-baseline-scenario')
  }
  if (!input.candidate) {
    forceInconclusive.push('scenario-missing-from-candidate')
  }
  if (baseline.incomplete.length > 0) {
    forceInconclusive.push(
      `baseline-incomplete-samples:${baseline.incomplete.length}`,
    )
  }
  if (candidate.incomplete.length > 0) {
    forceInconclusive.push(
      `candidate-incomplete-samples:${candidate.incomplete.length}`,
    )
  }
  if (baseline.verified.length < input.options.minSamples) {
    forceInconclusive.push(
      `baseline-insufficient-samples:${baseline.verified.length}<${input.options.minSamples}`,
    )
  }
  if (candidate.verified.length < input.options.minSamples) {
    forceInconclusive.push(
      `candidate-insufficient-samples:${candidate.verified.length}<${input.options.minSamples}`,
    )
  }
  if (baseline.variableTraceShape) forceInconclusive.push('baseline-variable-trace-shape')
  if (candidate.variableTraceShape) forceInconclusive.push('candidate-variable-trace-shape')

  const baselineKeys = [...baseline.traceKeys].sort(compareStrings)
  const candidateKeys = [...candidate.traceKeys].sort(compareStrings)
  if (baselineKeys.join('\u0000') !== candidateKeys.join('\u0000')) {
    const missing = baselineKeys.filter((key) => !candidate.traceKeys.has(key))
    const added = candidateKeys.filter((key) => !baseline.traceKeys.has(key))
    if (missing.length > 0) reasons.push(`baseline-trace-missing-from-candidate:${missing.length}`)
    if (added.length > 0) reasons.push(`candidate-trace-not-in-baseline:${added.length}`)
  }

  if (forceInconclusive.length === 0) {
    const baselineSpanCounts = countPerSample(baseline, null, (traces) =>
      traces.reduce((sum, trace) => sum + trace.spanCount, 0),
    )
    const candidateSpanCounts = countPerSample(candidate, null, (traces) =>
      traces.reduce((sum, trace) => sum + trace.spanCount, 0),
    )
    const baselineQueryCounts = countPerSample(baseline, null, (traces) =>
      traces.reduce((sum, trace) => sum + trace.databaseQueryCount, 0),
    )
    const candidateQueryCounts = countPerSample(candidate, null, (traces) =>
      traces.reduce((sum, trace) => sum + trace.databaseQueryCount, 0),
    )
    const baselineErrorCounts = countPerSample(baseline, null, (traces) =>
      traces.reduce((sum, trace) => sum + trace.errorCount, 0),
    )
    const candidateErrorCounts = countPerSample(candidate, null, (traces) =>
      traces.reduce((sum, trace) => sum + trace.errorCount, 0),
    )
    const scenarioSampleCount = Math.min(
      baseline.verified.length,
      candidate.verified.length,
    )
    metrics.push(
      durationMetric({
        key: 'scenario:duration',
        label: 'Scenario request duration',
        baselineValues: perSampleValues(baseline, null, (traces) =>
          traces.map((trace) => trace.durationMs),
        ),
        candidateValues: perSampleValues(candidate, null, (traces) =>
          traces.map((trace) => trace.durationMs),
        ),
        minSamples: input.options.minSamples,
        options: input.options,
      }),
      countMetric({
        key: 'scenario:spans',
        label: 'Spans per sample',
        kind: 'count',
        baselineValue: median(baselineSpanCounts) ?? 0,
        candidateValue: median(candidateSpanCounts) ?? 0,
        sampleCount: Math.min(baselineSpanCounts.length, candidateSpanCounts.length),
        options: input.options,
      }),
      countMetric({
        key: 'scenario:queries',
        label: 'Queries per sample',
        kind: 'count',
        baselineValue: median(baselineQueryCounts) ?? 0,
        candidateValue: median(candidateQueryCounts) ?? 0,
        sampleCount: Math.min(baselineQueryCounts.length, candidateQueryCounts.length),
        options: input.options,
      }),
      countMetric({
        key: 'scenario:errors',
        label: 'Errors per sample',
        kind: 'error',
        baselineValue: median(baselineErrorCounts) ?? 0,
        candidateValue: median(candidateErrorCounts) ?? 0,
        sampleCount: Math.min(baselineErrorCounts.length, candidateErrorCounts.length),
        options: input.options,
      }),
      countMetric({
        key: 'scenario:failed-tests',
        label: 'Failed samples',
        kind: 'test-status',
        baselineValue: baseline.verified.filter((sample) =>
          ['failed', 'timedOut', 'interrupted'].includes(sample.status),
        ).length,
        candidateValue: candidate.verified.filter((sample) =>
          ['failed', 'timedOut', 'interrupted'].includes(sample.status),
        ).length,
        sampleCount: scenarioSampleCount,
        options: input.options,
      }),
    )

    for (const traceKey of baselineKeys.filter((key) => candidate.traceKeys.has(key)).slice(0, 50)) {
      const baselineTraceQueries = countPerSample(baseline, traceKey, (traces) =>
        traces.reduce((sum, trace) => sum + trace.databaseQueryCount, 0),
      )
      const candidateTraceQueries = countPerSample(candidate, traceKey, (traces) =>
        traces.reduce((sum, trace) => sum + trace.databaseQueryCount, 0),
      )
      metrics.push(
        durationMetric({
          key: `trace:${traceKey}:duration`,
          label: `Trace duration: ${traceKey}`,
          baselineValues: perSampleValues(baseline, traceKey, (traces) =>
            traces.map((trace) => trace.durationMs),
          ),
          candidateValues: perSampleValues(candidate, traceKey, (traces) =>
            traces.map((trace) => trace.durationMs),
          ),
          minSamples: input.options.minSamples,
          options: input.options,
        }),
        countMetric({
          key: `trace:${traceKey}:queries`,
          label: `Queries: ${traceKey}`,
          kind: 'count',
          baselineValue: median(baselineTraceQueries) ?? 0,
          candidateValue: median(candidateTraceQueries) ?? 0,
          sampleCount: Math.min(baselineTraceQueries.length, candidateTraceQueries.length),
          options: input.options,
        }),
      )

      const baselineTraces = baseline.tracesByKey.get(traceKey) ?? []
      const candidateTraces = candidate.tracesByKey.get(traceKey) ?? []
      const baselineSpanKeys = spanKeySet(baselineTraces)
      const candidateSpanKeys = spanKeySet(candidateTraces)
      const spanKeys = [...baselineSpanKeys].sort(compareStrings)
      const missingSpans = spanKeys.filter((key) => !candidateSpanKeys.has(key))
      const addedSpans = [...candidateSpanKeys]
        .filter((key) => !baselineSpanKeys.has(key))
        .sort(compareStrings)
      if (missingSpans.length > 0 || addedSpans.length > 0) {
        reasons.push(
          `span-shape-changed:${traceKey}:${missingSpans.length} missing, ${addedSpans.length} added`,
        )
      }
      for (const spanKey of spanKeys.filter((key) => candidateSpanKeys.has(key)).slice(0, 200)) {
        metrics.push(
          durationMetric({
            key: `span:${traceKey}:${spanKey}`,
            label: `Span: ${spanKey}`,
            baselineValues: traceSpanDurationValues(baseline, traceKey, spanKey),
            candidateValues: traceSpanDurationValues(candidate, traceKey, spanKey),
            minSamples: input.options.minSamples,
            options: input.options,
          }),
        )
      }

      const queryKeys = new Set(
        [...baselineTraces, ...candidateTraces].flatMap((trace) =>
          trace.queries.map((query) => query.key),
        ),
      )
      for (const queryKey of [...queryKeys].sort(compareStrings).slice(0, 100)) {
        const baselineDurations = queryDurationValues(baseline, traceKey, queryKey)
        const candidateDurations = queryDurationValues(candidate, traceKey, queryKey)
        metrics.push(
          durationMetric({
            key: `query-duration:${traceKey}:${queryKey}`,
            label: `Query duration: ${queryKey.slice(0, 120)}`,
            baselineValues: baselineDurations.values,
            candidateValues: candidateDurations.values,
            baselineNulls: baselineDurations.nulls,
            candidateNulls: candidateDurations.nulls,
            minSamples: input.options.minSamples,
            options: input.options,
          }),
        )
      }
    }

    const baselineFindings = findingCounts(baseline)
    const candidateFindings = findingCounts(candidate)
    const verifiedSampleCount = Math.min(baseline.verified.length, candidate.verified.length)
    const findingKeys = [...new Set([...baselineFindings.keys(), ...candidateFindings.keys()])].sort(
      compareStrings,
    )
    for (const key of findingKeys.slice(0, 100)) {
      const finding =
        baseline.findings.get(key) ?? candidate.findings.get(key)
      metrics.push(
        countMetric({
          key: `finding:${key}`,
          label: `Diagnostic finding: ${finding?.ruleId ?? key}`,
          kind: 'finding',
          baselineValue: baselineFindings.get(key) ?? 0,
          candidateValue: candidateFindings.get(key) ?? 0,
          sampleCount: verifiedSampleCount,
          options: input.options,
        }),
      )
    }
  }

  const regressed = metrics.filter((metric) => metric.status === 'regressed')
  const improved = metrics.filter((metric) => metric.status === 'improved')
  const inconclusiveMetrics = metrics.filter((metric) => metric.status === 'inconclusive')
  const blockingInconclusive = inconclusiveMetrics.filter(
    (metric) => metric.unmeasured !== true,
  )
  const structuralChange = reasons.length > 0

  let status: RegressionStatus
  let severity: RegressionSeverity = 'none'
  if (forceInconclusive.length > 0) {
    status = 'inconclusive'
    reasons.unshift(...forceInconclusive)
  } else if (regressed.length > 0) {
    status = 'regressed'
    severity = metricWorstSeverity(regressed)
  } else if (
    structuralChange ||
    (blockingInconclusive.length > 0 && improved.length === 0)
  ) {
    status = 'inconclusive'
  } else if (improved.length > 0) {
    status = 'improved'
  } else {
    status = 'unchanged'
  }

  return {
    scenarioId,
    title: identity?.title ?? 'Unknown scenario',
    file: identity?.file ?? 'unknown.spec.ts',
    project: identity?.project ?? 'default',
    status,
    severity,
    reasons: [...new Set(reasons)].slice(0, 50),
    metrics: metrics.slice(0, 1_000),
    baseline: sideSummary(baseline),
    candidate: sideSummary(candidate),
  }
}

function summaryOf(scenarios: ScenarioComparison[]): ComparisonSummary {
  return {
    scenarios: scenarios.length,
    regressed: scenarios.filter((scenario) => scenario.status === 'regressed').length,
    improved: scenarios.filter((scenario) => scenario.status === 'improved').length,
    unchanged: scenarios.filter((scenario) => scenario.status === 'unchanged').length,
    inconclusive: scenarios.filter((scenario) => scenario.status === 'inconclusive').length,
  }
}

/**
 * Compares a saved baseline with a candidate run. Ids and timestamps are never
 * used to match scenarios or traces; matching uses the stored stable keys.
 */
export function compareBaseline(
  baseline: Baseline,
  candidate: TestRun,
  options: Partial<ComparisonOptions> = {},
  meta: { id?: string; now?: number } = {},
): Comparison {
  const resolved = comparisonOptionsSchema.parse({
    ...DEFAULT_COMPARISON_OPTIONS,
    ...options,
  })
  const differences = compareEnvironments(baseline.environment, candidate.environment)
  if (baseline.projectName !== candidate.projectName) {
    differences.push({
      field: 'projectName',
      baseline: baseline.projectName,
      candidate: candidate.projectName,
    })
    differences.sort((a, b) => compareStrings(a.field, b.field))
  }
  const environmentCompatible = differences.length === 0
  const warnings: string[] = []
  if (!environmentCompatible && resolved.ignoreEnvironment) {
    warnings.push(
      'Environment differences were explicitly ignored. Results are reported but remain environment-sensitive.',
    )
  }
  if (candidate.status !== 'completed') {
    warnings.push(
      `Candidate run ${candidate.id} is ${candidate.status}; no regression verdict is inferred from it.`,
    )
  }
  if (baseline.stats.incompleteSamples > 0) {
    warnings.push(
      `Baseline ${baseline.id} contains ${baseline.stats.incompleteSamples} incomplete sample(s).`,
    )
  }
  if (candidate.stats.incompleteSamples > 0) {
    warnings.push(
      `Candidate ${candidate.id} contains ${candidate.stats.incompleteSamples} incomplete sample(s).`,
    )
  }

  const baselineById = new Map(
    baseline.scenarios.map((scenario) => [scenario.identity.id, scenario]),
  )
  const candidateById = new Map(
    candidate.scenarios.map((scenario) => [scenario.identity.id, scenario]),
  )
  const scenarioIds = [...new Set([...baselineById.keys(), ...candidateById.keys()])].sort(
    compareStrings,
  )
  const scenarios = scenarioIds.map((id) =>
    compareScenario({
      baseline: baselineById.get(id) ?? null,
      candidate: candidateById.get(id) ?? null,
      options: resolved,
      environmentCompatible,
      environmentIgnored: resolved.ignoreEnvironment,
      candidateStatus: candidate.status,
    }),
  )

  const summary = summaryOf(scenarios)
  let status: RegressionStatus
  let severity: RegressionSeverity = 'none'
  if (!environmentCompatible && !resolved.ignoreEnvironment) {
    status = 'inconclusive'
  } else if (candidate.status !== 'completed') {
    status = 'inconclusive'
  } else if (summary.regressed > 0) {
    status = 'regressed'
    severity = scenarios
      .filter((scenario) => scenario.status === 'regressed')
      .reduce<RegressionSeverity>(
        (worst, scenario) =>
          (SEVERITY_RANK[scenario.severity] ?? 0) > (SEVERITY_RANK[worst] ?? 0)
            ? scenario.severity
            : worst,
        'none',
      )
  } else if (summary.inconclusive > 0) {
    status = 'inconclusive'
  } else if (summary.improved > 0) {
    status = 'improved'
  } else {
    status = 'unchanged'
  }

  return {
    format: STACKNEXT_COMPARISON_FORMAT,
    version: STACKNEXT_REGRESSION_FORMAT_VERSION,
    id: meta.id ?? createComparisonId(),
    projectName: candidate.projectName,
    createdAt: meta.now ?? Date.now(),
    baselineId: baseline.id,
    candidateId: candidate.id,
    status,
    severity,
    environment: {
      compatible: environmentCompatible,
      ignored: resolved.ignoreEnvironment,
      differences: differences.slice(0, 50),
    },
    options: resolved,
    summary,
    scenarios,
    warnings: [...new Set(warnings)].slice(0, 50),
    limitations: [...REGRESSION_LIMITATIONS],
  }
}

export function environmentDifferencesOf(
  comparison: Comparison,
): EnvironmentDifference[] {
  return comparison.environment.differences
}
