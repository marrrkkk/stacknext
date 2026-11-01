import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

export interface ProjectInfo {
  dir: string
  name: string
  packageJson: Record<string, unknown>
  packageManager: PackageManager
  scripts: Record<string, string>
  nextVersion: string | null
  nextMajor: number | null
  appDir: string | null
  srcDir: boolean
  instrumentationPath: string | null
  instrumentationExists: boolean
  typescript: boolean
  configExists: boolean
  hasDrizzle: boolean
  hasPrisma: boolean
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

export class ProjectDetectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectDetectionError'
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8')) as unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  const output: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') output[key] = entry
  }
  return output
}

export async function detectPackageManager(dir: string): Promise<PackageManager> {
  const lockfiles: Array<[string, PackageManager]> = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
    ['npm-shrinkwrap.json', 'npm'],
  ]
  for (const [file, manager] of lockfiles) {
    if (await exists(path.join(dir, file))) return manager
  }
  const packageJsonPath = path.join(dir, 'package.json')
  if (await exists(packageJsonPath)) {
    const packageJson = await readJson(packageJsonPath)
    if (isRecord(packageJson) && typeof packageJson.packageManager === 'string') {
      const name = packageJson.packageManager.split('@', 1)[0]
      if (name === 'pnpm' || name === 'npm' || name === 'yarn' || name === 'bun') {
        return name
      }
    }
  }
  return 'npm'
}

function parseMajor(version: string | null): number | null {
  if (!version) return null
  const match = /(\d+)/.exec(version.replace(/^[^\d]*/, ''))
  return match?.[1] ? Number(match[1]) : null
}

export async function findInstrumentationFile(
  dir: string,
  srcDir: boolean,
): Promise<string | null> {
  const roots = [srcDir ? path.join(dir, 'src') : null, dir].filter(
    (entry): entry is string => entry !== null,
  )
  const extensions = ['ts', 'tsx', 'js', 'mjs', 'jsx']
  for (const root of roots) {
    for (const extension of extensions) {
      const candidate = path.join(root, `instrumentation.${extension}`)
      if (await exists(candidate)) return candidate
    }
  }
  return null
}

export async function detectProject(cwd = process.cwd()): Promise<ProjectInfo> {
  const dir = path.resolve(cwd)
  const packageJsonPath = path.join(dir, 'package.json')
  if (!(await exists(packageJsonPath))) {
    throw new ProjectDetectionError(
      `No package.json found in ${dir}. Run NextScope from a Next.js project root.`,
    )
  }
  const rawPackageJson = await readJson(packageJsonPath)
  if (!isRecord(rawPackageJson)) {
    throw new ProjectDetectionError('package.json must contain a JSON object')
  }
  const dependencies = stringRecord(rawPackageJson.dependencies)
  const devDependencies = stringRecord(rawPackageJson.devDependencies)
  const allDependencies = { ...devDependencies, ...dependencies }
  const srcDir = await exists(path.join(dir, 'src'))
  let appDir: string | null = null
  if (await exists(path.join(dir, 'app'))) appDir = 'app'
  else if (await exists(path.join(dir, 'src', 'app'))) appDir = 'src/app'
  const instrumentationPath = await findInstrumentationFile(dir, srcDir)
  const packageManager = await detectPackageManager(dir)

  let installedNextVersion: string | null = null
  try {
    const installed = await readJson(path.join(dir, 'node_modules', 'next', 'package.json'))
    if (isRecord(installed) && typeof installed.version === 'string') {
      installedNextVersion = installed.version
    }
  } catch {
    // Not installed yet. Fall back to the declared range below.
  }
  const declaredNext = dependencies.next ?? devDependencies.next ?? null
  const nextVersion = installedNextVersion ?? declaredNext
  const name =
    typeof rawPackageJson.name === 'string' && rawPackageJson.name.length > 0
      ? rawPackageJson.name
      : path.basename(dir)

  return {
    dir,
    name,
    packageJson: rawPackageJson,
    packageManager,
    scripts: stringRecord(rawPackageJson.scripts),
    nextVersion,
    nextMajor: parseMajor(nextVersion),
    appDir,
    srcDir,
    instrumentationPath,
    instrumentationExists: instrumentationPath !== null,
    typescript: allDependencies.typescript !== undefined || (await exists(path.join(dir, 'tsconfig.json'))),
    configExists: await exists(path.join(dir, 'nextscope.config.json')),
    hasDrizzle: allDependencies['drizzle-orm'] !== undefined,
    hasPrisma: allDependencies['@prisma/client'] !== undefined || allDependencies.prisma !== undefined,
    dependencies,
    devDependencies,
  }
}

export function packageManagerCommand(
  manager: PackageManager,
  script: string,
): { command: string; args: string[] } {
  switch (manager) {
    case 'pnpm':
      return { command: 'pnpm', args: ['run', script] }
    case 'yarn':
      return { command: 'yarn', args: [script] }
    case 'bun':
      return { command: 'bun', args: ['run', script] }
    case 'npm':
      return { command: 'npm', args: ['run', script] }
  }
}

export function installCommand(
  manager: PackageManager,
  packages: string[],
  dev = true,
): string {
  const suffix = packages.join(' ')
  switch (manager) {
    case 'pnpm':
      return `pnpm add ${dev ? '-D ' : ''}${suffix}`
    case 'yarn':
      return `yarn add ${dev ? '-D ' : ''}${suffix}`
    case 'bun':
      return `bun add ${dev ? '-d ' : ''}${suffix}`
    case 'npm':
      return `npm install ${dev ? '--save-dev ' : ''}${suffix}`
  }
}

export function isNextScopeIntegrated(source: string): boolean {
  return source.includes('@nextscope/next')
}
