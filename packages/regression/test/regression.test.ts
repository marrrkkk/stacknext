import { mkdtemp, readFile, stat, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { TraceDetail } from '@stacknext/core'
import {
  capturedSampleFromSubmission,
  capturedTraceFromDetail,
  baselinePath,
  compareBaseline,
  compareEnvironments,
  computeRegressionStats,
  createRunId,
  DEFAULT_COMPARISON_OPTIONS,
  ensureRegressionDirs,
  loadRun,
  listBaselines,
  normalizePathLike,
  RegressionStorageError,
  regressionDir,
  removeBaseline,
  runPath,
  saveBaseline,
  saveComparison,
  saveRun,
  scenarioIdentity,
  traceIdentity,
  verifyTraceCorrelation,
  type Baseline,
  type CapturedSample,
  type CapturedScenario,
  type CapturedTrace,
  type EnvironmentSnapshot,
  type TestRun,
} from '../src/index.js'

const temporaryDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function temporaryDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'stacknext-regression-'))
  temporaryDirs.push(dir)
  return dir
}

const environment: EnvironmentSnapshot = {
  nodeVersion: 'v24.0.0',
  nextVersion: '16.4.3',
  platform: 'linux',
  arch: 'x64',
  runtime: 'nodejs',
  databases: ['drizzle'],
  instrumentation: {
    verbose: false,
    verboseSource: 'disabled',
    captureFetch: true,
    captureErrors: true,
  },
  sdkVersion: '0.6.0',
  playwrightVersion: '1.58.2',
}

function trace(overrides: Partial<CapturedTrace> = {}): CapturedTrace {
  return {
    traceId: 'a'.repeat(32),
    injectedSpanId: 'b'.repeat(16),
    key: 'GET|/api/items|BaseServer.handleRequest',
    method: 'GET',
    route: '/api/items',
    rootName: 'BaseServer.handleRequest',
    statusCode: 200,
    durationMs: 100,
    spanCount: 3,
    errorCount: 0,
    databaseQueryCount: 1,
    fetchCount: 0,
    spans: [
      {
        key: 'internal|server|BaseServer.handleRequest|BaseServer.handleRequest',
        name: 'BaseServer.handleRequest',
        kind: 'server',
        category: 'framework',
        durationMs: 100,
        status: 'ok',
      },
    ],
    queries: [
      {
        key: 'sql:abc',
        shape: 'select * from items',
        durationMs: 5,
        source: 'drizzle',
        success: true,
      },
    ],
    errors: [],
    ...overrides,
  }
}

function sample(overrides: Partial<CapturedSample> = {}): CapturedSample {
  return {
    id: `smp-${'1'.repeat(16)}`,
    status: 'passed',
    expectedStatus: 'passed',
    retry: 0,
    repeatEachIndex: 0,
    durationMs: 120,
    capturedAt: 1_000,
    correlation: {
      status: 'verified',
      reasons: [],
      traces: [trace()],
    },
    findings: [],
    ...overrides,
  }
}

function scenario(input: {
  id?: string
  samples?: CapturedSample[]
  title?: string
} = {}): CapturedScenario {
  const id = input.id ?? scenarioIdentity({
    title: input.title ?? 'loads items',
    file: 'tests/items.spec.ts',
    project: 'chromium',
    annotation: 'items',
  }).id
  return {
    identity: {
      ...scenarioIdentity({
        title: input.title ?? 'loads items',
        file: 'tests/items.spec.ts',
        project: 'chromium',
        annotation: 'items',
      }),
      id,
    },
    samples: input.samples ?? [sample()],
    findings: [],
    notes: [],
    limitations: [],
  }
}

