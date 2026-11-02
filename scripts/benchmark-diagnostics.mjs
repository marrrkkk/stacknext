#!/usr/bin/env node
/**
 * Diagnostics benchmark.
 *
 * Builds a synthetic sample that exercises all four diagnostic rules, then
 * measures cold report generation and the cached read paths. Run `pnpm build`
 * first. Numbers are machine-specific.
 */
import { performance } from 'node:perf_hooks'
import { startCollector } from '../packages/cli/dist/collector/server.js'
import { DEFAULT_CONFIG } from '../packages/core/dist/index.js'

const TOKEN = 'benchmark-token-0123456789abcdef'
const TRACES = 400
const TRACES_PER_BATCH = 10
const API_SAMPLES = 20
const EXPORT_SAMPLES = 5
const SERVICE = 'stacknext-diagnostics-benchmark'

const N_PLUS_ONE_TRACES = 30
const SLOW_DB_TRACES = 30
const REPEATED_HTTP_TRACES = 30
const ERROR_TRACES = 40

function pad(value, length) {
  return value.toString(16).padStart(length, '0')
}

function traceId(index) {
  return pad(index + 1, 32)
}

function spanId(trace, child = 0) {
  return pad((trace + 1) * 32 + child, 16)
}

function makeTrace(index, baseTime) {
  const trace = traceId(index)
  const rootSpan = spanId(index)
  const startTime = baseTime + index * 3
  const slowDb = index >= 50 && index < 50 + SLOW_DB_TRACES
  const durationMs = slowDb ? 400 : 12 + (index % 11) * 28
  const endTime = startTime + durationMs
  const route = index % 3 === 0 ? '/bench/slow' : '/bench/[id]'
  const root = {
    traceId: trace,
    spanId: rootSpan,
    name: `GET ${route}`,
    kind: 'server',
    startTime,
    endTime,
    durationMs,
    status: 'unset',
    serviceName: SERVICE,
    route,
    method: 'GET',
    statusCode: 200,
    nextSpanType: 'BaseServer.handleRequest',
    attributes: {
      'http.method': 'GET',
      'http.status_code': 200,
      'benchmark.trace_index': index,
    },
    events: [],
    resource: { 'service.name': SERVICE },
  }
  const childNames = [
    'resolve page components',
    'load route module',
    'prepare route module',
    'load app route module',
    'execute route',
    'render route',
    'serialize response',
    'flush response',
    'finalize route',
  ]
  const children = childNames.map((name, child) => {
    const childStart = startTime + child
    const childDuration = 1 + (child % 5)
    return {
      traceId: trace,
      spanId: spanId(index, child + 1),
      parentSpanId: rootSpan,
      name,
      kind: 'internal',
      startTime: childStart,
      endTime: childStart + childDuration,
      durationMs: childDuration,
      status: 'unset',
      serviceName: SERVICE,
      attributes: { 'next.span_type': name },
      events: [],
      resource: { 'service.name': SERVICE },
    }
  })

  if (slowDb) {
    const dbStart = startTime + 20
    children.push({
      traceId: trace,
      spanId: spanId(index, 20),
      parentSpanId: rootSpan,
      name: 'db SELECT tasks',
      kind: 'internal',
      startTime: dbStart,
      endTime: dbStart + 300,
      durationMs: 300,
      status: 'unset',
      serviceName: SERVICE,
      attributes: {
        'db.system': 'sqlite',
        'db.operation': 'SELECT',
        'stacknext.span.kind': 'custom',
        'stacknext.manual': true,
      },
      events: [],
      resource: { 'service.name': SERVICE },
    })
  }

  if (index >= 100 && index < 100 + REPEATED_HTTP_TRACES) {
    for (let call = 0; call < 3; call += 1) {
      const fetchStart = startTime + 30 + call * 10
      const url = `https://api.example.test/items/${index * 10 + call}`
      children.push({
        traceId: trace,
        spanId: spanId(index, 30 + call),
        parentSpanId: rootSpan,
        name: `fetch GET ${url}`,
        kind: 'client',
        startTime: fetchStart,
        endTime: fetchStart + 20,
        durationMs: 20,
        status: 'ok',
        serviceName: SERVICE,
        nextSpanType: 'AppRender.fetch',
        attributes: {
          'http.url': url,
          'http.method': 'GET',
          'http.status_code': 200,
        },
        events: [],
        resource: { 'service.name': SERVICE },
      })
    }
  }

  const errors =
    index >= 150 && index < 150 + ERROR_TRACES
      ? [
          {
            id: `benchmark-error-${index}`,
            message: 'Synthetic benchmark failure from the diagnostics workload',
            name: 'Error',
            stack:
              'Error: Synthetic benchmark failure\n    at handler (/bench/error/route.ts:1:1)',
            timestamp: startTime + 10,
            route: '/bench/error',
            method: 'GET',
            requestPath: '/bench/error',
            routerKind: 'App Router',
            routeType: 'route',
            traceId: trace,
            spanId: rootSpan,
            attributes: {},
          },
        ]
      : []

  const databaseQueries = []
  if (index < N_PLUS_ONE_TRACES) {
    for (let query = 0; query < 8; query += 1) {
      databaseQueries.push({
        id: `benchmark-query-${index}-${query}`,
        traceId: trace,
        spanId: rootSpan,
        timestamp: startTime + 5 + query,
        durationMs: 1,
        sql: `select * from tasks where project_id = ${index * 10 + query}`,
        databaseSystem: 'sqlite',
        operation: 'SELECT',
        success: true,
        source: 'drizzle',
        attributes: {},
      })
    }
  }

  return { spans: [root, ...children], errors, databaseQueries }
}

