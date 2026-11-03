import type {
  Baseline,
  Comparison,
  CreateRunRequest,
  EnvironmentSnapshot,
  SubmitSampleRequest,
  TestRun,
} from '@stacknext/regression'

export const REGRESSION_TOKEN = 'regression-token-that-is-long-enough'

export const environmentSnapshot: EnvironmentSnapshot = {
  nodeVersion: '24.21.0',
  nextVersion: '16.4.3',
  platform: 'linux',
  arch: 'x64',
  runtime: 'nodejs',
  databases: ['sqlite'],
  instrumentation: {
    verbose: false,
    verboseSource: 'default',
    captureFetch: true,
    captureErrors: true,
  },
  sdkVersion: '0.7.0',
  playwrightVersion: '1.58.2',
}

export function createRunRequest(
  overrides: Partial<CreateRunRequest> = {},
): CreateRunRequest {
  return {
    name: 'collector-run',
    projectName: 'collector-test',
    environment: environmentSnapshot,
    collectorVersion: '0.7.0',
    command: {
      executable: 'npx',
      args: ['playwright', 'test'],
      exitCode: null,
      signal: null,
      durationMs: 0,
    },
    ...overrides,
  }
}

export function completedRun(overrides: Partial<TestRun> = {}): TestRun {
  return {
    format: 'stacknext-test-run',
    version: 1,
    id: 'run-1111111111111111',
    name: 'saved-run',
    projectName: 'collector-test',
    status: 'completed',
    createdAt: 1_000,
    completedAt: 2_000,
    command: {
      executable: 'npx',
      args: ['playwright', 'test'],
      exitCode: 0,
      signal: null,
      durationMs: 1_000,
    },
    environment: environmentSnapshot,
    collector: { version: '0.7.0', connected: true },
    scenarios: [],
    warnings: [],
    notes: [],
    limitations: ['Comparison evidence is limited to correlated samples.'],
    stats: {
      scenarios: 0,
      samples: 0,
      verifiedSamples: 0,
      incompleteSamples: 0,
      traces: 0,
      requests: 0,
      spans: 0,
      errors: 0,
      databaseQueries: 0,
    },
    ...overrides,
  }
}

export function baselineRecord(
  run: TestRun,
  overrides: Partial<Baseline> = {},
): Baseline {
  return {
    format: 'stacknext-baseline',
    version: 1,
    id: 'base-2222222222222222',
    name: 'saved-baseline',
    projectName: run.projectName,
    createdAt: 3_000,
    sourceRunId: run.id,
    environment: run.environment,
    scenarios: run.scenarios,
    warnings: [],
    notes: [],
    limitations: ['Baselines are immutable local snapshots.'],
    stats: run.stats,
    ...overrides,
  }
}

export function comparisonRecord(
  baseline: Baseline,
  candidate: TestRun,
  overrides: Partial<Comparison> = {},
): Comparison {
  return {
    format: 'stacknext-comparison',
    version: 1,
    id: 'cmp-4444444444444444',
    projectName: baseline.projectName,
    createdAt: 4_000,
    baselineId: baseline.id,
    candidateId: candidate.id,
    status: 'inconclusive',
    severity: 'none',
    environment: {
      compatible: true,
      ignored: false,
      differences: [],
    },
    options: {
      minSamples: 3,
      durationRegressionPct: 20,
      durationRegressionMs: 25,
      durationImprovementPct: 20,
      durationImprovementMs: 25,
      countRegressionMin: 1,
      ignoreEnvironment: false,
    },
    summary: {
      scenarios: 0,
      regressed: 0,
      improved: 0,
      unchanged: 0,
      inconclusive: 0,
    },
    scenarios: [],
    warnings: [],
    limitations: ['Medians are not a significance test.'],
    ...overrides,
  }
}

export function sampleSubmission(
  traceId: string,
  injectedSpanId: string,
  overrides: Partial<SubmitSampleRequest> = {},
): SubmitSampleRequest {
  return {
    scenario: {
      id: 'scn-5555555555555555',
      source: 'annotation',
      title: 'collector scenario',
      file: 'tests/collector.spec.ts',
      project: 'chromium',
      tags: [],
    },
    sample: {
      id: 'smp-6666666666666666',
      status: 'passed',
      expectedStatus: 'passed',
      retry: 0,
      repeatEachIndex: 0,
      durationMs: 120,
      capturedAt: 5_000,
      traces: [{ traceId, injectedSpanId }],
    },
    ...overrides,
  }
}
