#!/usr/bin/env node
/**
 * Packs every public StackNext package with pnpm (which rewrites workspace
 * ranges), validates the resulting tarballs and writes a checksum manifest.
 *
 * Usage:
 *   node scripts/pack-release.mjs [--out <dir>] [--skip-build] [--json]
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import {
  ROOT,
  packPackages,
  printResults,
  validatePackages,
  writeManifest,
} from './lib/release.mjs'

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const outDir = path.resolve(option('--out') ?? path.join(ROOT, 'release'))
const json = process.argv.includes('--json')

if (!process.argv.includes('--skip-build')) {
  console.log('Building packages before packing...')
  const result = spawnSync('pnpm', ['build'], { cwd: ROOT, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const packed = await packPackages({ outDir })
const { results, problems } = await validatePackages(packed.packages)
const manifest = await writeManifest(outDir, packed.version, results)

if (json) {
  console.log(JSON.stringify({ ...manifest, problems }, null, 2))
} else {
  console.log(`\nStackNext ${packed.version} package archives (${outDir})\n`)
  printResults(results)
  console.log(`\nManifest: ${path.join(outDir, 'manifest.json')}`)
  if (problems.length > 0) {
    console.error(`\n${problems.length} package validation problem(s):`)
    for (const problem of problems) console.error(`  - ${problem}`)
  } else {
    console.log('All package archives passed validation.')
  }
}

process.exit(problems.length > 0 ? 1 : 0)
