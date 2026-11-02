import {
  STACKNEXT_BASELINE_FORMAT,
  STACKNEXT_REGRESSION_FORMAT_VERSION,
  REGRESSION_LIMITATIONS,
} from './constants.js'
import { createBaselineId } from './capture.js'
import type {
  Baseline,
  BaselineSummary,
  CapturedScenario,
  Comparison,
  ComparisonSummaryItem,
  RegressionStats,
  RunSummary,
  TestRun,
} from './schema.js'

export function computeRegressionStats(
  scenarios: CapturedScenario[],
): RegressionStats {
  const stats: RegressionStats = {
    scenarios: scenarios.length,
    samples: 0,
    verifiedSamples: 0,
    incompleteSamples: 0,
    traces: 0,
    requests: 0,
    spans: 0,
    errors: 0,
    databaseQueries: 0,
  }
  for (const scenario of scenarios) {
    for (const sample of scenario.samples) {
      stats.samples += 1
      if (sample.correlation.status === 'verified') {
        stats.verifiedSamples += 1
      } else {
        stats.incompleteSamples += 1
      }
      stats.traces += sample.correlation.traces.length
      stats.requests += sample.correlation.traces.length
      for (const trace of sample.correlation.traces) {
        stats.spans += trace.spanCount
        stats.errors += trace.errorCount
        stats.databaseQueries += trace.databaseQueryCount
      }
    }
  }
  return stats
}

export function runSummary(run: TestRun): RunSummary {
  return {
    id: run.id,
    name: run.name,
    projectName: run.projectName,
    status: run.status,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    durationMs: run.command.durationMs,
    scenarios: run.stats.scenarios,
    samples: run.stats.samples,
    verifiedSamples: run.stats.verifiedSamples,
    incompleteSamples: run.stats.incompleteSamples,
    environment: run.environment,
  }
}

export function baselineSummary(baseline: Baseline): BaselineSummary {
  return {
    id: baseline.id,
    name: baseline.name,
    projectName: baseline.projectName,
    createdAt: baseline.createdAt,
    sourceRunId: baseline.sourceRunId,
    scenarios: baseline.stats.scenarios,
    samples: baseline.stats.samples,
    environment: baseline.environment,
  }
}

export function comparisonSummaryItem(comparison: Comparison): ComparisonSummaryItem {
  return {
    id: comparison.id,
    projectName: comparison.projectName,
    baselineId: comparison.baselineId,
    candidateId: comparison.candidateId,
    createdAt: comparison.createdAt,
    status: comparison.status,
    severity: comparison.severity,
    summary: comparison.summary,
    environmentCompatible: comparison.environment.compatible,
  }
}

export function baselineFromRun(
  run: TestRun,
  options: {
    id?: string
    name: string
    notes?: string[]
  },
  now = Date.now(),
): Baseline {
  if (run.status !== 'completed') {
    throw new Error(
      `Run ${run.id} is ${run.status}; only a completed run with verified telemetry can become a baseline.`,
    )
  }
  if (run.stats.verifiedSamples === 0) {
    throw new Error(
      `Run ${run.id} has no verified sampled traces and cannot become a baseline.`,
    )
  }
  const id = options.id ?? createBaselineId()
  const scenarios = structuredClone(run.scenarios)
  return {
    format: STACKNEXT_BASELINE_FORMAT,
    version: STACKNEXT_REGRESSION_FORMAT_VERSION,
    id,
    name: options.name,
    projectName: run.projectName,
    createdAt: now,
    sourceRunId: run.id,
    environment: structuredClone(run.environment),
    scenarios,
    warnings: [],
    notes: [...(options.notes ?? [])],
    limitations: [...REGRESSION_LIMITATIONS],
    stats: computeRegressionStats(scenarios),
  }
}
