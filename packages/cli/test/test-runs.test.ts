import { describe, expect, it } from 'vitest'
import { TestRunRegistry } from '../src/collector/test-runs.js'

const environment = {
  nodeVersion: 'v24.0.0',
  nextVersion: '16.4.3',
  platform: 'linux',
  arch: 'x64',
  runtime: 'nodejs' as const,
  databases: [],
  instrumentation: {
    verbose: false,
    verboseSource: 'disabled',
    captureFetch: true,
    captureErrors: true,
  },
  sdkVersion: '0.7.0',
}

function request(name: string) {
  return {
    name,
    projectName: 'demo',
    environment,
    collectorVersion: '0.7.0',
    command: {
      executable: 'pnpm',
      args: [],
      exitCode: 0,
      signal: null,
      durationMs: 1,
    },
  }
}

describe('TestRunRegistry', () => {
  it('evicts the oldest completed runs so capture evidence stays bounded', () => {
    let now = 1_000
    const registry = new TestRunRegistry({
      slowRequestMs: 500,
      isConnected: () => true,
      getDiagnosticReport: () => {
        throw new Error('not used')
      },
      lookupTrace: () => null,
      maxCompletedRuns: 1,
      now: () => now,
    })
    const first = registry.create(request('first'))
    now += 1
    registry.complete(first.id, { status: 'incomplete' })
    const second = registry.create(request('second'))
    now += 1
    registry.complete(second.id, { status: 'incomplete' })
    expect(registry.get(first.id)).toBeNull()
    expect(registry.get(second.id)?.status).toBe('incomplete')
    const third = registry.create(request('third'))
    expect(registry.list()).toHaveLength(2)
    expect(registry.list().map((run) => run.id)).toContain(third.id)
  })
})
