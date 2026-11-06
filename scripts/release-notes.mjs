#!/usr/bin/env node
/**
 * Extracts one version section from CHANGELOG.md for `gh release create`.
 * Falls back to a short generated note when the section is missing.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : null
}

const version = option('--version')
const out = option('--out')

if (!version) {
  console.error('Usage: node scripts/release-notes.mjs --version x.y.z [--out file]')
  process.exit(1)
}

const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8')
const heading = `## [${version}]`
const headingIndex = changelog.indexOf(heading)
let notes = `Release ${version}.`

if (headingIndex >= 0) {
  const lineEnd = changelog.indexOf('\n', headingIndex)
  const bodyStart = lineEnd === -1 ? changelog.length : lineEnd + 1
  const next = /^## /m.exec(changelog.slice(bodyStart))
  const body = changelog.slice(bodyStart, next ? bodyStart + next.index : undefined).trim()
  if (body) notes = body
}

if (out) {
  writeFileSync(out, `${notes}\n`)
} else {
  process.stdout.write(`${notes}\n`)
}
