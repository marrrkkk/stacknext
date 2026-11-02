import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { ConnectionInfo } from '@stacknext/core'
import type {
  Baseline,
  CapturedScenario,
  Comparison,
  EnvironmentSnapshot,
  RegressionStatus,
  TestRun,
} from '@stacknext/regression'
import { formatDuration, formatRelativeTime, style } from '../output.js'

export async function playwrightVersion(projectDir: string): Promise<string | undefined> {
  const require = createRequire(path.join(projectDir, 'package.json'))
  for (const name of ['@playwright/test/package.json', 'playwright/package.json']) {
    try {
      const file = require.resolve(name)
      const parsed = JSON.parse(await readFile(file, 'utf8')) as { version?: unknown }
      if (typeof parsed.version === 'string') return parsed.version
    } catch {
      // Try the next package name.
    }
  }
  return undefined
}

export function latestConnection(
  connections: ConnectionInfo[],
): ConnectionInfo | null {
  return [...connections].sort((left, right) => right.lastSeen - left.lastSeen)[0] ?? null
}

export function statusMarker(status: RegressionStatus): string {
  switch (status) {
    case 'regressed':
      return style.red('✗')
    case 'improved':
      return style.green('↑')
    case 'unchanged':
      return style.green('✓')
    case 'inconclusive':
      return style.yellow('!')
  }
}

export function markerForRun(status: TestRun['status']): string {
  switch (status) {
    case 'completed':
      return style.green('✓')
    case 'running':
      return style.cyan('·')
    case 'failed':
      return style.red('✗')
    case 'interrupted':
    case 'incomplete':
      return style.yellow('!')
  }
}

export function environmentLines(environment: EnvironmentSnapshot): string[] {
  return [
    `Node.js     ${environment.nodeVersion}${environment.nextVersion ? ` · Next.js ${environment.nextVersion}` : ''}`,
    `Platform    ${environment.platform}/${environment.arch} · ${environment.runtime}`,
    `Databases   ${environment.databases.join(', ') || 'none'}`,
    `Tracing     ${environment.instrumentation.verbose ? `verbose (${environment.instrumentation.verboseSource})` : `standard (${environment.instrumentation.verboseSource})`} · fetch ${environment.instrumentation.captureFetch ? 'on' : 'off'} · errors ${environment.instrumentation.captureErrors ? 'on' : 'off'}`,
    `SDK         ${environment.sdkVersion}${environment.playwrightVersion ? ` · Playwright ${environment.playwrightVersion}` : ''}`,
  ]
}

export function scenarioLines(scenario: CapturedScenario): string[] {
  const verified = scenario.samples.filter(
    (sample) => sample.correlation.status === 'verified',
  ).length
  const incomplete = scenario.samples.length - verified
  const traces = scenario.samples.reduce(
    (sum, sample) => sum + sample.correlation.traces.length,
    0,
  )
  return [
    `${style.bold(scenario.identity.title)} ${style.dim(scenario.identity.id)}`,
    `  ${scenario.identity.file} · ${scenario.identity.project} · ${scenario.samples.length} sample(s), ${verified} verified${
      incomplete > 0 ? `, ${style.yellow(`${incomplete} incomplete`)}` : ''
    }, ${traces} trace(s), ${scenario.findings.length} finding(s)`,
    ...scenario.limitations.slice(0, 2).map((limitation) => style.dim(`  ${limitation}`)),
  ]
}

export function runLines(run: TestRun, now = Date.now()): string[] {
  const lines: string[] = []
  lines.push(
    `${markerForRun(run.status)} ${style.bold(run.name)} ${style.dim(run.id)} — ${run.status}`,
  )
  lines.push(
    `Created     ${new Date(run.createdAt).toISOString()} ${style.dim(`(${formatRelativeTime(run.createdAt, now)})`)}`,
  )
  lines.push(
    `Command     ${run.command.executable} ${run.command.args.join(' ')} ${style.dim(
      `exit ${run.command.exitCode ?? '—'} · ${formatDuration(run.command.durationMs)}`,
    )}`,
  )
  lines.push(
    `Collector   ${run.collector.version} · ${run.collector.connected ? style.green('connected') : style.yellow('not connected')}`,
  )
  lines.push(...environmentLines(run.environment))
  lines.push(
    `Telemetry   ${run.stats.scenarios} scenarios · ${run.stats.samples} samples (${run.stats.verifiedSamples} verified, ${run.stats.incompleteSamples} incomplete) · ${run.stats.traces} traces · ${run.stats.spans} spans · ${run.stats.errors} errors · ${run.stats.databaseQueries} queries`,
  )
  if (run.scenarios.length > 0) {
    lines.push('')
    lines.push(style.bold('Scenarios'))
    for (const scenario of run.scenarios) {
      lines.push(...scenarioLines(scenario))
    }
  }
  if (run.warnings.length > 0) {
    lines.push('')
    lines.push(style.bold('Warnings'))
    for (const warning of run.warnings) lines.push(style.yellow(`! ${warning}`))
  }
  if (run.limitations.length > 0) {
    lines.push('')
    lines.push(style.bold('Limitations'))
    for (const limitation of run.limitations.slice(0, 5)) {
      lines.push(style.dim(`· ${limitation}`))
    }
  }
  return lines
}

