import type { Command } from 'commander'
import type { CoverageItem, CoverageReport, CoverageStatus } from '@stacknext/core'
import { collectorJson } from '../http.js'
import { formatRelativeTime, printBanner, style } from '../output.js'
import { requireRunningState } from '../session.js'
import { CLI_VERSION } from '../version.js'

export interface CoverageOptions {
  json?: boolean
}

const STATUS_ORDER: CoverageStatus[] = [
  'observed',
  'active',
  'configured',
  'not-observed',
  'unknown',
  'unsupported',
]

const STATUS_LABELS: Record<CoverageStatus, string> = {
  observed: 'Observed in this sample',
  active: 'Active, not exercised yet',
  configured: 'Configured, no app connected',
  'not-observed': 'Not observed in this sample',
  unknown: 'Cannot be determined',
  unsupported: 'Not supported',
}

function marker(status: CoverageStatus): string {
  switch (status) {
    case 'observed':
      return style.green('✓')
    case 'active':
    case 'configured':
      return style.cyan('·')
    case 'not-observed':
    case 'unknown':
      return style.yellow('!')
    case 'unsupported':
      return style.dim('—')
  }
}

function formatEvidence(item: CoverageItem, now: number): string {
  const parts: string[] = []
  if (item.evidence.count > 0) {
    parts.push(
      `${item.evidence.count} ${item.evidence.count === 1 ? 'event' : 'events'}`,
    )
  }
  if (item.evidence.lastSeen !== null) {
    parts.push(`last ${formatRelativeTime(item.evidence.lastSeen, now)}`)
  }
  if (item.evidence.spanTypes.length > 0) {
    parts.push(item.evidence.spanTypes.slice(0, 4).join(', '))
  }
  return parts.join(' · ')
}

export function formatCoverageReport(report: CoverageReport): string {
  const lines: string[] = []
  const first = report.sample.firstEventTime
  const last = report.sample.lastEventTime
  lines.push(
    `${style.bold('StackNext coverage')} ${style.dim(`v${report.collectorVersion}`)} — ${report.projectName}`,
  )
  lines.push(
    `Sample      ${report.sample.requests} requests, ${report.sample.spans} spans, ${report.sample.errors} errors, ${report.sample.databaseQueries} database queries`,
  )
  lines.push(
    `Window      ${
      first === null || last === null
        ? 'no events yet'
        : `${new Date(first).toISOString()} → ${new Date(last).toISOString()}`
    } ${style.dim(`(retention ${Math.round(report.sample.retentionMs / 1000)}s)`)}`,
  )
  lines.push(
    `Connection  ${
      report.sample.connected
        ? style.green(`connected (${report.sample.connectedInstances} instance(s))`)
        : style.yellow('no app is currently connected')
    }`,
  )
  lines.push(
    `Statuses    ${STATUS_ORDER.filter((status) => report.statusCounts[status] > 0)
      .map((status) => `${status} ${report.statusCounts[status]}`)
      .join(', ')}`,
  )
  lines.push(style.dim('Coverage is evidence from the current retention window, not a score.'))

  for (const status of STATUS_ORDER) {
    const items = report.items.filter((item) => item.status === status)
    if (items.length === 0) continue
    lines.push('')
    lines.push(`${style.bold(STATUS_LABELS[status])}`)
    for (const item of items) {
      const evidence = formatEvidence(item, report.generatedAt)
      lines.push(
        `${marker(status)} ${item.label} ${style.dim(`[${item.category}]`)}${evidence ? style.dim(` — ${evidence}`) : ''}`,
      )
      if (status === 'not-observed' || status === 'unknown' || status === 'unsupported') {
        for (const limitation of item.limitations.slice(0, 2)) {
          lines.push(style.dim(`   ${limitation}`))
        }
      }
    }
  }

  if (report.notes.length > 0) {
    lines.push('')
    lines.push(style.bold('Notes'))
    for (const note of report.notes) lines.push(`· ${note}`)
  }
  lines.push('')
  lines.push(style.bold('Limitations'))
  for (const limitation of report.limitations) lines.push(style.dim(`· ${limitation}`))
  return lines.join('\n')
}

export async function runCoverage(
  options: CoverageOptions,
  cwd = process.cwd(),
): Promise<number> {
  const state = await requireRunningState(cwd)
  let report: CoverageReport
  try {
    report = await collectorJson<CoverageReport>(
      state.collectorUrl,
      '/api/coverage',
      state.token,
    )
  } catch (error) {
    if (!options.json) {
      printBanner(CLI_VERSION)
      console.error(
        `${style.red('Coverage unavailable')} — ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    return 1
  }
  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(formatCoverageReport(report))
  }
  return 0
}

export function registerCoverageCommand(program: Command, cwd: string): void {
  program
    .command('coverage')
    .description('Show observed instrumentation coverage for the current sample')
    .option('--json', 'print machine-readable JSON')
    .action(async (options: CoverageOptions) => {
      const code = await runCoverage(options, cwd)
      if (code !== 0) process.exitCode = code
    })
}
