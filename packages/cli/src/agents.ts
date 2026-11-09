import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const AGENTS_FILE_NAME = 'AGENTS.md'
export const AGENT_RULES_BEGIN = '<!-- BEGIN STACKNEXT AGENT RULES -->'
export const AGENT_RULES_END = '<!-- END STACKNEXT AGENT RULES -->'

export interface AgentPackageDocs {
  name: string
  version: string
  docsPath: string
  visibility: 'public' | 'internal'
  role: string
}

export interface AgentRulesOptions {
  version: string
  packages: AgentPackageDocs[]
}

export interface AgentRulesInstallResult {
  file: string
  status: 'created' | 'appended' | 'updated' | 'unchanged'
  changed: boolean
}

const PACKAGE_DOCS: Array<{
  slug: string
  name: string
  visibility: 'public' | 'internal'
  role: string
}> = [
  {
    slug: 'cli',
    name: '@stacknext/cli',
    visibility: 'public',
    role: 'CLI, collector and dashboard',
  },
  {
    slug: 'next',
    name: '@stacknext/next',
    visibility: 'public',
    role: 'Next.js instrumentation',
  },
  {
    slug: 'core',
    name: '@stacknext/core',
    visibility: 'internal',
    role: 'shared schemas, redaction and transport',
  },
  {
    slug: 'diagnostics',
    name: '@stacknext/diagnostics',
    visibility: 'internal',
    role: 'deterministic findings',
  },
  {
    slug: 'regression',
    name: '@stacknext/regression',
    visibility: 'internal',
    role: 'capture and comparison data',
  },
  {
    slug: 'playwright',
    name: '@stacknext/playwright',
    visibility: 'public',
    role: 'optional Playwright fixture',
  },
  {
    slug: 'drizzle',
    name: '@stacknext/drizzle',
    visibility: 'public',
    role: 'optional Drizzle adapter',
  },
  {
    slug: 'prisma',
    name: '@stacknext/prisma',
    visibility: 'public',
    role: 'optional Prisma adapter',
  },
  {
    slug: 'mcp',
    name: '@stacknext/mcp',
    visibility: 'internal',
    role: 'read-only MCP server',
  },
  {
    slug: 'dashboard',
    name: '@stacknext/dashboard',
    visibility: 'internal',
    role: 'static dashboard',
  },
]

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function findPackageDir(
  projectDir: string,
  slug: string,
): Promise<string | null> {
  let current = path.resolve(projectDir)
  for (;;) {
    const candidate = path.join(current, 'node_modules', '@stacknext', slug)
    if (await exists(path.join(candidate, 'package.json'))) return candidate
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

export async function discoverAgentPackages(
  projectDir: string,
): Promise<AgentPackageDocs[]> {
  const found: AgentPackageDocs[] = []
  const root = path.resolve(projectDir)
  for (const entry of PACKAGE_DOCS) {
    const packageDir = await findPackageDir(root, entry.slug)
    if (!packageDir) continue
    const manifestFile = path.join(packageDir, 'package.json')
    const docsFile = path.join(packageDir, 'docs', 'index.md')
    if (!(await exists(docsFile))) continue
    try {
      const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as {
        name?: unknown
        version?: unknown
      }
      const name = typeof manifest.name === 'string' ? manifest.name : entry.name
      const version = typeof manifest.version === 'string' ? manifest.version : 'unknown'
      const docsPath = path
        .relative(root, docsFile)
        .split(path.sep)
        .join('/')
      found.push({
        name,
        version,
        docsPath,
        visibility: entry.visibility,
        role: entry.role,
      })
    } catch {
      // An unreadable package manifest is not a reason to reference its docs.
    }
  }
  return found
}

export function renderAgentRules(options: AgentRulesOptions): string {
  const lines = [
    AGENT_RULES_BEGIN,
    '# StackNext',
    '',
    `StackNext is installed in this project (CLI v${options.version}). Its`,
    'version-matched documentation ships inside each installed npm package.',
    '',
    'Before using or changing a StackNext API:',
    '',
  ]
  const steps: string[] = []

  if (options.packages.length === 0) {
    steps.push(
      [
        'No StackNext package docs were found under `node_modules`. Install',
        '`@stacknext/cli` and the packages you use, then re-run',
        '`stacknext init --agents`. Do not assume package APIs are available.',
      ].join('\n'),
    )
  } else {
    const cli = options.packages.find((entry) => entry.name === '@stacknext/cli')
    if (cli) {
      steps.push(`Read \`${cli.docsPath}\` for the local documentation entry point.`)
    }
    const installed = options.packages
      .map(
        (entry) =>
          `- \`${entry.docsPath}\` — ${entry.name} ${entry.version} (${entry.visibility}, ${entry.role})`,
      )
      .join('\n')
    steps.push(
      `Read the package docs for every StackNext package involved in the task:\n${installed}`,
    )
    steps.push(
      'Confirm the installed version in the package.json next to each\ndocumentation directory. Do not apply documentation for another version.',
    )
  }

  steps.push(
    'Prefer the local documentation over external docs or model memory.',
    'Do not assume undocumented exports, configuration keys, internal\npackages or integrations exist.',
    'For runtime investigation, use the StackNext MCP tools where available.\nStart with `get_project_summary`; the server is local and read-only.',
    'Follow the installed `stacknext-debugging` Agent Skill for debugging and\nperformance workflows.',
    'Treat diagnostic findings as evidence, not confirmed root causes, and\n`inconclusive` regression comparisons as inconclusive, not passes.',
    'Verify changes against the installed implementation and tests where\navailable. Do not invent a fallback API when a package is absent.',
  )

  for (const [index, step] of steps.entries()) {
    const [first, ...rest] = step.split('\n')
    lines.push(`${index + 1}. ${first}`, ...rest.map((line) => `   ${line}`))
  }
  lines.push(AGENT_RULES_END)
  return lines.join('\n')
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function detectNewline(source: string): string {
  return source.includes('\r\n') ? '\r\n' : '\n'
}

function withNewline(block: string, newline: string): string {
  return newline === '\n' ? block : block.replace(/\n/g, newline)
}

/**
 * Adds or replaces only the managed StackNext block. User content outside the
 * markers is preserved exactly, including its line endings.
 */
export async function installAgentRules(
  projectDir: string,
  options: AgentRulesOptions,
): Promise<AgentRulesInstallResult> {
  const file = path.join(projectDir, AGENTS_FILE_NAME)
  const block = renderAgentRules(options)
  let source: string
  let created = false
  try {
    source = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    source = ''
    created = true
  }

  const begins = count(source, AGENT_RULES_BEGIN)
  const ends = count(source, AGENT_RULES_END)
  if (begins > 1 || ends > 1) {
    throw new Error(
      `${file} contains more than one StackNext managed block. Remove the duplicates before running init again.`,
    )
  }
  if (begins !== ends) {
    throw new Error(
      `${file} contains an incomplete StackNext managed block. Restore or remove the missing marker before running init again.`,
    )
  }

  const newline = detectNewline(source)
  let next: string
  let status: AgentRulesInstallResult['status']

  if (begins === 1 && ends === 1) {
    const pattern = new RegExp(
      `${escapeRegExp(AGENT_RULES_BEGIN)}[\\s\\S]*?${escapeRegExp(AGENT_RULES_END)}`,
    )
    if (!pattern.test(source)) {
      throw new Error(
        `${file} has StackNext markers in an unexpected order. Fix them manually before running init again.`,
      )
    }
    next = source.replace(pattern, withNewline(block, newline))
    status = next === source ? 'unchanged' : 'updated'
  } else if (created || source.trim() === '') {
    next = `${withNewline(block, newline)}${newline}`
    status = 'created'
  } else {
    const separator = source.endsWith(`${newline}${newline}`)
      ? ''
      : source.endsWith(newline)
        ? newline
        : `${newline}${newline}`
    next = `${source}${separator}${withNewline(block, newline)}${newline}`
    status = 'appended'
  }

  if (next !== source) await writeFile(file, next)
  return { file, status, changed: next !== source }
}
