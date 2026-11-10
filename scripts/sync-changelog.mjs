#!/usr/bin/env node
/**
 * Generates the website changelog data from the repository CHANGELOG.md.
 *
 * - `--check` verifies that the committed generated module is current.
 *
 * CHANGELOG.md stays canonical. The generated module is imported by
 * apps/www/app/changelog/page.tsx and is never edited by hand.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseChangelogReleases,
  renderChangelogModule,
} from './lib/changelog.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = path.join(ROOT, 'CHANGELOG.md')
const OUTPUT = path.join(ROOT, 'apps', 'www', 'content', 'changelog.generated.ts')
const check = process.argv.includes('--check')

function relative(file) {
  return path.relative(ROOT, file) || path.basename(file)
}

try {
  const changelog = await readFile(SOURCE, 'utf8')
  const releases = parseChangelogReleases(changelog)
  const contents = renderChangelogModule(releases)
  const current = await readFile(OUTPUT, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })

  if (check) {
    if (current !== contents) {
      console.error(
        `Website changelog is out of date. Run \`pnpm changelog:sync\` and commit ${relative(OUTPUT)}.`,
      )
      process.exit(1)
    }
    console.log('Website changelog is up to date.')
  } else if (current === contents) {
    console.log('Website changelog is already up to date.')
  } else {
    await mkdir(path.dirname(OUTPUT), { recursive: true })
    await writeFile(OUTPUT, contents)
    console.log(
      `Updated ${relative(OUTPUT)} from ${relative(SOURCE)} (${releases.length} releases).`,
    )
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
