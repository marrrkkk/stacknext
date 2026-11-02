import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Public packages in dependency order. The dashboard is a CLI runtime dependency. */
export const PUBLIC_PACKAGES = [
  { name: '@stacknext/core', dir: 'packages/core' },
  { name: '@stacknext/diagnostics', dir: 'packages/diagnostics' },
  { name: '@stacknext/regression', dir: 'packages/regression' },
  { name: '@stacknext/next', dir: 'packages/next' },
  { name: '@stacknext/drizzle', dir: 'packages/drizzle' },
  { name: '@stacknext/prisma', dir: 'packages/prisma' },
  { name: '@stacknext/playwright', dir: 'packages/playwright' },
  { name: '@stacknext/mcp', dir: 'packages/mcp' },
  { name: '@stacknext/dashboard', dir: 'packages/dashboard' },
  { name: 'stacknext', dir: 'packages/cli' },
]

export function tarballName(name, version) {
  return `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`
}

export async function readPackage(dir) {
  return JSON.parse(await readFile(path.join(ROOT, dir, 'package.json'), 'utf8'))
}

export async function packPackages(options = {}) {
  const outDir = path.resolve(options.outDir ?? path.join(ROOT, 'release'))
  const version = options.version ?? (await readPackage('packages/core')).version
  if (options.clean !== false) await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  const packages = []
  for (const entry of PUBLIC_PACKAGES) {
    const manifest = await readPackage(entry.dir)
    if (manifest.version !== version) {
      throw new Error(
        `${manifest.name} is ${manifest.version}; expected aligned version ${version}`,
      )
    }
    execFileSync(
      'pnpm',
      ['--filter', entry.name, 'pack', '--pack-destination', outDir],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const file = path.join(outDir, tarballName(entry.name, version))
    packages.push({
      name: entry.name,
      dir: entry.dir,
      version,
      manifest,
      tarball: file,
    })
  }
  return { outDir, version, packages }
}

function tar(args) {
  return execFileSync('tar', args, { encoding: 'utf8' })
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

const SECRET_PATTERNS = [
  ['known example URL secret', /demo-url-secret/],
  ['known example bearer token', /super-secret-demo-token/],
  ['known example password', /hunter2/],
  ['example action attribute secret', /action-attribute-secret/],
  ['example custom attribute secret', /custom-attribute-secret/],
  ['example custom URL secret', /custom-url-secret/],
  ['example e2e URL secret', /e2e-url-secret/],
  ['npm authentication token', /npm_[A-Za-z0-9]{36}/],
  ['GitHub personal access token', /gh[pousr]_[A-Za-z0-9]{30,}/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['local user path', /\/(?:home|Users)\/[A-Za-z0-9._-]+\//],
]

const FORBIDDEN_PATH = /(^|\/)(?:src|test|tests|node_modules|\.next|\.stacknext|test-results|playwright-report|coverage|data)(\/|$)|\.(?:db|db-wal|db-shm|sqlite|env|log)$/i

function exportTargets(value, output = []) {
  if (typeof value === 'string') {
    output.push(value)
  } else if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) exportTargets(nested, output)
  }
  return output
}

export async function inspectTarball(entry) {
  const size = (await stat(entry.tarball)).size
  const listing = tar(['-tzf', entry.tarball]).trim().split('\n').filter(Boolean)
  const verbose = tar(['-tvzf', entry.tarball]).trim().split('\n').filter(Boolean)
  const packageJsonText = tar(['-xOf', entry.tarball, 'package/package.json'])
  const manifest = JSON.parse(packageJsonText)
  const files = listing.map((line) => line.replace(/^package\//, ''))
  const problems = []

  if (manifest.name !== entry.name) problems.push(`name is ${manifest.name}`)
  if (manifest.version !== entry.version) problems.push(`version is ${manifest.version}`)
  if (!manifest.license) problems.push('missing license field')
  if (!manifest.description) problems.push('missing description field')
  if (!manifest.repository) problems.push('missing repository field')
  if (!manifest.engines?.node) problems.push('missing engines.node')
  if (!files.includes('README.md')) problems.push('README.md is missing')
  if (!files.includes('LICENSE')) problems.push('LICENSE is missing')
  if (!files.some((file) => file.startsWith('dist/'))) problems.push('dist/ is missing')
  if (entry.name === 'stacknext' && !files.includes('dist/bin.js')) {
    problems.push('CLI bin entry is missing')
  }
  if (entry.name === '@stacknext/next') {
    if (!files.includes('dist/edge.js')) problems.push('edge-safe entry is missing')
    if (manifest.exports?.['.']?.edge !== './dist/edge.js') {
      problems.push('edge export condition is missing')
    }
  }
  for (const target of exportTargets(manifest.exports)) {
    if (!target.startsWith('./')) continue
    const normalized = target.replace(/^\.\//, '')
    if (
      normalized !== 'package.json' &&
      !files.includes(normalized) &&
      !files.some((file) => file.startsWith(normalized.replace(/\/$/, '') + '/'))
    ) {
      problems.push(`export target ${target} is missing from the archive`)
    }
  }
  if (JSON.stringify(manifest).includes('workspace:')) {
    problems.push('package.json still contains a workspace: dependency')
  }
  for (const dependency of [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]) {
    if (dependency.startsWith('@stacknext/')) {
      const range =
        manifest.dependencies?.[dependency] ??
        manifest.optionalDependencies?.[dependency] ??
        manifest.peerDependencies?.[dependency]
      if (!range || range.includes('workspace:')) {
        problems.push(`${dependency} has unresolved range ${range}`)
      }
    }
  }
  const forbidden = files.filter((file) => FORBIDDEN_PATH.test(file))
  if (forbidden.length > 0) {
    problems.push(`unexpected files: ${forbidden.slice(0, 5).join(', ')}`)
  }
  if (entry.name === 'stacknext') {
    const binLine = verbose.find((line) => line.includes('package/dist/bin.js'))
    if (binLine && !binLine.includes('rwx')) problems.push('dist/bin.js is not executable')
  }
  if (size > 25 * 1024 * 1024) {
    problems.push(`tarball is unexpectedly large (${formatBytes(size)})`)
  }

  const textFiles = files.filter((file) =>
    /\.(?:js|mjs|cjs|json|md|txt|d\.ts|map|css|html|svg)$/.test(file),
  )
  for (const file of textFiles) {
    let contents
    try {
      contents = tar(['-xOf', entry.tarball, `package/${file}`])
    } catch {
      continue
    }
    for (const [label, pattern] of SECRET_PATTERNS) {
      if (pattern.test(contents)) {
        problems.push(`${label} found in ${file}`)
      }
    }
  }

  const contents = await readFile(entry.tarball)
  const hash = createHash('sha256').update(contents).digest('hex')
  const integrity = `sha512-${createHash('sha512').update(contents).digest('base64')}`
  return {
    name: entry.name,
    version: entry.version,
    tarball: path.basename(entry.tarball),
    size,
    sizeLabel: formatBytes(size),
    fileCount: files.length,
    sha256: hash,
    integrity,
    files,
    manifest,
    problems,
  }
}

export async function validatePackages(packages) {
  const results = []
  for (const entry of packages) results.push(await inspectTarball(entry))
  const problems = results.flatMap((result) =>
    result.problems.map((problem) => `${result.name}: ${problem}`),
  )
  return { results, problems }
}

export async function writeManifest(outDir, version, results) {
  const manifest = {
    generatedAt: new Date().toISOString(),
    version,
    packages: results.map((result) => ({
      name: result.name,
      version: result.version,
      tarball: result.tarball,
      bytes: result.size,
      files: result.fileCount,
      sha256: result.sha256,
      integrity: result.integrity,
    })),
  }
  await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

export function printResults(results) {
  const width = Math.max(...results.map((result) => result.name.length))
  for (const result of results) {
    console.log(
      `  ${result.name.padEnd(width)}  ${result.version.padEnd(7)}  ${result.sizeLabel.padStart(9)}  ${String(result.fileCount).padStart(4)} files  ${result.sha256.slice(0, 12)}`,
    )
  }
}
