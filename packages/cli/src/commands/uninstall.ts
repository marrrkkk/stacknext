import { readFile, readdir, rm, rmdir } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import { configPath } from '@stacknext/core/config-file'
import { detectProject, stackNextPackages } from '../project.js'
import { printCheck, printSection, style } from '../output.js'
import {
  isProcessAlive,
  readRuntimeState,
  runtimeDir,
  runtimeStatePath,
} from '../runtime.js'
import { fileExists, isGeneratedInstrumentation } from './init.js'

export interface UninstallOptions {
  yes?: boolean
  keepConfig?: boolean
  removeData?: boolean
  json?: boolean
}

interface PlannedRemoval {
  kind: 'instrumentation' | 'config' | 'runtime' | 'data'
  file: string
  reason: string
}

interface UninstallReport {
  project: string
  applied: boolean
  removed: PlannedRemoval[]
  preserved: Array<{ file: string; reason: string }>
  manual: string[]
  packageCommand: string | null
  runtimeProcess: number | null
}

async function removeGeneratedRuntimeFiles(dir: string): Promise<void> {
  try {
    const entries = await readdir(dir)
    // Keep the ignore file when any other runtime file survived. Removing it
    // could expose leftover token-bearing files to `git add`.
    if (entries.length !== 1 || entries[0] !== '.gitignore') return
    const gitignore = path.join(dir, '.gitignore')
    if ((await readFile(gitignore, 'utf8')) === '*\n') {
      await rm(gitignore, { force: true })
    }
  } catch {
    // Nothing to clean up.
  }
}

async function isEmptyDirectory(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).length === 0
  } catch {
    return false
  }
}

/**
 * Removes only files that StackNext owns. A user-authored instrumentation file
 * is always preserved, even when it imports StackNext. Generated instrumentation
 * is removed only when its contents still match the generated template.
 */
export async function runUninstall(
  options: UninstallOptions,
  cwd = process.cwd(),
): Promise<number> {
  const project = await detectProject(cwd)
  const removed: PlannedRemoval[] = []
  const preserved: UninstallReport['preserved'] = []
  const manual: string[] = []
  let runtimeProcess: number | null = null

  if (project.instrumentationExists && project.instrumentationPath) {
    const file = project.instrumentationPath
    const source = await readFile(file, 'utf8')
    if (isGeneratedInstrumentation(source)) {
      removed.push({
        kind: 'instrumentation',
        file,
        reason: 'generated StackNext instrumentation',
      })
    } else {
      preserved.push({
        file,
        reason: 'existing instrumentation belongs to the application',
      })
      if (source.includes('@stacknext/next')) {
        manual.push(
          `Remove the StackNext import and registerStackNext()/onRequestError hook from ${path.relative(project.dir, file)}.`,
        )
      }
    }
  }

  const configFile = configPath(project.dir)
  if (await fileExists(configFile)) {
    if (options.keepConfig) {
      preserved.push({ file: configFile, reason: '--keep-config was requested' })
    } else {
      removed.push({
        kind: 'config',
        file: configFile,
        reason: 'StackNext configuration',
      })
    }
  }

  const stateFile = runtimeStatePath(project.dir)
  const runtime = await readRuntimeState(project.dir).catch(() => null)
  if (runtime && isProcessAlive(runtime.pid)) {
    runtimeProcess = runtime.pid
    preserved.push({
      file: stateFile,
      reason: `StackNext is still running (pid ${runtime.pid}); stop it with SIGINT/SIGTERM first`,
    })
  } else if (await fileExists(stateFile)) {
    removed.push({ kind: 'runtime', file: stateFile, reason: 'runtime token state' })
  }

  if (options.removeData) {
    const dir = runtimeDir(project.dir)
    if (await fileExists(dir)) {
      if (runtimeProcess !== null) {
        preserved.push({
          file: dir,
          reason: `StackNext is still running (pid ${runtimeProcess}); stop it with SIGINT/SIGTERM first`,
        })
      } else {
        removed.push({
          kind: 'data',
          file: dir,
          reason: 'saved runs, baselines and comparisons (--remove-data)',
        })
      }
    }
  }

  const packages = stackNextPackages(project)
  const packageCommand =
    packages.length > 0
      ? installRemovalCommand(project.packageManager, packages)
      : null

  const report: UninstallReport = {
    project: project.dir,
    applied: false,
    removed,
    preserved,
    manual,
    packageCommand,
    runtimeProcess,
  }

  if (!options.yes) {
    if (options.json) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      printSection(`StackNext uninstall — ${project.name}`)
      printPlan(project.dir, removed, preserved, manual, packageCommand)
      console.log(
        `\n${style.yellow('No changes made.')} Re-run with ${style.cyan('stacknext uninstall --yes')} to remove the listed files.`,
      )
    }
    return runtimeProcess === null ? 0 : 1
  }

  if (runtimeProcess !== null) {
    if (options.json) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      printSection(`StackNext uninstall — ${project.name}`)
      printPlan(project.dir, removed, preserved, manual, packageCommand)
      console.error(
        `\n${style.red('Refusing to remove files while StackNext is running.')} Stop pid ${runtimeProcess} first.`,
      )
    }
    return 1
  }

  for (const entry of removed) {
    if (entry.kind === 'data') {
      await rm(entry.file, { recursive: true, force: true })
    } else {
      await rm(entry.file, { force: true })
    }
  }
  const dir = runtimeDir(project.dir)
  await removeGeneratedRuntimeFiles(dir)
  if (await isEmptyDirectory(dir)) {
    await rmdir(dir).catch(() => undefined)
  }
  report.applied = true

  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    printSection(`StackNext uninstall — ${project.name}`)
    if (removed.length === 0) {
      printCheck('pass', 'No StackNext-owned files needed removal')
    }
    for (const entry of removed) {
      printCheck('pass', `Removed ${path.relative(project.dir, entry.file)}`, entry.reason)
    }
    for (const entry of preserved) {
      printCheck('warn', `Preserved ${path.relative(project.dir, entry.file)}`, entry.reason)
    }
    for (const instruction of manual) {
      console.log(`${style.yellow('!')} ${instruction}`)
    }
    if (packageCommand) {
      console.log(`\nRemove the packages with: ${style.cyan(packageCommand)}`)
    }
    console.log(
      `\nRuntime processes and ports were not touched. The dashboard stops when ${style.cyan('stacknext dev')} exits.`,
    )
  }
  return 0
}

