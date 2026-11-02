import type { DiagnosticFinding, DiagnosticReport, TraceDetail } from '@stacknext/core'
import { listDiagnosticFindings } from '@stacknext/diagnostics'
import {
  capturedSampleFromSubmission,
  computeRegressionStats,
  createRunId,
  mergeScenarioSample,
  REGRESSION_LIMITATIONS,
  runSummary,
  type CapturedSample,
  type CapturedScenario,
  type CompleteRunRequest,
  type CreateRunRequest,
  type RunSummary,
  type SubmitSampleRequest,
  type TestRun,
} from '@stacknext/regression'

export interface TestRunRegistryOptions {
  slowRequestMs: number
  isConnected: () => boolean
  getDiagnosticReport: () => DiagnosticReport
  lookupTrace: (traceId: string) => TraceDetail | null
  maxCompletedRuns?: number
  now?: () => number
}

export type SubmitSampleResult =
  | { ok: true; sample: CapturedSample; run: TestRun }
  | { ok: false; code: 'not-found' | 'not-running' | 'duplicate-sample' }

const DEFAULT_MAX_COMPLETED_RUNS = 25

/**
 * Holds active capture runs in memory. The CLI persists completed runs; the
 * collector never writes run records itself. Completed evidence is evicted
 * oldest-first so a long-lived collector stays bounded; saved runs remain
 * available from disk.
 */
export class TestRunRegistry {
  private readonly runs = new Map<string, TestRun>()
  private readonly scenarios = new Map<string, Map<string, CapturedScenario>>()
  private readonly now: () => number

  constructor(private readonly options: TestRunRegistryOptions) {
    this.now = options.now ?? Date.now
  }

  private evictCompleted(): void {
    const limit = Math.max(this.options.maxCompletedRuns ?? DEFAULT_MAX_COMPLETED_RUNS, 1)
    const completed = [...this.runs.values()]
      .filter((run) => run.status !== 'running')
      .sort((left, right) => left.createdAt - right.createdAt || (left.id < right.id ? -1 : 1))
    while (completed.length > limit) {
      const oldest = completed.shift()
      if (!oldest) break
      this.runs.delete(oldest.id)
      this.scenarios.delete(oldest.id)
    }
  }

  create(request: CreateRunRequest): TestRun {
    const now = this.now()
    const run: TestRun = {
      format: 'stacknext-test-run',
      version: 1,
      id: createRunId(),
      name: request.name,
      projectName: request.projectName,
      status: 'running',
      createdAt: now,
      completedAt: null,
      command: request.command,
      environment: request.environment,
      collector: {
        version: request.collectorVersion,
        connected: this.options.isConnected(),
      },
      scenarios: [],
      warnings: [],
      notes: [],
      limitations: [...REGRESSION_LIMITATIONS],
      stats: computeRegressionStats([]),
    }
    this.runs.set(run.id, run)
    this.scenarios.set(run.id, new Map())
    this.evictCompleted()
    return structuredClone(run)
  }

  get(id: string): TestRun | null {
    const run = this.runs.get(id)
    return run ? structuredClone(run) : null
  }

  list(): RunSummary[] {
    return [...this.runs.values()]
      .map(runSummary)
      .sort((left, right) => right.createdAt - left.createdAt || (left.id < right.id ? -1 : 1))
  }

  private findingsForTrace(traceId: string): DiagnosticFinding[] {
    return listDiagnosticFindings(this.options.getDiagnosticReport(), {
      traceId,
      limit: 200,
    }).items
  }

  submit(id: string, request: SubmitSampleRequest): SubmitSampleResult {
    const run = this.runs.get(id)
    if (!run) return { ok: false, code: 'not-found' }
    if (run.status !== 'running') return { ok: false, code: 'not-running' }
    const scenarioMap = this.scenarios.get(id)
    if (!scenarioMap) return { ok: false, code: 'not-found' }
    const existing = scenarioMap.get(request.scenario.id)
    if (existing?.samples.some((sample) => sample.id === request.sample.id)) {
      return { ok: false, code: 'duplicate-sample' }
    }
    const sample = capturedSampleFromSubmission({
      submission: request.sample,
      lookupTrace: (traceId) => this.options.lookupTrace(traceId),
      findingsForTrace: (traceId) => this.findingsForTrace(traceId),
    })
    const merged = mergeScenarioSample({
      identity: request.scenario,
      samples: [...(existing?.samples ?? []), sample],
      previousFindings: existing?.findings,
      notes: existing?.notes,
      limitations: existing?.limitations,
    })
    const scenario: CapturedScenario = {
      identity: merged.identity,
      samples: merged.samples,
      findings: merged.findings,
      notes: merged.notes,
      limitations: merged.limitations,
    }
    scenarioMap.set(scenario.identity.id, scenario)
    run.scenarios = [...scenarioMap.values()].sort((left, right) =>
      left.identity.id < right.identity.id ? -1 : 1,
    )
    run.stats = computeRegressionStats(run.scenarios)
    if (sample.correlation.status !== 'verified') {
      const warning = `Scenario ${scenario.identity.title} has an incomplete sample (${sample.correlation.reasons.join(', ') || 'unknown reason'}).`
      if (!run.warnings.includes(warning)) run.warnings.push(warning)
      run.warnings = run.warnings.slice(-50)
    }
    return { ok: true, sample: structuredClone(sample), run: structuredClone(run) }
  }

  complete(id: string, request: CompleteRunRequest): TestRun | null {
    const run = this.runs.get(id)
    if (!run) return null
    if (run.status !== 'running') return structuredClone(run)
    let status = request.status
    if (
      status === 'completed' &&
      (run.stats.verifiedSamples === 0 || run.stats.incompleteSamples > 0)
    ) {
      status = 'incomplete'
      const warning =
        run.stats.verifiedSamples === 0
          ? 'No verified telemetry was captured for this run.'
          : `${run.stats.incompleteSamples} sample(s) could not be correlated to collector telemetry.`
      if (!run.warnings.includes(warning)) run.warnings.push(warning)
    }
    run.status = status
    run.completedAt = this.now()
    if (request.command) {
      run.command = request.command
    }
    run.collector = {
      ...run.collector,
      connected: this.options.isConnected(),
    }
    if (request.warnings) {
      run.warnings = [...new Set([...run.warnings, ...request.warnings])].slice(-50)
    }
    this.evictCompleted()
    return structuredClone(run)
  }
}

export function registryTraceLookup(
  getTrace: (traceId: string) => TraceDetail | null,
): (traceId: string) => TraceDetail | null {
  return (traceId) => getTrace(traceId)
}
