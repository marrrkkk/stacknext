#!/usr/bin/env node
/**
 * Validates documentation without external services:
 * - apps/docs/docs.json navigation entries resolve and every page has
 *   frontmatter;
 * - redirects resolve to local pages or documented GitHub engineering docs,
 *   including heading anchors on local destinations;
 * - package docs exist, have frontmatter and are included in `files`;
 * - relative and website-root Markdown links resolve, including extensionless
 *   Mintlify links, across the public site and the engineering knowledge base;
 * - absolute links to the public Mintlify site resolve to a navigation page or
 *   a configured redirect, including heading anchors;
 * - documented pnpm scripts exist in the root manifest;
 * - no manual llms.txt/llms-full.txt is committed;
 * - no legacy brand remains in text sources.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import {
  DOCUMENTED_PACKAGES,
  DOCS_DIR,
  redirectDestination,
} from './lib/docs.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DOCS_ROOT = path.join(ROOT, DOCS_DIR)
const DOCS_LABEL = DOCS_DIR
const DOCS_CONFIG = path.join(DOCS_ROOT, 'docs.json')
const IGNORED_PATHS = new Set([path.join(DOCS_ROOT, 'src')])
const GITHUB_BLOB = 'https://github.com/marrrkkk/stacknext/blob/main/'
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
  '.mdx',
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
      if (IGNORED_DIRS.has(entry.name) || IGNORED_PATHS.has(full)) continue
      await walk(full)
      continue
    }
    if (!entry.isFile()) continue
    const extension = path.extname(entry.name).toLowerCase()
    if (extension === '.md' || extension === '.mdx') markdownFiles.push(full)
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

function stripFrontmatter(source) {
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

function frontmatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)
  if (!match) return null
  const title = /^title:\s*(.+)$/m.exec(match[1])?.[1]?.trim().replace(/^["']|["']$/g, '')
  const description = /^description:\s*(.+)$/m.exec(match[1])?.[1]?.trim().replace(/^["']|["']$/g, '')
  return { title, description }
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
  for (const line of stripFrontmatter(source).split(/\r?\n/)) {
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

async function checkAnchor(file, rawAnchor, context) {
  if (!rawAnchor) return
  if (!['.md', '.mdx'].includes(path.extname(file).toLowerCase())) return
  let anchor
  try {
    anchor = decodeURIComponent(rawAnchor)
  } catch {
    problems.push(`${context}: invalid URL encoding in anchor #${rawAnchor}`)
    return
  }
  const anchors = await headings(file)
  if (anchors && !anchors.has(anchor)) {
    problems.push(`${context}: missing heading anchor #${rawAnchor}`)
  }
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

async function fileInfo(file) {
  try {
    return await stat(file)
  } catch {
    return null
  }
}

async function resolveTarget(base) {
  const direct = await fileInfo(base)
  if (direct?.isFile()) return base
  if (direct?.isDirectory()) {
    for (const index of ['index.md', 'index.mdx']) {
      const candidate = path.join(base, index)
      if ((await fileInfo(candidate))?.isFile()) return candidate
    }
  }
  if (!path.extname(base)) {
    for (const extension of ['.md', '.mdx']) {
      const candidate = `${base}${extension}`
      if ((await fileInfo(candidate))?.isFile()) return candidate
    }
    for (const index of ['index.md', 'index.mdx']) {
      const candidate = path.join(base, index)
      if ((await fileInfo(candidate))?.isFile()) return candidate
    }
  }
  return null
}

async function resolveLink(file, decoded) {
  const bases = decoded.startsWith('/')
    ? [path.join(DOCS_ROOT, decoded.slice(1)), path.join(ROOT, decoded.slice(1))]
    : [path.resolve(path.dirname(file), decoded)]
  for (const base of bases) {
    const resolved = await resolveTarget(base)
    if (resolved) return resolved
  }
  return null
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
    const resolved = await resolveLink(file, decoded)
    if (!resolved) {
      problems.push(`${relative(file)}: missing link target ${target}`)
      continue
    }
    if (rawAnchor && ['.md', '.mdx'].includes(path.extname(resolved).toLowerCase())) {
      const anchors = await headings(resolved)
      if (anchors && !anchors.has(decodeURIComponent(rawAnchor))) {
        problems.push(`${relative(file)}: missing heading anchor ${target}`)
      }
    }
  }
}

function collectPages(node, output) {
  if (typeof node === 'string') {
    output.push(node)
    return
  }
  if (Array.isArray(node)) {
    for (const item of node) collectPages(item, output)
    return
  }
  if (node && typeof node === 'object' && Array.isArray(node.pages)) {
    collectPages(node.pages, output)
  }
}

async function checkMintlifyConfig() {
  if (!(await fileInfo(DOCS_CONFIG))) {
    problems.push(`${DOCS_LABEL}/docs.json: site configuration is missing`)
    return null
  }
  let config
  try {
    config = JSON.parse(await readFile(DOCS_CONFIG, 'utf8'))
  } catch (error) {
    problems.push(`${DOCS_LABEL}/docs.json: ${error.message}`)
    return
  }
  if (config.$schema !== 'https://mintlify.com/docs.json') {
    problems.push(`${DOCS_LABEL}/docs.json: $schema must be https://mintlify.com/docs.json`)
  }
  if (!config.name) problems.push(`${DOCS_LABEL}/docs.json: missing name`)
  if (!config.theme) problems.push(`${DOCS_LABEL}/docs.json: missing theme`)
  if (!config.colors?.primary) problems.push(`${DOCS_LABEL}/docs.json: missing colors.primary`)
  if (typeof config.markdown?.instructions !== 'string' || !config.markdown.instructions.trim()) {
    problems.push(`${DOCS_LABEL}/docs.json: markdown.instructions is required for AI-readable docs`)
  }

  for (const [field, value] of [
    ['logo.light', config.logo?.light],
    ['logo.dark', config.logo?.dark],
    ['favicon', config.favicon],
  ]) {
    if (typeof value !== 'string' || !value.startsWith('/')) continue
    if (!(await fileInfo(path.join(DOCS_ROOT, value.slice(1))))) {
      problems.push(`${DOCS_LABEL}/docs.json: ${field} asset is missing: ${value}`)
    }
  }

  const pages = []
  collectPages(config.navigation?.groups, pages)
  if (pages.length === 0) {
    problems.push(`${DOCS_LABEL}/docs.json: navigation has no pages`)
    return
  }

  const seen = new Set()
  for (const page of pages) {
    if (page.startsWith('http://') || page.startsWith('https://')) {
      problems.push(`${DOCS_LABEL}/docs.json: navigation page must be local: ${page}`)
      continue
    }
    if (seen.has(page)) {
      problems.push(`${DOCS_LABEL}/docs.json: duplicate navigation entry ${page}`)
    }
    seen.add(page)
    const resolved = await resolveTarget(path.join(DOCS_ROOT, page))
    if (!resolved) {
      problems.push(`${DOCS_LABEL}/docs.json: navigation page does not exist: ${page}`)
      continue
    }
    const source = await readFile(resolved, 'utf8')
    const metadata = frontmatter(source)
    if (!metadata?.title) problems.push(`${relative(resolved)}: missing frontmatter title`)
    if (!metadata?.description) {
      problems.push(`${relative(resolved)}: missing frontmatter description`)
    }
  }

  const redirectSources = new Set()
  for (const redirect of Array.isArray(config.redirects) ? config.redirects : []) {
    const source = redirect?.source
    const destination = redirect?.destination
    if (typeof source !== 'string' || !source.startsWith('/')) {
      problems.push(`${DOCS_LABEL}/docs.json: redirect source must be a local path`)
      continue
    }
    if (redirectSources.has(source)) {
      problems.push(`${DOCS_LABEL}/docs.json: duplicate redirect source ${source}`)
    }
    redirectSources.add(source)
    if (typeof destination !== 'string' || destination.length === 0) {
      problems.push(`${DOCS_LABEL}/docs.json: redirect ${source} has no destination`)
      continue
    }
    if (destination.startsWith('/')) {
      const { pathname, fragment, dynamic } = redirectDestination(destination)
      if (!dynamic) {
        const resolved = await resolveTarget(path.join(DOCS_ROOT, pathname.slice(1)))
        if (!resolved) {
          problems.push(
            `${DOCS_LABEL}/docs.json: redirect ${source} points to missing page ${destination}`,
          )
        } else {
          await checkAnchor(
            resolved,
            fragment,
            `${DOCS_LABEL}/docs.json: redirect ${source} (${destination})`,
          )
        }
      }
      continue
    }
    if (destination.startsWith(GITHUB_BLOB)) {
      const target = path.join(ROOT, destination.slice(GITHUB_BLOB.length).split('#')[0])
      if (!(await fileInfo(target))) {
        problems.push(
          `${DOCS_LABEL}/docs.json: redirect ${source} points to missing repository file ${destination}`,
        )
      }
      continue
    }
    if (!/^https?:\/\//.test(destination)) {
      problems.push(
        `${DOCS_LABEL}/docs.json: redirect ${source} has unsupported destination ${destination}`,
      )
    }
  }

  for (const name of ['llms.txt', 'llms-full.txt']) {
    if (await fileInfo(path.join(DOCS_ROOT, name))) {
      problems.push(
        `${DOCS_LABEL}/${name}: do not commit a manual AI index; Mintlify generates it`,
      )
    }
  }

  return { pages, seen, config }
}

async function checkPackageDocs() {
  for (const entry of DOCUMENTED_PACKAGES) {
    const manifestPath = path.join(ROOT, entry.dir, 'package.json')
    let manifest
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    } catch (error) {
      problems.push(`${relative(manifestPath)}: ${error.message}`)
      continue
    }
    if (!Array.isArray(manifest.files) || !manifest.files.includes('docs')) {
      problems.push(`${relative(manifestPath)}: files must include "docs"`)
    }

    const docsDir = path.join(ROOT, entry.dir, 'docs')
    const docsFiles = await listMarkdown(docsDir)
    if (docsFiles.length === 0) {
      problems.push(`${relative(docsDir)}: no package documentation`)
    }
    const names = new Set(docsFiles.map((file) => path.basename(file)))
    for (const required of entry.required) {
      if (!names.has(required)) {
        problems.push(`${relative(path.join(docsDir, required))}: required file is missing`)
      }
    }
    for (const file of docsFiles) {
      const source = await readFile(file, 'utf8')
      const metadata = frontmatter(source)
      if (!metadata?.title) problems.push(`${relative(file)}: missing frontmatter title`)
      if (!metadata?.description) {
        problems.push(`${relative(file)}: missing frontmatter description`)
      }
    }
  }
}

async function checkPublicSiteUrls(navigation) {
  const known = new Set([''])
  const targets = new Map()
  const root = await resolveTarget(DOCS_ROOT)
  if (root) targets.set('', root)
  for (const page of navigation.pages) {
    known.add(page)
    const resolved = await resolveTarget(path.join(DOCS_ROOT, page))
    if (resolved) targets.set(page, resolved)
  }
  for (const redirect of Array.isArray(navigation.config.redirects) ? navigation.config.redirects : []) {
    const source = typeof redirect?.source === 'string' ? redirect.source : ''
    if (source.startsWith('/') && !source.includes('*') && !/(^|\/):[^/]+/.test(source)) {
      known.add(source.slice(1))
    }
  }
  const pattern =
    /https:\/\/stack-next\.mintlify\.site(?:\/([^\s)`"'<>?#]*))?(?:#([^\s)`"'<>?]*))?/g
  for (const file of textFiles) {
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(pattern)) {
      const pathname = (match[1] ?? '').replace(/\/$/, '')
      const fragment = match[2] ?? ''
      if (
        (pathname === '' && fragment === '') ||
        pathname === 'llms.txt' ||
        pathname === 'llms-full.txt' ||
        pathname.endsWith('.md')
      ) {
        continue
      }
      if (known.has(pathname)) {
        // Redirect sources are valid, but their destination anchor is checked
        // in checkMintlifyConfig. Only direct pages have a local target here.
        const resolved = targets.get(pathname)
        if (resolved) {
          await checkAnchor(
            resolved,
            fragment,
            `${relative(file)}: public documentation URL ${match[0]}`,
          )
        }
        continue
      }
      problems.push(`${relative(file)}: public documentation URL does not resolve: ${match[0]}`)
    }
  }
}

async function checkAgentPackageDocs() {
  const file = path.join(ROOT, 'packages', 'cli', 'src', 'agents.ts')
  let source
  try {
    source = await readFile(file, 'utf8')
  } catch (error) {
    problems.push(`${relative(file)}: ${error.message}`)
    return
  }
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const declaration = parsed.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((node) => ts.isIdentifier(node.name) && node.name.text === 'PACKAGE_DOCS')
  if (!declaration?.initializer || !ts.isArrayLiteralExpression(declaration.initializer)) {
    problems.push(`${relative(file)}: PACKAGE_DOCS array not found`)
    return
  }
  const slugs = []
  for (const entry of declaration.initializer.elements) {
    const properties = ts.isObjectLiteralExpression(entry)
      ? entry.properties.filter((property) =>
        property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
        property.name.text === 'slug')
      : []
    if (properties.length !== 1 || !ts.isPropertyAssignment(properties[0]) ||
        !ts.isStringLiteral(properties[0].initializer)) {
      problems.push(`${relative(file)}: cannot interpret PACKAGE_DOCS slug expression`)
      continue
    }
    slugs.push(properties[0].initializer.text)
  }
  const expected = DOCUMENTED_PACKAGES.map((entry) => entry.slug)
  for (const slug of expected) {
    if (!slugs.includes(slug)) {
      problems.push(`${relative(file)}: PACKAGE_DOCS is missing ${slug}`)
    }
  }
  for (const slug of slugs) {
    if (!expected.includes(slug)) {
      problems.push(`${relative(file)}: PACKAGE_DOCS has unknown package ${slug}`)
    }
  }
  if (new Set(slugs).size !== slugs.length) {
    problems.push(`${relative(file)}: PACKAGE_DOCS contains duplicate packages`)
  }
}

async function listMarkdown(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await listMarkdown(full)))
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(full)
  }
  return files.sort()
}

async function main() {
  await walk(ROOT)
  for (const file of markdownFiles.sort()) await checkMarkdown(file)

  const navigation = await checkMintlifyConfig()
  await checkPackageDocs()
  await checkAgentPackageDocs()
  if (navigation) await checkPublicSiteUrls(navigation)

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
    `Documentation checks passed: ${markdownFiles.length} Markdown files, ${textFiles.length} text files, ${navigation?.pages.length ?? 0} navigation pages.`,
  )
}

await main()
