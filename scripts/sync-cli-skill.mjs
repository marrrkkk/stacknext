#!/usr/bin/env node
/**
 * Copies the portable Agent Skill into @stacknext/cli before packing so npm
 * users can install it from the package. The repository root remains the
 * canonical source; `--clean` removes the generated package copy after pack.
 */
import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'skills', 'stacknext-debugging')
const packageSkills = path.join(root, 'packages', 'cli', 'skills')
const target = path.join(packageSkills, 'stacknext-debugging')

await rm(packageSkills, { recursive: true, force: true })
if (!process.argv.includes('--clean')) {
  await mkdir(packageSkills, { recursive: true })
  await cp(source, target, { recursive: true })
}
