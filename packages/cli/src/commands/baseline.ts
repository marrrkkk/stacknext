import type { Command } from 'commander'
import {
  baselineFromRun,
  baselineSummary,
  listBaselines,
  loadBaseline,
  loadRun,
  removeBaseline,
  saveBaseline,
} from '@stacknext/regression'
import { formatRelativeTime, printBanner, style } from '../output.js'
import { detectProject } from '../project.js'
import { CLI_VERSION } from '../version.js'
import { baselineLines } from './regression-shared.js'

export interface BaselineSaveOptions {
  name: string
  notes?: string
  overwrite?: boolean
  json?: boolean
}

export interface BaselineListOptions {
  json?: boolean
  limit?: string
  offset?: string
}

export interface BaselineShowOptions {
  json?: boolean
}

export interface BaselineRemoveOptions {
  yes?: boolean
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

export async function runBaselineSave(
  runId: string,
  options: BaselineSaveOptions,
  cwd = process.cwd(),
): Promise<number> {
  if (!/^run-[0-9a-f]{16}$/.test(runId)) {
    throw new Error(`Invalid run id "${runId}"`)
  }
  if (!options.name.trim()) throw new Error('Baseline name must not be empty')
  const project = await detectProject(cwd)
  const run = await loadRun(project.dir, runId)
  const baseline = baselineFromRun(run, {
    name: options.name.trim(),
    notes: options.notes ? [options.notes.trim()] : [],
  })
  const file = await saveBaseline(project.dir, baseline, {
    overwrite: options.overwrite ?? false,
  })
  if (options.json) {
    console.log(JSON.stringify({ baseline, path: file }, null, 2))
    return 0
  }
  printBanner(CLI_VERSION)
  console.log(baselineLines(baseline))
  console.log('')
  console.log(style.green(`Saved baseline ${file}`))
  return 0
}

export async function runBaselineList(
  options: BaselineListOptions,
  cwd = process.cwd(),
): Promise<number> {
  const project = await detectProject(cwd)
  const result = await listBaselines(project.dir, {
    limit: parseInteger(options.limit, 50),
    offset: parseInteger(options.offset, 0),
  })
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
    return 0
  }
  printBanner(CLI_VERSION)
  if (result.items.length === 0) {
    console.log('No baselines. Run "stacknext baseline save <run-id> --name <name>".')
    return 0
  }
  const now = Date.now()
  for (const summary of result.items) {
    console.log(
      `${style.bold(summary.name)} ${style.dim(summary.id)} — from ${summary.sourceRunId}, ${summary.scenarios} scenarios, ${summary.samples} samples, ${formatRelativeTime(summary.createdAt, now)}`,
    )
  }
  console.log(
    style.dim(
      `\nShowing ${result.items.length} of ${result.total} baseline(s). Baselines are never deleted automatically.`,
    ),
  )
  return 0
}

export async function runBaselineShow(
  id: string,
  options: BaselineShowOptions,
  cwd = process.cwd(),
): Promise<number> {
  if (!/^base-[0-9a-f]{16}$/.test(id)) {
    throw new Error(`Invalid baseline id "${id}"`)
  }
  const project = await detectProject(cwd)
  const baseline = await loadBaseline(project.dir, id)
  if (options.json) {
    console.log(JSON.stringify(baseline, null, 2))
    return 0
  }
  printBanner(CLI_VERSION)
  console.log(baselineLines(baseline))
  console.log('')
  console.log(
    style.dim(
      `Summary: ${baselineSummary(baseline).scenarios} scenarios, ${baselineSummary(baseline).samples} samples`,
    ),
  )
  return 0
}

export async function runBaselineRemove(
  id: string,
  options: BaselineRemoveOptions,
  cwd = process.cwd(),
): Promise<number> {
  if (!/^base-[0-9a-f]{16}$/.test(id)) {
    throw new Error(`Invalid baseline id "${id}"`)
  }
  if (!options.yes) {
    throw new Error('Refusing to remove a baseline without --yes. Baselines are never deleted automatically.')
  }
  const project = await detectProject(cwd)
  const removed = await removeBaseline(project.dir, id)
  if (!removed) throw new Error(`Baseline ${id} was not found`)
  if (options.json) {
    console.log(JSON.stringify({ removed: id }, null, 2))
    return 0
  }
  console.log(style.green(`Removed baseline ${id}`))
  return 0
}

export function registerBaselineCommand(program: Command, cwd: string): void {
  const baseline = program
    .command('baseline')
    .description('Save and inspect immutable regression baselines')

  baseline
    .command('save')
    .description('Save a completed run as a baseline')
    .argument('<run-id>', 'completed run id (run-...)')
    .requiredOption('--name <name>', 'human-readable baseline name')
    .option('--notes <text>', 'optional baseline note')
    .option('--overwrite', 'allow replacing a record only on an explicit storage id collision')
    .option('--json', 'print machine-readable JSON')
    .action(async (runId: string, options: BaselineSaveOptions) => {
      const code = await runBaselineSave(runId, options, cwd)
      if (code !== 0) process.exitCode = code
    })

  baseline
    .command('list')
    .description('List saved baselines')
    .option('--limit <number>', 'maximum baselines to return (1-200)')
    .option('--offset <number>', 'pagination offset')
    .option('--json', 'print machine-readable JSON')
    .action(async (options: BaselineListOptions) => {
      const code = await runBaselineList(options, cwd)
      if (code !== 0) process.exitCode = code
    })

  baseline
    .command('show')
    .description('Show one baseline')
    .argument('<baseline-id>', 'baseline id (base-...)')
    .option('--json', 'print machine-readable JSON')
    .action(async (id: string, options: BaselineShowOptions) => {
      const code = await runBaselineShow(id, options, cwd)
      if (code !== 0) process.exitCode = code
    })

  baseline
    .command('remove')
    .description('Remove one baseline after explicit confirmation')
    .argument('<baseline-id>', 'baseline id (base-...)')
    .option('--yes', 'confirm permanent removal')
    .option('--json', 'print machine-readable JSON')
    .action(async (id: string, options: BaselineRemoveOptions) => {
      const code = await runBaselineRemove(id, options, cwd)
      if (code !== 0) process.exitCode = code
    })

  baseline.action(async () => {
    const code = await runBaselineList({}, cwd)
    if (code !== 0) process.exitCode = code
  })
}
