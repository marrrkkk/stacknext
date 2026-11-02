import type { Command } from 'commander'
import {
  compareBaseline,
  DEFAULT_COMPARISON_OPTIONS,
  loadBaseline,
  loadRun,
  saveComparison,
  type ComparisonOptions,
} from '@stacknext/regression'
import { printBanner, style } from '../output.js'
import { detectProject } from '../project.js'
import { CLI_VERSION } from '../version.js'
import { comparisonLines } from './regression-shared.js'

export type FailOn = 'regression' | 'inconclusive' | 'any'

export interface CompareOptions {
  json?: boolean
  ignoreEnvironment?: boolean
  minSamples?: string
  durationRegressionPct?: string
  durationRegressionMs?: string
  durationImprovementPct?: string
  durationImprovementMs?: string
  countRegressionMin?: string
  failOn?: string
  save?: boolean
}

function parseNumber(
  value: string | undefined,
  fallback: number,
  label: string,
  integer = false,
): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) {
    throw new Error(`Invalid ${label} "${value}"`)
  }
  return parsed
}

function parseFailOn(value: string | undefined): FailOn | null {
  if (!value) return null
  if (value === 'regression' || value === 'regressed') return 'regression'
  if (value === 'inconclusive' || value === 'any') return value
  throw new Error('Invalid --fail-on value. Use regression, inconclusive or any.')
}

export async function runCompare(
  baselineId: string,
  candidateId: string,
  options: CompareOptions,
  cwd = process.cwd(),
): Promise<number> {
  if (!/^base-[0-9a-f]{16}$/.test(baselineId)) {
    throw new Error(`Invalid baseline id "${baselineId}"`)
  }
  if (!/^run-[0-9a-f]{16}$/.test(candidateId)) {
    throw new Error(`Invalid candidate run id "${candidateId}"`)
  }
  const project = await detectProject(cwd)
  const [baseline, candidate] = await Promise.all([
    loadBaseline(project.dir, baselineId),
    loadRun(project.dir, candidateId),
  ])
  const comparisonOptions: Partial<ComparisonOptions> = {
    minSamples: parseNumber(
      options.minSamples,
      DEFAULT_COMPARISON_OPTIONS.minSamples,
      'min-samples',
      true,
    ),
    durationRegressionPct: parseNumber(
      options.durationRegressionPct,
      DEFAULT_COMPARISON_OPTIONS.durationRegressionPct,
      'duration-regression-pct',
    ),
    durationRegressionMs: parseNumber(
      options.durationRegressionMs,
      DEFAULT_COMPARISON_OPTIONS.durationRegressionMs,
      'duration-regression-ms',
    ),
    durationImprovementPct: parseNumber(
      options.durationImprovementPct,
      DEFAULT_COMPARISON_OPTIONS.durationImprovementPct,
      'duration-improvement-pct',
    ),
    durationImprovementMs: parseNumber(
      options.durationImprovementMs,
      DEFAULT_COMPARISON_OPTIONS.durationImprovementMs,
      'duration-improvement-ms',
    ),
    countRegressionMin: parseNumber(
      options.countRegressionMin,
      DEFAULT_COMPARISON_OPTIONS.countRegressionMin,
      'count-regression-min',
      true,
    ),
    ignoreEnvironment: options.ignoreEnvironment ?? false,
  }
  const failOn = parseFailOn(options.failOn)
  const comparison = compareBaseline(baseline, candidate, comparisonOptions)
  const savedPath =
    options.save === false ? null : await saveComparison(project.dir, comparison)
  const failed =
    (failOn === 'regression' && comparison.status === 'regressed') ||
    (failOn === 'inconclusive' && comparison.status === 'inconclusive') ||
    (failOn === 'any' &&
      (comparison.status === 'regressed' || comparison.status === 'inconclusive'))
  const exitCode = failed ? 1 : 0

  if (options.json) {
    console.log(
      JSON.stringify(
        { comparison, path: savedPath, exitCode },
        null,
        2,
      ),
    )
    return exitCode
  }

  printBanner(CLI_VERSION)
  console.log(comparisonLines(comparison))
  console.log('')
  if (savedPath) console.log(style.dim(`Saved comparison ${savedPath}`))
  if (comparison.status === 'inconclusive') {
    console.log(
      style.yellow(
        'Inconclusive: no regression verdict is inferred. Fix environment, sample or correlation warnings before comparing again.',
      ),
    )
  }
  if (exitCode !== 0) {
    console.log(style.red(`Failing because --fail-on ${failOn} matched ${comparison.status}.`))
  } else if (!failOn) {
    console.log(style.dim('Report-only: use --fail-on regression to make CI fail on regressions.'))
  }
  return exitCode
}

export function registerCompareCommand(program: Command, cwd: string): void {
  program
    .command('compare')
    .description('Compare a saved baseline with a candidate run')
    .argument('<baseline-id>', 'baseline id (base-...)')
    .argument('<candidate-run-id>', 'candidate run id (run-...)')
    .option('--json', 'print machine-readable JSON')
    .option('--ignore-environment', 'compare despite environment differences (reported with a warning)')
    .option('--min-samples <number>', 'minimum verified samples per side (default 3)')
    .option('--duration-regression-pct <number>', 'duration regression percent threshold (default 20)')
    .option('--duration-regression-ms <number>', 'duration regression absolute threshold in ms (default 25)')
    .option('--duration-improvement-pct <number>', 'duration improvement percent threshold (default 20)')
    .option('--duration-improvement-ms <number>', 'duration improvement absolute threshold in ms (default 25)')
    .option('--count-regression-min <number>', 'minimum query/span/error count increase (default 1)')
    .option('--fail-on <status>', 'exit 1 when comparison is regression, inconclusive or any')
    .option('--no-save', 'do not persist the comparison')
    .action(
      async (
        baselineId: string,
        candidateId: string,
        options: CompareOptions,
      ) => {
        const code = await runCompare(baselineId, candidateId, options, cwd)
        if (code !== 0) process.exitCode = code
      },
    )
}
