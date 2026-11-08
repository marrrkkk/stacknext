#!/usr/bin/env node
/**
 * Applies one release version across every tracked manifest and constant.
 *
 * This only edits files. The release-pr workflow owns the commit, branch and
 * pull request. Run it locally with --dry-run to inspect the plan.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PUBLIC_PACKAGES, ROOT } from './lib/release.mjs'
import { compareVersions, parseVersion } from './lib/versioning.mjs'

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : null
}

function flag(name) {
  return process.argv.includes(name)
}

const version = option('--version')
const date = option('--date') ?? new Date().toISOString().slice(0, 10)
const dryRun = flag('--dry-run')

if (!version) {
  console.error('Usage: node scripts/prepare-release.mjs --version x.y.z [--date YYYY-MM-DD] [--dry-run]')
  process.exit(1)
}

parseVersion(version)
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`Invalid release date "${date}". Expected YYYY-MM-DD.`)
  process.exit(1)
}

const JSON_FILES = [
  'package.json',
  'apps/example/package.json',
  ...PUBLIC_PACKAGES.map((entry) => `${entry.dir}/package.json`),
]

const SOURCE_VERSIONS = [
  {
    file: 'packages/cli/src/version.ts',
    name: 'CLI_VERSION',
    pattern: /(export const CLI_VERSION = ')([^']+)(')/,
  },
  {
    file: 'packages/core/src/types.ts',
    name: 'STACKNEXT_SDK_VERSION',
    pattern: /(export const STACKNEXT_SDK_VERSION = ')([^']+)(')/,
  },
  {
    file: 'packages/diagnostics/src/engine.ts',
    name: 'DIAGNOSTICS_ENGINE_VERSION',
    pattern: /(export const DIAGNOSTICS_ENGINE_VERSION = ')([^']+)(')/,
  },
  {
    file: 'packages/regression/src/constants.ts',
    name: 'STACKNEXT_REGRESSION_ENGINE_VERSION',
    pattern: /(export const STACKNEXT_REGRESSION_ENGINE_VERSION = ')([^']+)(')/,
  },
  {
    file: 'skills/stacknext-debugging/SKILL.md',
    name: 'Agent Skill metadata.version',
    pattern: /^(metadata:\s*\r?\n(?:[ \t]+.*\r?\n)*?[ \t]+version:\s*["']?)([^"'\r\n]+)(["']?\s*)$/m,
  },
]

const pending = []

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), 'utf8')
}

function stage(relativePath, contents) {
  pending.push({ file: relativePath, contents })
}

try {
  const manifests = []
  for (const file of JSON_FILES) {
    const manifest = JSON.parse(await read(file))
    manifests.push({ file, manifest })
  }

  const currentVersions = new Set(manifests.map(({ manifest }) => manifest.version))
  if (currentVersions.size !== 1) {
    throw new Error(
      `Package versions are not aligned: ${[...currentVersions].join(', ')}. ` +
        'Fix the manifests before preparing a release.',
    )
  }
  const currentVersion = [...currentVersions][0]
  if (compareVersions(version, currentVersion) <= 0) {
    throw new Error(`Release version ${version} must be greater than the current version ${currentVersion}.`)
  }

  for (const { file, name, pattern } of SOURCE_VERSIONS) {
    const source = await read(file)
    const match = pattern.exec(source)
    if (!match) throw new Error(`${name} was not found in ${file}.`)
    if (match[2] !== currentVersion) {
      throw new Error(`${name} in ${file} is ${match[2]}; expected ${currentVersion}.`)
    }
    stage(file, source.replace(pattern, `$1${version}$3`))
  }

  for (const { file, manifest } of manifests) {
    if (manifest.version !== currentVersion) {
      throw new Error(`${file} is ${manifest.version}; expected ${currentVersion}.`)
    }
    stage(file, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`)
  }

  const changelog = await read('CHANGELOG.md')
  if (changelog.includes(`## [${version}]`)) {
    throw new Error(`CHANGELOG.md already contains a section for ${version}.`)
  }
  const unreleased = '## [Unreleased]'
  const occurrences = changelog.split(unreleased).length - 1
  if (occurrences !== 1) {
    throw new Error(`CHANGELOG.md must contain exactly one "${unreleased}" heading.`)
  }
  stage(
    'CHANGELOG.md',
    changelog.replace(unreleased, `${unreleased}\n\n## [${version}] - ${date}`),
  )

  // Every input has been read and validated before the first write, so a
  // failed check never leaves a half-prepared worktree behind.
  for (const { file, contents } of pending) {
    if (!dryRun) await writeFile(path.join(ROOT, file), contents)
  }

  console.log(
    `${dryRun ? 'Would prepare' : 'Prepared'} StackNext ${version} (from ${currentVersion}, ${date}).`,
  )
  for (const { file } of pending) console.log(`  ${file}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