function printPlan(
  projectDir: string,
  removed: PlannedRemoval[],
  preserved: UninstallReport['preserved'],
  manual: string[],
  packageCommand: string | null,
): void {
  if (removed.length === 0) {
    printCheck('pass', 'No StackNext-owned files to remove')
  }
  for (const entry of removed) {
    printCheck('fail', `Will remove ${path.relative(projectDir, entry.file)}`, entry.reason)
  }
  for (const entry of preserved) {
    printCheck('warn', `Will preserve ${path.relative(projectDir, entry.file)}`, entry.reason)
  }
  for (const instruction of manual) {
    console.log(`${style.yellow('!')} ${instruction}`)
  }
  if (packageCommand) {
    console.log(`\nPackage removal command: ${style.cyan(packageCommand)}`)
  }
}

function installRemovalCommand(
  manager: 'pnpm' | 'npm' | 'yarn' | 'bun',
  packages: string[],
): string {
  switch (manager) {
    case 'pnpm':
      return `pnpm remove ${packages.join(' ')}`
    case 'yarn':
      return `yarn remove ${packages.join(' ')}`
    case 'bun':
      return `bun remove ${packages.join(' ')}`
    case 'npm':
      return `npm uninstall ${packages.join(' ')}`
  }
}

export function registerUninstallCommand(program: Command, cwd: string): void {
  program
    .command('uninstall')
    .description('Remove StackNext-owned project files without touching user configuration')
    .option('--yes', 'apply the planned removals (without it, only prints the plan)')
    .option('--keep-config', 'keep stacknext.config.json')
    .option('--remove-data', 'also remove saved runs, baselines and comparisons')
    .option('--json', 'print machine-readable JSON')
    .action(async (options: UninstallOptions) => {
      const code = await runUninstall(options, cwd)
      if (code !== 0) process.exitCode = code
    })
}
