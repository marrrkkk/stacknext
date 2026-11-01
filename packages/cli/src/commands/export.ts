import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import type { ExportResponse } from '@nextscope/core'
import { collectorJson } from '../http.js'
import { printCheck, printSection, style } from '../output.js'
import { requireRunningState } from '../session.js'

export interface ExportOptions {
  output?: string
  stdout?: boolean
  force?: boolean
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

export async function runExport(
  options: ExportOptions,
  cwd = process.cwd(),
): Promise<number> {
  if (options.output && options.stdout) {
    throw new Error('Use either --output or --stdout, not both')
  }
  const state = await requireRunningState(cwd)
  const payload = await collectorJson<ExportResponse>(
    state.collectorUrl,
    '/api/export',
    state.token,
  )
  const json = `${JSON.stringify(payload, null, 2)}\n`

  if (options.stdout) {
    process.stdout.write(json)
    return 0
  }

  const file = path.resolve(
    cwd,
    options.output ??
      `nextscope-export-${state.projectName.replace(/[^a-z0-9_-]+/gi, '-')}-${timestamp()}.json`,
  )
  if (!options.force && (await exists(file))) {
    throw new Error(`${file} already exists. Choose another --output or pass --force.`)
  }
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, json, { mode: 0o600 })

  printSection('NextScope export')
  printCheck('pass', `Wrote ${file}`)
  printCheck(
    'pass',
    `${payload.stats.requests} requests, ${payload.stats.spans} spans, ${payload.stats.errors} errors, ${payload.stats.databaseQueries} database queries`,
  )
  console.log(
    style.dim(
      'Export contains redacted telemetry only: no bodies, headers, cookies or SQL parameters.',
    ),
  )
  return 0
}

export function registerExportCommand(program: Command, cwd: string): void {
  program
    .command('export')
    .description('Export collected telemetry as JSON')
    .option('-o, --output <file>', 'output file path')
    .option('--stdout', 'write JSON to stdout')
    .option('--force', 'overwrite an existing output file')
    .action(async (options: ExportOptions) => {
      const code = await runExport(options, cwd)
      if (code !== 0) process.exitCode = code
    })
}
