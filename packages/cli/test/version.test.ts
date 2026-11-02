import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLI_VERSION } from '../src/version.js'
import { STACKNEXT_SDK_VERSION } from '@stacknext/core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

describe('release version alignment', () => {
  it('keeps the CLI, SDK and package versions aligned', async () => {
    const packages = ['core', 'cli', 'dashboard', 'diagnostics', 'drizzle', 'mcp', 'next', 'playwright', 'prisma', 'regression']
    const versions = await Promise.all(
      packages.map(async (name) => {
        const file = path.join(root, 'packages', name, 'package.json')
        return JSON.parse(await readFile(file, 'utf8')) as { version: string }
      }),
    )
    expect(new Set(versions.map((entry) => entry.version))).toEqual(new Set([CLI_VERSION]))
    expect(STACKNEXT_SDK_VERSION).toBe(CLI_VERSION)
  })
})