function percentile(values, fraction) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  )
  return sorted[index]
}

function stats(values) {
  if (values.length === 0) return { p50: null, p95: null, max: null }
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  }
}

function formatMs(value) {
  if (value === null) return 'n/a'
  return value < 10 ? value.toFixed(2) : value.toFixed(1)
}

function formatNumber(value) {
  return Math.round(value).toLocaleString('en-US')
}

async function timedFetch(url, headers) {
  const started = performance.now()
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`${url} failed with HTTP ${response.status}`)
  }
  await response.arrayBuffer()
  return performance.now() - started
}

async function main() {
  const baseTime = Date.now() - TRACES * 4
  const batches = []
  for (let index = 0; index < TRACES; index += TRACES_PER_BATCH) {
    const spans = []
    const errors = []
    const databaseQueries = []
    const last = Math.min(index + TRACES_PER_BATCH, TRACES)
    for (let trace = index; trace < last; trace += 1) {
      const generated = makeTrace(trace, baseTime)
      spans.push(...generated.spans)
      errors.push(...generated.errors)
      databaseQueries.push(...generated.databaseQueries)
    }
    batches.push({
      version: 1,
      instance: {
        instanceId: 'benchmark-diagnostics-instance',
        serviceName: SERVICE,
        projectName: SERVICE,
        sdkVersion: '0.6.1',
        runtime: 'nodejs',
      },
      spans,
      errors,
      databaseQueries,
    })
  }

  const collector = await startCollector({
    port: 0,
    autoPort: false,
    token: TOKEN,
    projectName: SERVICE,
    config: DEFAULT_CONFIG,
    dashboardDir: null,
  })

  try {
    const headers = {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    }
    const readHeaders = { authorization: `Bearer ${TOKEN}` }
    const batchLatencies = []
    const ingestStarted = performance.now()
    for (const batch of batches) {
      const started = performance.now()
      const response = await fetch(`${collector.url}/__stacknext/v1/ingest`, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch),
      })
      if (!response.ok) {
        throw new Error(`Ingest failed with HTTP ${response.status}`)
      }
      await response.arrayBuffer()
      batchLatencies.push(performance.now() - started)
    }
    const ingestElapsed = performance.now() - ingestStarted
    const spanCount = batches.reduce((sum, batch) => sum + batch.spans.length, 0)
    const queryCount = batches.reduce(
      (sum, batch) => sum + batch.databaseQueries.length,
      0,
    )
    const errorCount = batches.reduce((sum, batch) => sum + batch.errors.length, 0)

    console.log('StackNext diagnostics benchmark')
    console.log(
      `Node ${process.versions.node} · ${process.platform}/${process.arch} · ${new Date().toISOString()}`,
    )
    console.log(
      `${formatNumber(spanCount)} spans · ${formatNumber(TRACES)} requests · ${formatNumber(queryCount)} queries · ${formatNumber(errorCount)} errors (${batches.length} batches)`,
    )
    console.log('')
    console.log('Ingest')
    console.log(
      `  throughput      ${formatNumber(spanCount / (ingestElapsed / 1000))} spans/s`,
    )
    console.log(
      `  requests        ${formatNumber(TRACES / (ingestElapsed / 1000))} traces/s`,
    )
    console.log(
      `  batch latency   p50 ${formatMs(percentile(batchLatencies, 0.5))} ms · p95 ${formatMs(percentile(batchLatencies, 0.95))} ms · max ${formatMs(Math.max(...batchLatencies))} ms`,
    )

    const coldStarted = performance.now()
    const reportResponse = await fetch(`${collector.url}/api/diagnostics?limit=50`, {
      headers: readHeaders,
    })
    if (!reportResponse.ok) {
      throw new Error(`/api/diagnostics failed with HTTP ${reportResponse.status}`)
    }
    const report = await reportResponse.json()
    const coldMs = performance.now() - coldStarted
    const firstFinding = report.items?.[0]
    if (!firstFinding) {
      throw new Error('Diagnostics benchmark produced no findings')
    }

    console.log('')
    console.log('Diagnostics report')
    console.log(`  cold generation ${formatMs(coldMs)} ms`)
    console.log(
      `  findings        ${formatNumber(report.counts.total)} total · ${formatNumber(report.counts.byStatus.possible)} possible · ${formatNumber(report.counts.byStatus.observed)} observed · ${formatNumber(report.counts.byStatus['insufficient-evidence'])} insufficient-evidence`,
    )
    console.log(
      `  rules           ${Object.entries(report.counts.byCategory)
        .filter(([, count]) => count > 0)
        .map(([category, count]) => `${category}=${count}`)
        .join(' · ')}`,
    )
    console.log(
      `  sample          ${formatNumber(report.sample.requests)} requests · ${formatNumber(report.sample.spans)} spans · ${formatNumber(report.sample.databaseQueries)} queries · ${formatNumber(report.sample.errors)} errors`,
    )

    const endpoints = [
      ['/api/diagnostics?limit=50', 'diagnostics list (cached)'],
      [
        '/api/diagnostics?category=database&severity=warning&limit=50',
        'diagnostics filtered',
      ],
      [`/api/diagnostics/${encodeURIComponent(firstFinding.id)}`, 'diagnostic detail'],
      ['/api/summary', 'summary + overview'],
      ['/api/export', 'export + diagnostics'],
    ]

    console.log('')
    console.log(`Read API latency (${API_SAMPLES} samples per endpoint, ms)`)
    console.log('  endpoint                         p50      p95      max')
    for (const [path, label] of endpoints) {
      const samples = []
      const samplesToTake = label.startsWith('export') ? EXPORT_SAMPLES : API_SAMPLES
      for (let index = 0; index < 2 + samplesToTake; index += 1) {
        const elapsed = await timedFetch(`${collector.url}${path}`, readHeaders)
        if (index >= 2) samples.push(elapsed)
      }
      const result = stats(samples)
      console.log(
        `  ${label.padEnd(30)} ${formatMs(result.p50).padStart(7)} ${formatMs(result.p95).padStart(8)} ${formatMs(result.max).padStart(8)}`,
      )
    }

    const health = await (
      await fetch(`${collector.url}/api/health`, { headers: readHeaders })
    ).json()
    console.log('')
    console.log(
      `Store: ${formatNumber(health.counts.requests)} requests · ${formatNumber(health.counts.spans)} spans · ${formatNumber(health.counts.databaseQueries)} queries · ${formatNumber(health.counts.errors)} errors · ${formatNumber(health.store.dropped.capacity)} capacity drops`,
    )
    console.log(
      'Note: synthetic in-process loopback benchmark; real apps produce different finding mixes.',
    )
  } finally {
    await collector.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
