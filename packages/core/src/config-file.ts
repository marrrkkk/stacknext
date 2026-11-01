import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  NextScopeConfigError,
  formatIssues,
  nextScopeConfigSchema,
  parseNextScopeConfig,
  type NextScopeConfig,
} from './config.js'

export const CONFIG_FILE_NAME = 'nextscope.config.json'

export function configPath(projectDir: string): string {
  return path.join(projectDir, CONFIG_FILE_NAME)
}

export async function readConfigFile(projectDir: string): Promise<unknown | null> {
  try {
    const contents = await readFile(configPath(projectDir), 'utf8')
    try {
      return JSON.parse(contents) as unknown
    } catch (error) {
      throw new NextScopeConfigError(
        `Could not parse ${CONFIG_FILE_NAME}`,
        [error instanceof Error ? error.message : String(error)],
      )
    }
  } catch (error) {
    if (error instanceof NextScopeConfigError) throw error
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function loadConfig(projectDir: string): Promise<NextScopeConfig> {
  const raw = await readConfigFile(projectDir)
  if (raw === null) return parseNextScopeConfig({})
  const result = nextScopeConfigSchema.safeParse(raw)
  if (!result.success) {
    throw new NextScopeConfigError('Invalid NextScope configuration', formatIssues(result.error))
  }
  return parseNextScopeConfig(raw)
}
