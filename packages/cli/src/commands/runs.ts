import type { Command } from 'commander'
import {
  listRuns,
  loadRun,
  type RunSummary,
} from '@stacknext/regression'
import { formatDuration, formatRelativeTime, printBanner, style } from '../output.js'
import { detectProject } from '../project.js'
import { CLI_VERSION } from '../version.js'
import { markerForRun, runLines } from './regression-shared.js'

export interface RunsListOptions {
  json?: boolean
  limit?: string
  offset?: string
}

export interface RunsShowOptions {
  json?: boolean
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid number "${value}"`)
  }
  return parsed
}

function summaryLine(run: RunSummary, now: number): string {
  return `${markerForRun(run.status)} ${style.bold(run.name)} ${style.dim(run.id)} — ${run.status}, ${run.scenarios} scenarios, ${run.samples} samples (${run.verifiedSamples} verified, ${run.incompleteSamples} incomplete), ${formatRelativeTime(run.createdAt, now)}, ${formatDuration(run.durationMs)}`
}

export async function runRunsList(
  options: RunsListOptions,
  cwd = process.cwd(),
): Promise<number> {
  const project = await detectProject(cwd)
  const result = await listRuns(project.dir, {
    limit: parseInteger(options.limit, 50),
    offset: parseInteger(options.offset, 0),
  })
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
    return 0
  }
  printBanner(CLI_VERSION)
  if (result.items.length === 0) {
    console.log('No captured test runs. Run "stacknext capture --name <name> -- <playwright command>".')
    return 0
  }
  const now = Date.now()
  for (const run of result.items) {
    console.log(summaryLine(run, now))
  }
  console.log(
    style.dim(
      `\nShowing ${result.items.length} of ${result.total} run(s). Stored under .stacknext/runs.`,
    ),
  )
  return 0
}

export async function runRunsShow(
  id: string,
  options: RunsShowOptions,
  cwd = process.cwd(),
): Promise<number> {
  if (!/^run-[0-9a-f]{16}$/.test(id)) {
    throw new Error(`Invalid run id "${id}"`)
  }
  const project = await detectProject(cwd)
  const run = await loadRun(project.dir, id)
  if (options.json) {
    console.log(JSON.stringify(run, null, 2))
    return 0
  }
  printBanner(CLI_VERSION)
  console.log(runLines(run))
  return 0
}

export function registerRunsCommand(program: Command, cwd: string): void {
  const runs = program
    .command('runs')
    .description('List saved capture runs (local .stacknext/runs)')

  runs
    .command('list')
    .description('List captured test runs')
    .option('--limit <number>', 'maximum runs to return (1-200)')
    .option('--offset <number>', 'pagination offset')
    .option('--json', 'print machine-readable JSON')
    .action(async (options: RunsListOptions) => {
      const code = await runRunsList(options, cwd)
      if (code !== 0) process.exitCode = code
    })

  runs
    .command('show')
    .description('Show one captured test run')
    .argument('<run-id>', 'run id (run-...)')
    .option('--json', 'print machine-readable JSON')
    .action(async (id: string, options: RunsShowOptions) => {
      const code = await runRunsShow(id, options, cwd)
      if (code !== 0) process.exitCode = code
    })

  runs.action(async () => {
    const code = await runRunsList({}, cwd)
    if (code !== 0) process.exitCode = code
  })
}
