#!/usr/bin/env node
/**
 * Validates actual package archives without leaving artifacts in the working
 * tree. Used by CI and `pnpm test:packages`.
 */
import path from 'node:path'
import {
  ROOT,
  packPackages,
  printResults,
  validatePackages,
  writeManifest,
} from './lib/release.mjs'

const outDir = path.resolve(
  process.env.STACKNEXT_PACK_DIR ?? path.join(ROOT, 'release', 'validation'),
)
const packed = await packPackages({ outDir })
const { results, problems } = await validatePackages(packed.packages)
await writeManifest(outDir, packed.version, results)

console.log(`Validated StackNext ${packed.version} archives in ${outDir}\n`)
printResults(results)
if (problems.length > 0) {
  console.error(`\n${problems.length} package validation problem(s):`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(
  `\nAll package archives passed validation. Manifest: ${path.join(outDir, 'manifest.json')}`,
)
