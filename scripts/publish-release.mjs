#!/usr/bin/env node
/**
 * Publishes the validated archives in dependency order.
 *
 * Release workflow:
 *   node scripts/publish-release.mjs --version 0.6.0 --dry-run
 *   node scripts/publish-release.mjs --version 0.6.0 --publish
 *
 * Dry-run is the default. Real publishing requires `--publish`; outside GitHub
 * Actions it also requires `--allow-local-publish` for the documented first
 * release bootstrap. The script never creates tags, commits or GitHub releases.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import {
  PUBLIC_PACKAGES,
  ROOT,
  packPackages,
  printResults,
  readPackage,
  validatePackages,
  writeManifest,
} from './lib/release.mjs'

function option(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function flag(name) {
  return process.argv.includes(name)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    stdio: options.stdio ?? 'inherit',
    env: { ...process.env, ...options.env },
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}`)
  }
}

const dryRunFlag = flag('--dry-run')
const publish = flag('--publish')
if (dryRunFlag && publish) {
  throw new Error('Use either --dry-run or --publish, not both.')
}
const dryRun = !publish
const resume = flag('--resume') || flag('--only-missing')
const tag = option('--tag', 'latest')
const version = option('--version', (await readPackage('packages/core')).version)

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid release version "${version}"`)
}
if (!/^[A-Za-z][0-9A-Za-z._-]*$/.test(tag)) {
  throw new Error(`Invalid npm dist-tag "${tag}"`)
}

const inActions = process.env.GITHUB_ACTIONS === 'true'
const localPublish = publish && !inActions
if (localPublish && !flag('--allow-local-publish')) {
  throw new Error(
    'Refusing to publish outside GitHub Actions. Use --dry-run, or pass --allow-local-publish for the documented first-release bootstrap.',
  )
}
if (publish) {
  const status = spawnSync('git', ['status', '--porcelain'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  if (status.error) throw status.error
  if (status.status !== 0) throw new Error('git status failed')
  if (status.stdout.trim() !== '') {
    throw new Error('Refusing to publish from a worktree with uncommitted changes.')
  }
}

const outDir = path.resolve(
  option('--out', path.join(ROOT, 'release', 'publish')),
)

if (!flag('--skip-gates')) {
  console.log('Running release gates...')
  for (const [command, args] of [
    ['pnpm', ['lint']],
    ['pnpm', ['typecheck']],
    ['pnpm', ['test']],
    ['pnpm', ['build']],
    ['pnpm', ['check:docs']],
    ['pnpm', ['test:e2e']],
    ['pnpm', ['benchmark']],
    ['pnpm', ['benchmark:diagnostics']],
    ['pnpm', ['audit', '--prod']],
  ]) {
    run(command, args)
  }
}

const packed = await packPackages({ outDir, version })
const { results, problems } = await validatePackages(packed.packages)
const manifest = await writeManifest(outDir, packed.version, results)

console.log(`\nStackNext ${packed.version} publish archives (${outDir})\n`)
printResults(results)
if (problems.length > 0) {
  console.error(`\n${problems.length} archive validation problem(s):`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

async function registryHasVersion(name, releaseVersion) {
  const packagePath = name.replace('/', '%2f')
  const response = await fetch(
    `https://registry.npmjs.org/${packagePath}/${releaseVersion}`,
    { signal: AbortSignal.timeout(15_000) },
  )
  if (response.status === 200) return true
  if (response.status === 404) return false
  throw new Error(
    `Registry check for ${name}@${releaseVersion} returned HTTP ${response.status}`,
  )
}

const existing = []
for (const entry of PUBLIC_PACKAGES) {
  if (await registryHasVersion(entry.name, version)) existing.push(entry.name)
}
if (existing.length > 0) {
  const message = `Already published at ${version}: ${existing.join(', ')}`
  if (!resume) {
    if (!dryRun) throw new Error(`${message}. Re-run with --resume to publish only missing packages.`)
    console.warn(`\nWarning: ${message}`)
  } else {
    console.log(`\nResuming: skipping already published packages: ${existing.join(', ')}`)
  }
}

let published = 0
for (const result of results) {
  if (resume && existing.includes(result.name)) continue
  const archive = path.join(outDir, result.tarball)
  const args = ['publish', archive, '--access', 'public', '--tag', tag]
  if (dryRun) {
    args.push('--dry-run')
  } else if (inActions) {
    args.push('--provenance')
  } else {
    console.warn(
      '\nWarning: local bootstrap publishing cannot generate npm provenance. ' +
        'Configure trusted publishing for every package immediately after this release.',
    )
  }
  console.log(`\n${dryRun ? 'Would publish' : 'Publishing'} ${result.name}@${result.version}`)
  run('npm', args)
  if (!dryRun) published += 1
}

if (!dryRun) {
  for (const entry of PUBLIC_PACKAGES) {
    if (!(await registryHasVersion(entry.name, version))) {
      throw new Error(
        `Registry does not show ${entry.name}@${version} yet. Re-run with --resume after fixing the failure.`,
      )
    }
  }
  console.log(`\nPublished and verified all ${results.length} packages at ${version}.`)
  if (published < results.length) {
    console.log(`Skipped ${results.length - published} package(s) that were already published.`)
  }
} else {
  console.log(
    `\nDry run complete. ${manifest.packages.length} archives are ready; nothing was published.`,
  )
}