function run(input: {
  id?: string
  status?: TestRun['status']
  scenarios?: CapturedScenario[]
  environment?: EnvironmentSnapshot
  createdAt?: number
} = {}): TestRun {
  const scenarios = input.scenarios ?? [scenario()]
  return {
    format: 'stacknext-test-run',
    version: 1,
    id: input.id ?? createRunId(),
    name: 'capture',
    projectName: 'demo',
    status: input.status ?? 'completed',
    createdAt: input.createdAt ?? 1_000,
    completedAt: (input.createdAt ?? 1_000) + 500,
    command: {
      executable: 'pnpm',
      args: ['exec', 'playwright', 'test'],
      exitCode: 0,
      signal: null,
      durationMs: 500,
    },
    environment: input.environment ?? environment,
    collector: { version: '0.6.0', connected: true },
    scenarios,
    warnings: [],
    notes: [],
    limitations: [],
    stats: computeRegressionStats(scenarios),
  }
}

function baseline(input: {
  id?: string
  scenarios?: CapturedScenario[]
  environment?: EnvironmentSnapshot
} = {}): Baseline {
  const scenarios = input.scenarios ?? [scenario()]
  return {
    format: 'stacknext-baseline',
    version: 1,
    id: input.id ?? `base-${'2'.repeat(16)}`,
    name: 'main',
    projectName: 'demo',
    createdAt: 2_000,
    sourceRunId: run().id,
    environment: input.environment ?? environment,
    scenarios,
    warnings: [],
    notes: [],
    limitations: [],
    stats: computeRegressionStats(scenarios),
  }
}

function detail(overrides: Partial<TraceDetail> = {}): TraceDetail {
  const base = trace()
  return {
    traceId: base.traceId,
    request: {
      id: base.traceId,
      traceId: base.traceId,
      name: 'BaseServer.handleRequest',
      method: 'GET',
      route: '/api/items',
      statusCode: 200,
      statusClass: '2xx',
      durationMs: 100,
      timestamp: 1,
      endTime: 101,
      spanCount: 1,
      errorCount: 0,
      databaseQueryCount: 1,
      fetchCount: 0,
      failed: false,
      slow: false,
      serviceName: 'demo',
    },
    spans: [
      {
        traceId: base.traceId,
        spanId: 'c'.repeat(16),
        parentSpanId: base.injectedSpanId,
        name: 'BaseServer.handleRequest',
        kind: 'server',
        startTime: 1,
        endTime: 101,
        durationMs: 100,
        status: 'ok',
        serviceName: 'demo',
        route: '/api/items',
        method: 'GET',
        statusCode: 200,
        attributes: {},
        events: [],
        resource: {},
        receivedAt: 1,
      },
    ],
    errors: [],
    databaseQueries: [
      {
        id: 'query-1',
        traceId: base.traceId,
        timestamp: 1,
        durationMs: null,
        sql: 'select * from items where id = $1',
        databaseSystem: 'sqlite',
        success: true,
        source: 'drizzle',
        attributes: {},
        receivedAt: 1,
      },
    ],
    startTime: 1,
    endTime: 101,
    durationMs: 100,
    missingParentSpanIds: [],
    warnings: [],
    ...overrides,
  }
}

describe('scenario identity', () => {
  it('is stable across executions and prefers explicit annotations', () => {
    const first = scenarioIdentity({
      title: 'loads items',
      file: 'tests/items.spec.ts',
      project: 'chromium',
      testId: 'playwright-test-id',
      annotation: 'items',
    })
    const second = scenarioIdentity({
      title: 'renamed title',
      file: 'tests/items.spec.ts',
      project: 'chromium',
      testId: 'different-test-id',
      annotation: 'items',
    })
    expect(first.id).toMatch(/^scn-[0-9a-f]{16}$/)
    expect(second.id).toBe(first.id)
    expect(first.source).toBe('annotation')
    expect(
      scenarioIdentity({
        title: 'x',
        file: 'a.spec.ts',
        project: 'chromium',
        annotation: 'other',
      }).id,
    ).not.toBe(first.id)
  })

  it('falls back to the Playwright test id and then title/file/project', () => {
    const byTestId = scenarioIdentity({
      title: 'x',
      file: 'a.spec.ts',
      project: 'chromium',
      testId: 'abc',
    })
    expect(byTestId.source).toBe('test-id')
    const byTitle = scenarioIdentity({
      title: 'x',
      file: 'a.spec.ts',
      project: 'chromium',
    })
    expect(byTitle.source).toBe('title')
    expect(byTitle.id).toBe(
      scenarioIdentity({
        title: 'x',
        file: './a.spec.ts',
        project: 'chromium',
      }).id,
    )
  })

  it('normalizes dynamic path segments without dropping the route shape', () => {
    expect(normalizePathLike('/projects/123')).toBe('/projects/:id')
    expect(normalizePathLike('/users/550e8400-e29b-41d4-a716-446655440000')).toBe(
      '/users/:id',
    )
    expect(normalizePathLike('/api/items?secret=1')).toBe('/api/items')
  })
})

