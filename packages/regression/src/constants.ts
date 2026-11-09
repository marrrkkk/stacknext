export const STACKNEXT_RUN_FORMAT = 'stacknext-test-run'
export const STACKNEXT_BASELINE_FORMAT = 'stacknext-baseline'
export const STACKNEXT_COMPARISON_FORMAT = 'stacknext-comparison'
export const STACKNEXT_REGRESSION_FORMAT_VERSION = 1
export const STACKNEXT_REGRESSION_ENGINE_VERSION = '0.8.0'

export const RUN_STATUSES = [
  'running',
  'completed',
  'failed',
  'interrupted',
  'incomplete',
] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export const SAMPLE_STATUSES = [
  'passed',
  'failed',
  'timedOut',
  'skipped',
  'interrupted',
] as const
export type SampleStatus = (typeof SAMPLE_STATUSES)[number]

export const SAMPLE_EXPECTED_STATUSES = ['passed', 'failed', 'skipped'] as const
export type SampleExpectedStatus = (typeof SAMPLE_EXPECTED_STATUSES)[number]

export const CORRELATION_STATUSES = ['verified', 'incomplete'] as const
export type CorrelationStatus = (typeof CORRELATION_STATUSES)[number]

export const REGRESSION_STATUSES = [
  'improved',
  'regressed',
  'unchanged',
  'inconclusive',
] as const
export type RegressionStatus = (typeof REGRESSION_STATUSES)[number]

export const REGRESSION_SEVERITIES = ['high', 'medium', 'low', 'none'] as const
export type RegressionSeverity = (typeof REGRESSION_SEVERITIES)[number]

export const REGRESSION_METRIC_KINDS = [
  'duration',
  'count',
  'test-status',
  'error',
  'finding',
] as const
export type RegressionMetricKind = (typeof REGRESSION_METRIC_KINDS)[number]

export const REGRESSION_ID_PATTERN = /^(run|base|cmp)-[0-9a-f]{16}$/
export const SCENARIO_ID_PATTERN = /^scn-[0-9a-f]{16}$/
export const SAMPLE_ID_PATTERN = /^smp-[0-9a-f]{16}$/

export const DEFAULT_COMPARISON_OPTIONS = {
  minSamples: 3,
  durationRegressionPct: 20,
  durationRegressionMs: 25,
  durationImprovementPct: 20,
  durationImprovementMs: 25,
  countRegressionMin: 1,
  ignoreEnvironment: false,
} as const

export const REGRESSION_LIMITATIONS = [
  'Comparisons use only telemetry correlated to Playwright scenario samples in the captured run.',
  'Durations are wall-clock measurements from the local run and include machine and dev-server noise.',
  'Medians reduce noise but are not a statistical significance test; StackNext makes no significance claim.',
  'Null database durations are unmeasured and are never converted to zero.',
  'A baseline or candidate with missing samples, incomplete correlation or a changed trace shape is inconclusive by default.',
  'Environment differences such as Node.js, Next.js, OS, runtime, database, instrumentation or verbose tracing make a comparison inconclusive unless explicitly overridden.',
] as const
