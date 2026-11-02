#!/usr/bin/env node
/**
 * Validates documentation without external services:
 * - relative Markdown links and heading anchors resolve;
 * - documented pnpm scripts exist in the root manifest;
 * - no legacy brand remains in text sources.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const IGNORED_DIRS = new Set([
  '.git',
  '.next',
  '.stacknext',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'release',
  'test-results',
])
const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
])
const LINK_PATTERN = /!?\[[^\]]*]\(([^)]+)\)/g
const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const PNPM_PATTERN = /\bpnpm\s+(?:run\s+)?([a-z][\w-]*(?::[\w-]+)*)/g
const PNPM_BUILTINS = new Set([
  'add',
  'approve-builds',
  'audit',
  'build',
  'create',
  'dedupe',
  'dev',
  'dlx',
  'exec',
  'fetch',
  'import',
  'install',
  'licenses',
  'link',
  'list',
  'ls',
  'outdated',
  'pack',
  'patch',
  'patch-commit',
  'patch-remove',
  'prune',
  'publish',
  'rebuild',
  'remove',
  'rm',
  'run',
  'server',
  'setup',
  'start',
  'store',
  'test',
  'typecheck',
  'unlink',
  'unpack',
  'update',
  'why',
  'workspace',
])

const problems = []
const markdownFiles = []
const textFiles = []

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue
      await walk(full)
      continue
    }
    if (!entry.isFile()) continue
    const extension = path.extname(entry.name).toLowerCase()
    if (extension === '.md') markdownFiles.push(full)
    if (TEXT_EXTENSIONS.has(extension)) textFiles.push(full)
  }
}

function relative(file) {
  return path.relative(ROOT, file) || path.basename(file)
}

function slug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function headings(file) {
  let source
  try {
    source = await readFile(file, 'utf8')
  } catch {
    return null
  }
  const anchors = new Set()
  const counts = new Map()
  let fenced = false
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const match = HEADING_PATTERN.exec(line)
    if (!match) continue
    const base = slug(match[2])
    const count = counts.get(base) ?? 0
    counts.set(base, count + 1)
    anchors.add(count === 0 ? base : `${base}-${count}`)
  }
  return anchors
}

function linkTarget(raw) {
  let value = raw.trim()
  if (value.startsWith('<')) {
    const end = value.indexOf('>')
    if (end > 0) value = value.slice(1, end)
  } else {
    value = value.split(/\s+["'(]/, 1)[0]
  }
  return value
}

async function checkMarkdown(file) {
  const source = await readFile(file, 'utf8')
  for (const match of source.matchAll(LINK_PATTERN)) {
    const target = linkTarget(match[1])
    if (
      target === '' ||
      target.startsWith('#') ||
      /^(?:https?|mailto|tel|data):/i.test(target)
    ) {
      if (target.startsWith('#') && target.length > 1) {
        const anchors = await headings(file)
        if (anchors && !anchors.has(decodeURIComponent(target.slice(1)))) {
          problems.push(`${relative(file)}: missing heading anchor ${target}`)
        }
      }
      continue
    }
    const [rawPath, rawAnchor] = target.split('#')
    let decoded
    try {
      decoded = decodeURIComponent(rawPath)
    } catch {
      problems.push(`${relative(file)}: invalid URL encoding in ${target}`)
      continue
    }
    const resolved = decoded.startsWith('/')
      ? path.join(ROOT, decoded.slice(1))
      : path.resolve(path.dirname(file), decoded)
    let info
    try {
      info = await stat(resolved)
    } catch {
      problems.push(`${relative(file)}: missing link target ${target}`)
      continue
    }
    if (info.isDirectory()) continue
    if (rawAnchor && path.extname(resolved).toLowerCase() === '.md') {
      const anchors = await headings(resolved)
      if (anchors && !anchors.has(decodeURIComponent(rawAnchor))) {
        problems.push(`${relative(file)}: missing heading anchor ${target}`)
      }
    }
  }
}

async function main() {
  await walk(ROOT)
  for (const file of markdownFiles.sort()) await checkMarkdown(file)

  const rootManifest = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'))
  const scripts = new Set(Object.keys(rootManifest.scripts ?? {}))
  for (const file of markdownFiles) {
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(PNPM_PATTERN)) {
      const script = match[1]
      if (PNPM_BUILTINS.has(script)) continue
      if (!scripts.has(script) && (script.includes(':') || script === 'test')) {
        problems.push(`${relative(file)}: documented pnpm script "${script}" does not exist`)
      }
    }
  }

  for (const file of textFiles) {
    const source = await readFile(file, 'utf8')
    const legacyBrand = new RegExp(['next', 'scope'].join(''), 'i')
    if (legacyBrand.test(source)) {
      problems.push(`${relative(file)}: legacy brand remains`)
    }
  }

  if (problems.length > 0) {
    console.error(`${problems.length} documentation problem(s):`)
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(1)
  }
  console.log(
    `Documentation checks passed: ${markdownFiles.length} Markdown files, ${textFiles.length} text files.`,
  )
}

await main()
