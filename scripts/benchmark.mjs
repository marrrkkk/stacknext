#!/usr/bin/env node
/**
 * Local collector benchmark.
 *
 * Sends synthetic spans through the real ingest endpoint and measures the read
 * API. Run `pnpm build` first. Numbers are machine-specific.
 */
import { performance } from 'node:perf_hooks'
import { startCollector } from '../packages/cli/dist/collector/server.js'
import { DEFAULT_CONFIG } from '../packages/core/dist/index.js'

const TOKEN = 'benchmark-token-0123456789abcdef'
const SPANS_PER_TRACE = 10
const TRACES = 500
const TRACES_PER_BATCH = 50
const API_SAMPLES = 20
const EXPORT_SAMPLES = 5

function pad(value, length) {
  return value.toString(16).padStart(length, '0')
}

function traceId(index) {
  return pad(index + 1, 32)
}

function spanId(trace, child = 0) {
  return pad((trace + 1) * 16 + child, 16)
}

function makeTrace(index, baseTime) {
  const trace = traceId(index)
  const rootSpan = spanId(index)
  const startTime = baseTime + index * 3
  const durationMs = 12 + (index % 11) * 28
  const endTime = startTime + durationMs
  const serviceName = 'stacknext-benchmark'
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
    serviceName,
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
    resource: { 'service.name': serviceName },
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
      serviceName,
      attributes: { 'next.span_type': name },
      events: [],
      resource: { 'service.name': serviceName },
    }
  })
  return [root, ...children]
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

async function main() {
  const baseTime = Date.now() - TRACES * 4
  const batches = []
  for (let index = 0; index < TRACES; index += TRACES_PER_BATCH) {
    const spans = []
    const last = Math.min(index + TRACES_PER_BATCH, TRACES)
    for (let trace = index; trace < last; trace += 1) {
      spans.push(...makeTrace(trace, baseTime))
    }
    batches.push({
      version: 1,
      instance: {
        instanceId: 'benchmark-instance',
        serviceName: 'stacknext-benchmark',
        projectName: 'stacknext-benchmark',
        sdkVersion: '0.6.1',
        runtime: 'nodejs',
      },
      spans,
      errors: [],
      databaseQueries: [],
    })
  }

  const collector = await startCollector({
    port: 0,
    autoPort: false,
    token: TOKEN,
    projectName: 'stacknext-benchmark',
    config: DEFAULT_CONFIG,
    dashboardDir: null,
  })

  try {
    const headers = {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    }
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

    const readHeaders = { authorization: `Bearer ${TOKEN}` }
    const endpoints = [
      ['/api/health', `health`],
      ['/api/summary', 'summary'],
      ['/api/coverage', 'coverage'],
      ['/api/requests?limit=50', 'requests'],
      ['/api/traces?limit=50', 'traces'],
      ['/api/database?limit=50', 'database'],
      ['/api/errors?limit=50', 'errors'],
      ['/api/export', 'export'],
    ]

    console.log('StackNext collector benchmark')
    console.log(
      `Node ${process.versions.node} · ${process.platform}/${process.arch} · ${new Date().toISOString()}`,
    )
    console.log(
      `${formatNumber(spanCount)} spans (${formatNumber(TRACES)} requests, ${batches.length} batches, ${SPANS_PER_TRACE} spans/trace)`,
    )
    console.log('')
    console.log('Ingest')
    console.log(
      `  throughput      ${formatNumber(spanCount / (ingestElapsed / 1000))} spans/s`,
    )
    console.log(
      `  requests        ${formatNumber((TRACES / (ingestElapsed / 1000)))} traces/s`,
    )
    console.log(
      `  batch latency   p50 ${formatMs(percentile(batchLatencies, 0.5))} ms · p95 ${formatMs(percentile(batchLatencies, 0.95))} ms · max ${formatMs(Math.max(...batchLatencies))} ms`,
    )
    console.log('')
    console.log(`Read API latency (${API_SAMPLES} samples per endpoint, ms)`)
    console.log('  endpoint                         p50      p95      max')

    for (const [path, label] of endpoints) {
      const samples = []
      const samplesToTake = label === 'export' ? EXPORT_SAMPLES : API_SAMPLES
      for (let index = 0; index < 2 + samplesToTake; index += 1) {
        const started = performance.now()
        const response = await fetch(`${collector.url}${path}`, { headers: readHeaders })
        if (!response.ok) {
          throw new Error(`${path} failed with HTTP ${response.status}`)
        }
        await response.arrayBuffer()
        if (index >= 2) samples.push(performance.now() - started)
      }
      const result = stats(samples)
      console.log(
        `  ${label.padEnd(30)} ${formatMs(result.p50).padStart(7)} ${formatMs(result.p95).padStart(8)} ${formatMs(result.max).padStart(8)}`,
      )
    }

    // A second summary pass without ingest exercises the revision-keyed cache.
    const cachedSummary = []
    for (let index = 0; index < API_SAMPLES; index += 1) {
      const started = performance.now()
      const response = await fetch(`${collector.url}/api/summary`, {
        headers: readHeaders,
      })
      if (!response.ok) {
        throw new Error(`/api/summary (cached) failed with HTTP ${response.status}`)
      }
      await response.arrayBuffer()
      cachedSummary.push(performance.now() - started)
    }
    const cached = stats(cachedSummary)
    console.log(
      `  ${'summary (cached revision)'.padEnd(30)} ${formatMs(cached.p50).padStart(7)} ${formatMs(cached.p95).padStart(8)} ${formatMs(cached.max).padStart(8)}`,
    )

    const health = await (
      await fetch(`${collector.url}/api/health`, { headers: readHeaders })
    ).json()
    console.log('')
    console.log(
      `Store: ${formatNumber(health.counts.requests)} requests · ${formatNumber(health.counts.spans)} spans · ${formatNumber(health.counts.databaseQueries)} queries · ${formatNumber(health.store.dropped.capacity)} capacity drops`,
    )
    console.log('Note: synthetic in-process loopback benchmark; real apps add Next.js overhead.')
  } finally {
    await collector.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