describe('trace identity and correlation', () => {
  it('stores no trace or span ids in the identity key', () => {
    const first = traceIdentity(detail())
    const second = traceIdentity(
      detail({
        traceId: 'd'.repeat(32),
        spans: detail().spans.map((span) => ({
          ...span,
          traceId: 'd'.repeat(32),
          spanId: 'e'.repeat(16),
        })),
      }),
    )
    expect(first.key).toBe(second.key)
    expect(first.key).not.toContain(detail().traceId)
    expect(first.key).not.toContain('b'.repeat(16))
  })

  it('chooses the trace root deterministically when the injected parent is outside the sample', () => {
    const base = detail()
    const root = base.spans[0]!
    const child = {
      ...root,
      spanId: 'd'.repeat(16),
      parentSpanId: root.spanId,
      name: 'resolve page components',
      startTime: 0,
      endTime: 50,
      durationMs: 50,
    }
    const first = traceIdentity({ ...base, spans: [root, child] })
    const second = traceIdentity({ ...base, spans: [child, root] })
    expect(first.key).toBe(second.key)
    expect(first.rootName).toBe('BaseServer.handleRequest')
  })

  it('requires the injected span id to appear as a parent', () => {
    expect(
      verifyTraceCorrelation(detail(), detail().traceId, 'b'.repeat(16)),
    ).toEqual({ verified: true })
    expect(
      verifyTraceCorrelation(detail(), detail().traceId, 'f'.repeat(16)),
    ).toEqual({ verified: false, reason: 'injected-parent-not-found' })
    expect(
      verifyTraceCorrelation(detail(), 'f'.repeat(32), 'b'.repeat(16)),
    ).toEqual({ verified: false, reason: 'trace-id-mismatch' })
  })

  it('converts a trace to deterministic evidence and never invents query durations', () => {
    const captured = capturedTraceFromDetail(detail(), 'b'.repeat(16))
    expect(captured.traceId).toBe(detail().traceId)
    expect(captured.injectedSpanId).toBe('b'.repeat(16))
    expect(captured.queries[0]?.durationMs).toBeNull()
    expect(captured.spanCount).toBe(1)
    expect(captured.key).not.toContain(detail().traceId)
  })

  it('marks a submission incomplete when telemetry is missing or unverified', () => {
    const missing = capturedSampleFromSubmission({
      submission: {
        id: `smp-${'3'.repeat(16)}`,
        status: 'passed',
        expectedStatus: 'passed',
        retry: 0,
        repeatEachIndex: 0,
        durationMs: 50,
        capturedAt: 1,
        traces: [{ traceId: 'f'.repeat(32), injectedSpanId: 'e'.repeat(16) }],
      },
      lookupTrace: () => null,
      findingsForTrace: () => [],
    })
    expect(missing.correlation.status).toBe('incomplete')
    expect(missing.correlation.reasons).toContain('trace-not-found')
    expect(missing.correlation.reasons).toContain('no-verified-traces')

    const unverified = capturedSampleFromSubmission({
      submission: {
        id: `smp-${'4'.repeat(16)}`,
        status: 'passed',
        expectedStatus: 'passed',
        retry: 0,
        repeatEachIndex: 0,
        durationMs: 50,
        capturedAt: 1,
        traces: [{ traceId: detail().traceId, injectedSpanId: 'e'.repeat(16) }],
      },
      lookupTrace: () => detail(),
      findingsForTrace: () => [],
    })
    expect(unverified.correlation.status).toBe('incomplete')
    expect(unverified.correlation.reasons).toContain('injected-parent-not-found')
    expect(unverified.correlation.traces).toHaveLength(0)
  })
})

