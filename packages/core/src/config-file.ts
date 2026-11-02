import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  StackNextConfigError,
  formatIssues,
  stackNextConfigSchema,
  parseStackNextConfig,
  type StackNextConfig,
} from './config.js'

export const CONFIG_FILE_NAME = 'stacknext.config.json'

export function configPath(projectDir: string): string {
  return path.join(projectDir, CONFIG_FILE_NAME)
}

export async function readConfigFile(projectDir: string): Promise<unknown | null> {
  try {
    const contents = await readFile(configPath(projectDir), 'utf8')
    try {
      return JSON.parse(contents) as unknown
    } catch (error) {
      throw new StackNextConfigError(
        `Could not parse ${CONFIG_FILE_NAME}`,
        [error instanceof Error ? error.message : String(error)],
      )
    }
  } catch (error) {
    if (error instanceof StackNextConfigError) throw error
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function loadConfig(projectDir: string): Promise<StackNextConfig> {
  const raw = await readConfigFile(projectDir)
  if (raw === null) return parseStackNextConfig({})
  const result = stackNextConfigSchema.safeParse(raw)
  if (!result.success) {
    throw new StackNextConfigError('Invalid StackNext configuration', formatIssues(result.error))
  }
  return parseStackNextConfig(raw)
}