export function baselineLines(baseline: Baseline, now = Date.now()): string[] {
  const lines: string[] = []
  lines.push(
    `${style.bold(baseline.name)} ${style.dim(baseline.id)} — from ${baseline.sourceRunId}`,
  )
  lines.push(
    `Created     ${new Date(baseline.createdAt).toISOString()} ${style.dim(`(${formatRelativeTime(baseline.createdAt, now)})`)}`,
  )
  lines.push(...environmentLines(baseline.environment))
  lines.push(
    `Telemetry   ${baseline.stats.scenarios} scenarios · ${baseline.stats.samples} samples (${baseline.stats.verifiedSamples} verified, ${baseline.stats.incompleteSamples} incomplete) · ${baseline.stats.traces} traces · ${baseline.stats.spans} spans`,
  )
  if (baseline.notes.length > 0) {
    lines.push('')
    lines.push(style.bold('Notes'))
    for (const note of baseline.notes) lines.push(`· ${note}`)
  }
  return lines
}

export function comparisonLines(comparison: Comparison): string[] {
  const lines: string[] = []
  lines.push(
    `${statusMarker(comparison.status)} ${style.bold(`Comparison ${comparison.status}`)} ${style.dim(
      `${comparison.id} · baseline ${comparison.baselineId} → ${comparison.candidateId}`,
    )}`,
  )
  lines.push(
    `Scenarios   ${comparison.summary.scenarios} · ${comparison.summary.regressed} regressed · ${comparison.summary.improved} improved · ${comparison.summary.unchanged} unchanged · ${comparison.summary.inconclusive} inconclusive`,
  )
  lines.push(
    `Environment ${comparison.environment.compatible ? style.green('compatible') : style.yellow('different')}${
      comparison.environment.ignored ? ' · explicitly ignored' : ''
    }`,
  )
  if (comparison.environment.differences.length > 0) {
    for (const difference of comparison.environment.differences) {
      lines.push(
        style.dim(
          `  ${difference.field}: ${difference.baseline} → ${difference.candidate}`,
        ),
      )
    }
  }
  lines.push('')
  lines.push(style.bold('Scenarios'))
  for (const scenario of comparison.scenarios) {
    lines.push(
      `${statusMarker(scenario.status)} ${style.bold(scenario.title)} ${style.dim(
        `${scenario.scenarioId} · ${scenario.status}${scenario.severity !== 'none' ? ` · ${scenario.severity} severity` : ''}`,
      )}`,
    )
    if (scenario.reasons.length > 0) {
      lines.push(style.dim(`  ${scenario.reasons.join('; ')}`))
    }
    for (const metric of scenario.metrics) {
      if (metric.status === 'unchanged') continue
      const baseline =
        metric.baselineValue === null ? 'null' : String(metric.baselineValue)
      const candidate =
        metric.candidateValue === null ? 'null' : String(metric.candidateValue)
      lines.push(
        `  ${statusMarker(metric.status)} ${metric.label}: ${baseline} → ${candidate}${
          metric.delta === null ? '' : ` (${metric.delta > 0 ? '+' : ''}${metric.delta}${metric.percent === null ? '' : `, ${metric.percent}%`})`
        }${metric.note ? style.dim(` — ${metric.note}`) : ''}`,
      )
    }
  }
  if (comparison.warnings.length > 0) {
    lines.push('')
    lines.push(style.bold('Warnings'))
    for (const warning of comparison.warnings) lines.push(style.yellow(`! ${warning}`))
  }
  lines.push('')
  lines.push(style.bold('Limitations'))
  for (const limitation of comparison.limitations.slice(0, 5)) {
    lines.push(style.dim(`· ${limitation}`))
  }
  return lines
}