describe('storage', () => {
  it('creates private directories, writes 0600 records and refuses overwrites', async () => {
    const dir = await temporaryDir()
    const record = run()
    const file = await saveRun(dir, record)
    expect(file).toBe(runPath(dir, record.id))
    const dirMode = (await stat(regressionDir(dir))).mode & 0o777
    const fileMode = (await stat(file)).mode & 0o777
    expect(dirMode).toBe(0o700)
    expect(fileMode).toBe(0o600)
    expect(await readFile(path.join(regressionDir(dir), '.gitignore'), 'utf8')).toBe('*\n')
    expect((await loadRun(dir, record.id)).id).toBe(record.id)

    await expect(saveRun(dir, record)).rejects.toMatchObject({ code: 'exists' })
    await expect(
      saveRun(dir, { ...record, name: 'replaced' }, { overwrite: true }),
    ).resolves.toBe(file)
    expect((await loadRun(dir, record.id)).name).toBe('replaced')
  })

  it('rejects invalid records and never removes baselines implicitly', async () => {
    const dir = await temporaryDir()
    await ensureRegressionDirs(dir)
    const record = await saveBaseline(dir, baseline())
    expect(await removeBaseline(dir, baseline().id)).toBe(true)
    expect(await removeBaseline(dir, baseline().id)).toBe(false)
    await expect(loadRun(dir, 'run-0000000000000000')).rejects.toBeInstanceOf(
      RegressionStorageError,
    )
    expect(record).toContain('base-')
  })

  it('refuses to write a record larger than the 16 MiB cap', async () => {
    const dir = await temporaryDir()
    const large = run()
    const bigSpans = Array.from({ length: 500 }, (_, index) => ({
      key: `${String(index).padStart(4, '0')}${'x'.repeat(1_996)}`,
      name: 'span',
      kind: 'server' as const,
      category: 'framework' as const,
      durationMs: 1,
      status: 'ok' as const,
    }))
    large.scenarios = [
      scenario({
        samples: [
          sample({
            correlation: {
              status: 'verified',
              reasons: [],
              traces: Array.from({ length: 20 }, (_, index) =>
                trace({
                  traceId: index.toString(16).padStart(32, '0'),
                  injectedSpanId: index.toString(16).padStart(16, '0'),
                  spans: bigSpans,
                }),
              ),
            },
          }),
        ],
      }),
    ]
    large.stats = computeRegressionStats(large.scenarios)
    await expect(saveRun(dir, large)).rejects.toMatchObject({ code: 'too-large' })
    await expect(loadRun(dir, large.id)).rejects.toMatchObject({ code: 'not-found' })
  })

  it('keeps valid records listable when one saved record is invalid', async () => {
    const dir = await temporaryDir()
    await saveBaseline(dir, baseline())
    await ensureRegressionDirs(dir)
    await writeFile(baselinePath(dir, 'base-0000000000000000'), '{not json')
    const result = await listBaselines(dir)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.id).toBe(baseline().id)
    expect(result.total).toBe(1)
    expect(result.invalid).toBe(1)
  })
})

describe('environment compatibility', () => {
  it('reports every measurement-relevant difference', () => {
    const differences = compareEnvironments(environment, {
      ...environment,
      nodeVersion: 'v22.0.0',
      databases: ['drizzle', 'prisma'],
      instrumentation: { ...environment.instrumentation, verbose: true },
    })
    expect(differences.map((difference) => difference.field)).toEqual([
      'databases',
      'instrumentation.verbose',
      'nodeVersion',
    ])
  })
})

