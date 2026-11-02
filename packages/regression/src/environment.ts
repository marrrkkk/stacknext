import {
  STACKNEXT_SDK_VERSION,
  type ConnectionInfo,
  type NextOtelVerboseStatus,
  type StackNextConfig,
} from '@stacknext/core'
import type { EnvironmentDifference, EnvironmentSnapshot } from './schema.js'

export interface BuildEnvironmentInput {
  config: StackNextConfig
  connections?: ConnectionInfo[]
  verbose?: NextOtelVerboseStatus
  nodeVersion?: string
  platform?: string
  arch?: string
  observedDatabases?: string[]
  playwrightVersion?: string
}

function latestConnection(
  connections: ConnectionInfo[] | undefined,
): ConnectionInfo | null {
  if (!connections || connections.length === 0) return null
  return [...connections].sort((a, b) => b.lastSeen - a.lastSeen)[0] ?? null
}

function databaseNames(
  config: StackNextConfig,
  observed: string[] | undefined,
): string[] {
  const names = new Set<string>()
  if (config.database.drizzle) names.add('drizzle')
  if (config.database.prisma) names.add('prisma')
  for (const name of observed ?? []) {
    const normalized = name.trim().toLowerCase()
    if (normalized !== '') names.add(normalized)
  }
  return [...names].sort()
}

/**
 * Captures only environment facts that can change runtime measurements. No
 * hostnames, usernames, tokens or machine identifiers are stored.
 */
export function buildEnvironmentSnapshot(
  input: BuildEnvironmentInput,
): EnvironmentSnapshot {
  const connection = latestConnection(input.connections)
  const verbose = input.verbose ?? {
    enabled: input.config.instrumentation.verbose,
    source: input.config.instrumentation.verbose ? 'config' : 'disabled',
  }
  return {
    nodeVersion: connection?.runtimeVersion ?? input.nodeVersion ?? process.version,
    nextVersion: connection?.nextVersion ?? null,
    platform: input.platform ?? process.platform,
    arch: input.arch ?? process.arch,
    runtime: 'nodejs',
    databases: databaseNames(input.config, input.observedDatabases),
    instrumentation: {
      verbose: verbose.enabled,
      verboseSource: verbose.source,
      captureFetch: input.config.instrumentation.captureFetch,
      captureErrors: input.config.instrumentation.captureErrors,
    },
    sdkVersion: connection?.sdkVersion ?? STACKNEXT_SDK_VERSION,
    ...(input.playwrightVersion
      ? { playwrightVersion: input.playwrightVersion.slice(0, 100) }
      : {}),
  }
}

function valueOrNone(value: string | null | undefined): string {
  return value && value !== '' ? value : 'none'
}

function environmentValues(
  environment: EnvironmentSnapshot,
): Array<[string, string]> {
  return [
    ['nodeVersion', environment.nodeVersion],
    ['nextVersion', valueOrNone(environment.nextVersion)],
    ['platform', environment.platform],
    ['arch', environment.arch],
    ['runtime', environment.runtime],
    ['databases', environment.databases.join(',') || 'none'],
    ['instrumentation.verbose', environment.instrumentation.verbose ? 'enabled' : 'disabled'],
    ['instrumentation.captureFetch', environment.instrumentation.captureFetch ? 'enabled' : 'disabled'],
    ['instrumentation.captureErrors', environment.instrumentation.captureErrors ? 'enabled' : 'disabled'],
    ['sdkVersion', environment.sdkVersion],
    ['playwrightVersion', valueOrNone(environment.playwrightVersion)],
  ]
}

/**
 * Compares the environment recorded with each side. Any difference defaults to
 * an inconclusive comparison unless the caller explicitly overrides it.
 */
export function compareEnvironments(
  baseline: EnvironmentSnapshot,
  candidate: EnvironmentSnapshot,
): EnvironmentDifference[] {
  const candidateValues = new Map(environmentValues(candidate))
  const differences: EnvironmentDifference[] = []
  for (const [field, baselineValue] of environmentValues(baseline)) {
    const candidateValue = candidateValues.get(field) ?? 'none'
    if (baselineValue !== candidateValue) {
      differences.push({
        field,
        baseline: baselineValue.slice(0, 500),
        candidate: candidateValue.slice(0, 500),
      })
    }
  }
  return differences.sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0))
}
