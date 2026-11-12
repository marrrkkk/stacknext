import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLI_VERSION } from '../src/version.js'
import { STACKNEXT_SDK_VERSION } from '@stacknext/core'
import { DIAGNOSTICS_ENGINE_VERSION } from '@stacknext/diagnostics'
import { STACKNEXT_REGRESSION_ENGINE_VERSION } from '@stacknext/regression'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

describe('release version alignment', () => {
  it('keeps the CLI, SDK, packages and Agent Skill versions aligned', async () => {
    const packages = ['core', 'cli', 'dashboard', 'diagnostics', 'drizzle', 'mcp', 'next', 'playwright', 'prisma', 'regression']
    const manifests = [
      path.join(root, 'package.json'),
      path.join(root, 'apps', 'example', 'package.json'),
      path.join(root, 'apps', 'www', 'package.json'),
      ...packages.map((name) =>
        path.join(root, 'packages', name, 'package.json'),
      ),
    ]
    const versions = await Promise.all(
      manifests.map(async (file) => {
        return JSON.parse(await readFile(file, 'utf8')) as { version: string }
      }),
    )
    expect(new Set(versions.map((entry) => entry.version))).toEqual(new Set([CLI_VERSION]))
    expect(STACKNEXT_SDK_VERSION).toBe(CLI_VERSION)
    expect(DIAGNOSTICS_ENGINE_VERSION).toBe(CLI_VERSION)
    expect(STACKNEXT_REGRESSION_ENGINE_VERSION).toBe(CLI_VERSION)

    const skill = await readFile(
      path.join(root, 'skills', 'stacknext-debugging', 'SKILL.md'),
      'utf8',
    )
    const version = skill.match(
      /^metadata:\s*\r?\n(?:[ \t]+.*\r?\n)*?[ \t]+version:\s*["']?([^"'\r\n]+)["']?\s*$/m,
    )?.[1]
    expect(version).toBe(CLI_VERSION)
  })
})