describe('deterministic comparison', () => {
  it('classifies a duration regression with medians and a separate severity', () => {
    const baseScenario = scenario({
      samples: [
        sample({ id: `smp-${'1'.repeat(16)}`, capturedAt: 1, correlation: { status: 'verified', reasons: [], traces: [trace({ durationMs: 100 })] } }),
        sample({ id: `smp-${'2'.repeat(16)}`, capturedAt: 2, correlation: { status: 'verified', reasons: [], traces: [trace({ durationMs: 100 })] } }),
        sample({ id: `smp-${'3'.repeat(16)}`, capturedAt: 3, correlation: { status: 'verified', reasons: [], traces: [trace({ durationMs: 100 })] } }),
      ],
    })
    const candidateScenario = scenario({
      samples: [
        sample({ id: `smp-${'4'.repeat(16)}`, capturedAt: 4, correlation: { status: 'verified', reasons: [], traces: [trace({ durationMs: 200 })] } }),
        sample({ id: `smp-${'5'.repeat(16)}`, capturedAt: 5, correlation: { status: 'verified', reasons: [], traces: [trace({ durationMs: 200 })] } }),
        sample({ id: `smp-${'6'.repeat(16)}`, capturedAt: 6, correlation: { status: 'verified', reasons: [], traces: [trace({ durationMs: 200 })] } }),
      ],
    })
    const comparison = compareBaseline(
      baseline({ scenarios: [baseScenario] }),
      run({ scenarios: [candidateScenario] }),
      {},
      { id: `cmp-${'7'.repeat(16)}`, now: 5_000 },
    )
    expect(comparison.status).toBe('regressed')
    expect(comparison.severity).toBe('high')
    const duration = comparison.scenarios[0]?.metrics.find(
      (metric) => metric.key === 'scenario:duration',
    )
    expect(duration?.baselineValue).toBe(100)
    expect(duration?.candidateValue).toBe(200)
    expect(duration?.delta).toBe(100)
    expect(duration?.sampleCount).toBe(3)
  })

  it('is deterministic for identical evidence and metadata', () => {
    const base = baseline()
    const candidate = run()
    const first = compareBaseline(base, candidate, { minSamples: 1 }, { id: `cmp-${'8'.repeat(16)}`, now: 9_000 })
    const second = compareBaseline(base, candidate, { minSamples: 1 }, { id: `cmp-${'8'.repeat(16)}`, now: 9_000 })
    expect(first).toEqual(second)
    expect(first.status).toBe('unchanged')
  })

  it('reports the measured sample count for count metrics', () => {
    const baseScenario = scenario({
      samples: [
        sample({ id: `smp-${'1'.repeat(16)}`, capturedAt: 1 }),
        sample({ id: `smp-${'2'.repeat(16)}`, capturedAt: 2 }),
      ],
    })
    const candidateScenario = scenario({
      samples: [
        sample({ id: `smp-${'3'.repeat(16)}`, capturedAt: 3 }),
        sample({ id: `smp-${'4'.repeat(16)}`, capturedAt: 4 }),
      ],
    })
    const comparison = compareBaseline(
      baseline({ scenarios: [baseScenario] }),
      run({ scenarios: [candidateScenario] }),
      { minSamples: 1 },
      { id: `cmp-${'9'.repeat(16)}`, now: 5_000 },
    )
    const spans = comparison.scenarios[0]?.metrics.find(
      (metric) => metric.key === 'scenario:spans',
    )
    expect(spans?.sampleCount).toBe(2)
  })

  it('keeps null database durations unmeasured instead of treating them as zero', () => {
    const unmeasuredTrace = trace({
      queries: [
        {
          key: 'sql:abc',
          shape: 'select * from items',
          durationMs: null,
          source: 'drizzle',
          success: true,
        },
      ],
    })
    const baseScenario = scenario({
      samples: [1, 2, 3].map((index) =>
        sample({
          id: `smp-${String(index).repeat(16).slice(0, 16)}`,
          capturedAt: index,
          correlation: { status: 'verified', reasons: [], traces: [unmeasuredTrace] },
        }),
      ),
    })
    const comparison = compareBaseline(
      baseline({ scenarios: [baseScenario] }),
      run({ scenarios: [baseScenario] }),
      { minSamples: 1 },
      { id: `cmp-${'9'.repeat(16)}`, now: 9_000 },
    )
    const query = comparison.scenarios[0]?.metrics.find((metric) =>
      metric.key.startsWith('query-duration:'),
    )
    expect(query?.baselineValue).toBeNull()
    expect(query?.delta).toBeNull()
    expect(query?.status).toBe('inconclusive')
    expect(query?.unmeasured).toBe(true)
    expect(query?.note).toContain('Null is never treated as zero')
    expect(comparison.scenarios[0]?.status).toBe('unchanged')
  })

  it('requires minimum samples and makes environment mismatches inconclusive', () => {
    const candidateScenario = scenario({
      samples: [sample({ id: `smp-${'a'.repeat(16)}` }), sample({ id: `smp-${'b'.repeat(16)}` })],
    })
    const insufficient = compareBaseline(
      baseline(),
      run({ scenarios: [candidateScenario] }),
      { minSamples: 3 },
      { id: `cmp-${'a'.repeat(16)}`, now: 9_000 },
    )
    expect(insufficient.scenarios[0]?.status).toBe('inconclusive')
    expect(insufficient.scenarios[0]?.reasons.join(' ')).toContain('insufficient-samples')

    const mismatch = compareBaseline(
      baseline(),
      run({ environment: { ...environment, nodeVersion: 'v22.0.0' } }),
      {},
      { id: `cmp-${'b'.repeat(16)}`, now: 9_000 },
    )
    expect(mismatch.status).toBe('inconclusive')
    expect(mismatch.environment.compatible).toBe(false)
    expect(mismatch.environment.differences[0]?.field).toBe('nodeVersion')
  })

  it('allows an explicit environment override with a warning', () => {
    const comparison = compareBaseline(
      baseline(),
      run({ environment: { ...environment, nodeVersion: 'v22.0.0' } }),
      { ignoreEnvironment: true, minSamples: 1 },
      { id: `cmp-${'c'.repeat(16)}`, now: 9_000 },
    )
    expect(comparison.status).toBe('unchanged')
    expect(comparison.environment.ignored).toBe(true)
    expect(comparison.warnings.join(' ')).toContain('explicitly ignored')
  })

  it('treats trace shape changes and incomplete candidates as inconclusive', () => {
    const changedScenario = scenario({
      samples: [
        sample({
          correlation: {
            status: 'verified',
            reasons: [],
            traces: [trace({ key: 'GET|/other|BaseServer.handleRequest', route: '/other' })],
          },
        }),
      ],
    })
    const changed = compareBaseline(
      baseline(),
      run({ scenarios: [changedScenario] }),
      {},
      { id: `cmp-${'d'.repeat(16)}`, now: 9_000 },
    )
    expect(changed.status).toBe('inconclusive')

    const incomplete = compareBaseline(
      baseline(),
      run({ status: 'incomplete' }),
      {},
      { id: `cmp-${'e'.repeat(16)}`, now: 9_000 },
    )
    expect(incomplete.status).toBe('inconclusive')
    expect(incomplete.warnings.join(' ')).toContain('no regression verdict')
  })

  it('saves a comparison without overwriting an existing record', async () => {
    const dir = await temporaryDir()
    const comparison = compareBaseline(
      baseline(),
      run(),
      {},
      { id: `cmp-${'f'.repeat(16)}`, now: 9_000 },
    )
    await saveComparison(dir, comparison)
    await expect(saveComparison(dir, comparison)).rejects.toMatchObject({ code: 'exists' })
  })

  it('exposes conservative defaults', () => {
    expect(DEFAULT_COMPARISON_OPTIONS.minSamples).toBeGreaterThanOrEqual(3)
    expect(DEFAULT_COMPARISON_OPTIONS.ignoreEnvironment).toBe(false)
    expect(DEFAULT_COMPARISON_OPTIONS.countRegressionMin).toBe(1)
  })
})
