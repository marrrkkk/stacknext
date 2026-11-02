import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Command } from 'commander'
import { printCheck, printSection, style } from '../output.js'

const SKILL_DIRECTORY = 'stacknext-debugging'

export const SKILL_CLIENTS = {
  opencode: {
    label: 'OpenCode',
    path: path.join('.opencode', 'skills', SKILL_DIRECTORY),
  },
  codex: {
    label: 'Codex',
    path: path.join('.agents', 'skills', SKILL_DIRECTORY),
  },
  'claude-code': {
    label: 'Claude Code',
    path: path.join('.claude', 'skills', SKILL_DIRECTORY),
  },
} as const

export type SkillClient = keyof typeof SKILL_CLIENTS

export interface SkillPathOptions {
  json?: boolean
}

export interface SkillInstallOptions {
  client?: string
  dir?: string
  force?: boolean
  json?: boolean
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

/**
 * Resolves the skill from the installed package first. The second candidate
 * keeps `stacknext skill ...` working from the source tree before a pack.
 */
export async function resolveSkillDirectory(): Promise<string> {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(moduleDirectory, '..', '..', 'skills', SKILL_DIRECTORY),
    path.resolve(moduleDirectory, '..', '..', '..', '..', 'skills', SKILL_DIRECTORY),
  ]
  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, 'SKILL.md'))) return candidate
  }
  throw new Error(
    'The bundled StackNext Agent Skill was not found. Reinstall @stacknext/cli.',
  )
}

async function readSkillVersion(directory: string): Promise<string | null> {
  const source = await readFile(path.join(directory, 'SKILL.md'), 'utf8')
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const version = frontmatter?.[1]?.match(
    /^metadata:\s*\r?\n(?:[ \t]+.*\r?\n)*?[ \t]+version:\s*["']?([^"'\r\n]+)["']?\s*$/m,
  )
  return version?.[1] ?? null
}

export async function runSkillPath(options: SkillPathOptions = {}): Promise<number> {
  const directory = await resolveSkillDirectory()
  const version = await readSkillVersion(directory)
  if (options.json) {
    console.log(JSON.stringify({ path: directory, version }, null, 2))
  } else {
    console.log(directory)
  }
  return 0
}

export async function runSkillInstall(
  options: SkillInstallOptions,
  cwd = process.cwd(),
): Promise<number> {
  const client = options.client as SkillClient | undefined
  if (!client || !(client in SKILL_CLIENTS)) {
    throw new Error(
      'Choose a client with --client opencode, --client codex or --client claude-code.',
    )
  }
  const clientConfig = SKILL_CLIENTS[client]
  const source = await resolveSkillDirectory()
  const project = path.resolve(cwd, options.dir ?? '.')
  const destination = path.join(project, clientConfig.path)
  const existing = await pathExists(destination)

  if (existing && !options.force) {
    if (options.json) {
      console.log(
        JSON.stringify(
          { client, source, destination, installed: false, reason: 'destination-exists' },
          null,
          2,
        ),
      )
    } else {
      printCheck(
        'fail',
        `${clientConfig.label} Agent Skill already exists`,
        `${destination} — re-run with --force to replace it.`,
      )
    }
    return 1
  }

  if (existing) await rm(destination, { recursive: true, force: true })
  await mkdir(path.dirname(destination), { recursive: true })
  await cp(source, destination, { recursive: true })

  if (options.json) {
    console.log(JSON.stringify({ client, source, destination, installed: true }, null, 2))
  } else {
    printSection('StackNext Agent Skill')
    printCheck('pass', `Installed for ${clientConfig.label}`, destination)
    console.log(
      style.dim(
        'Restart or reload the client if it does not discover the skill automatically.',
      ),
    )
  }
  return 0
}

export function registerSkillCommand(program: Command, cwd: string): void {
  const skill = program
    .command('skill')
    .description('Inspect and install the bundled Agent Skill')

  skill
    .command('path')
    .description('Print the bundled Agent Skill directory')
    .option('--json', 'print a JSON result')
    .action(async (options: SkillPathOptions) => {
      const code = await runSkillPath(options)
      if (code !== 0) process.exitCode = code
    })

  skill
    .command('install')
    .description('Copy the Agent Skill into a project')
    .option('--client <client>', 'opencode, codex or claude-code')
    .option('--dir <project-dir>', 'project directory (defaults to the current directory)')
    .option('--force', 'replace an existing skill directory')
    .option('--json', 'print a JSON result')
    .action(async (options: SkillInstallOptions) => {
      const code = await runSkillInstall(options, cwd)
      if (code !== 0) process.exitCode = code
    })
}
