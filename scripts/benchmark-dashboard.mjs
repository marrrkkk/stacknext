#!/usr/bin/env node
/**
 * Dashboard runtime benchmark.
 *
 * Starts the built collector on an ephemeral loopback port, serves the built
 * dashboard, drives it with Playwright and measures live-refresh request volume,
 * long tasks, heap and DOM counters while synthetic telemetry arrives at
 * 10 events per second.
 *
 * Run `pnpm build` first. Numbers are machine-specific; pass `--enforce` to
 * fail when the plan budgets are exceeded.
 */
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { chromium } from '@playwright/test'
import { startCollector } from '../packages/cli/dist/collector/server.js'
import { parseStackNextConfig } from '../packages/core/dist/index.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DASHBOARD_DIST = path.join(ROOT, 'packages', 'dashboard', 'dist')
const TOKEN = 'dashboard-benchmark-token-0123456789abcdef'
const EVENTS_PER_SECOND = 10
const MEASURE_MS = 10_000
const ROUTE_SETTLE_MS = 2_000
const CYCLE_WAIT_MS = 500

const ROUTES = [
  ['/', 'overview'],
  ['/traces', 'traces'],
  ['/database', 'database'],
  ['/errors', 'errors'],
  ['/diagnostics', 'diagnostics'],
  ['/runs', 'runs'],
  ['/baselines', 'baselines'],
  ['/comparisons', 'comparisons'],
  ['/snapshots', 'snapshots'],
  ['/settings', 'settings'],
  ['/mcp', 'mcp'],
]

const args = process.argv.slice(2)
const enforce = args.includes('--enforce')
const verbose = args.includes('--verbose')
const flagValue = (name, fallback) => {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  const value = Number(args[index + 1])
  return Number.isFinite(value) && value >= 0 ? value : fallback
}
const budgets = {
  readsPerWindow: flagValue('--max-reads', 60),
  longTaskMs: flagValue('--max-long-task-ms', 100),
  heapGrowthMb: flagValue('--max-heap-growth-mb', 10),
  domNodeGrowth: flagValue('--max-dom-node-growth', 500),
  listenerGrowth: flagValue('--max-listener-growth', 100),
  initialJsGzipKb: flagValue('--max-initial-js-gzip-kb', 120),
  routeJsGzipKb: flagValue('--max-route-js-gzip-kb', 40),
}

function pad(value, length) {
  return value.toString(16).padStart(length, '0')
}

function traceId(index) {
  return pad(index + 1, 32)
}

function rootSpan(index, trace, baseTime, overrides = {}) {
  const spanId = pad((index + 1) * 16, 16)
  const startTime = baseTime + index
  const durationMs = 8 + (index % 13) * 4
  const route = index % 4 === 0 ? '/api/slow' : '/dashboard'
  return {
    traceId: trace,
    spanId,
    name: `GET ${route}`,
    kind: 'server',
    startTime,
    endTime: startTime + durationMs,
    durationMs,
    status: index % 17 === 0 ? 'error' : 'ok',
    serviceName: 'stacknext-dashboard-benchmark',
    route,
    method: 'GET',
    statusCode: index % 17 === 0 ? 500 : 200,
    nextSpanType: 'BaseServer.handleRequest',
    attributes: {
      'http.method': 'GET',
      'http.status_code': index % 17 === 0 ? 500 : 200,
      'benchmark.trace_index': index,
    },
    events: [],
    resource: { 'service.name': 'stacknext-dashboard-benchmark' },
    ...overrides,
  }
}

function makeBatch(index, baseTime) {
  const trace = traceId(index)
  const span = rootSpan(index, trace, baseTime)
  const children = Array.from({ length: 3 }, (_, child) => {
    const startTime = span.startTime + child + 1
    return {
      traceId: trace,
      spanId: pad((index + 1) * 16 + child + 1, 16),
      parentSpanId: span.spanId,
      name: ['load route module', 'execute route', 'serialize response'][child],
      kind: 'internal',
      startTime,
      endTime: startTime + 2 + child,
      durationMs: 2 + child,
      status: 'ok',
      serviceName: 'stacknext-dashboard-benchmark',
      attributes: { 'next.span_type': 'benchmark.child' },
      events: [],
      resource: { 'service.name': 'stacknext-dashboard-benchmark' },
    }
  })
  const errors =
    index % 10 === 0
      ? [
          {
            id: `benchmark-error-${index}`,
            message: `Benchmark failure ${index}`,
            name: index % 20 === 0 ? 'TypeError' : 'Error',
            stack: 'Error: Benchmark failure\n    at handler (/app/route.ts:1:1)',
            timestamp: baseTime + index,
            route: span.route,
            method: 'GET',
            requestPath: span.route,
            routerKind: 'App Router',
            routeType: 'route',
            traceId: trace,
            spanId: span.spanId,
            attributes: {},
          },
        ]
      : []
  const databaseQueries =
    index % 2 === 0
      ? [
          {
            id: `benchmark-query-${index}`,
            traceId: trace,
            spanId: span.spanId,
            timestamp: baseTime + index,
            durationMs: 3 + (index % 9),
            sql:
              index % 6 === 0
                ? 'select * from projects where id = $1'
                : 'select * from projects where status = $1 order by created_at desc',
            databaseSystem: 'sqlite',
            success: true,
            source: 'drizzle',
            attributes: {},
          },
        ]
      : []
  return {
    version: 1,
    instance: {
      instanceId: 'dashboard-benchmark-instance',
      serviceName: 'stacknext-dashboard-benchmark',
      projectName: 'stacknext-dashboard-benchmark',
      nextVersion: '16.4.3',
      sdkVersion: '0.7.0',
      runtime: 'nodejs',
    },
    spans: [span, ...children],
    errors,
    databaseQueries,
  }
}

async function postBatch(url, batch) {
  const response = await fetch(`${url}/__stacknext/v1/ingest`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(batch),
  })
  await response.arrayBuffer()
  if (!response.ok) {
    throw new Error(`ingest failed with HTTP ${response.status}`)
  }
}

async function fetchJson(url, pathname) {
  const response = await fetch(`${url}${pathname}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  })
  const body = await response.json()
  if (!response.ok) {
    throw new Error(`${pathname} failed with HTTP ${response.status}`)
  }
  return body
}

function startIngestLoop(url, startIndex, baseTime) {
  let index = startIndex
  let stopped = false
  let timer = null
  let inFlight = false

  const tick = async () => {
    if (stopped) return
    if (inFlight) return
    inFlight = true
    try {
      await postBatch(url, makeBatch(index, baseTime))
      index += 1
    } catch (error) {
      console.error(`  ingest error: ${error.message}`)
    } finally {
      inFlight = false
      if (!stopped) timer = setTimeout(tick, 1_000 / EVENTS_PER_SECOND)
    }
  }

  timer = setTimeout(tick, 1_000 / EVENTS_PER_SECOND)
  return {
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
    },
    nextIndex: () => index,
  }
}

async function bundleStats() {
  const indexPath = path.join(DASHBOARD_DIST, 'index.html')
  const html = await readFile(indexPath, 'utf8')
  const referenced = new Set(
    [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1]),
  )
  const assetDir = path.join(DASHBOARD_DIST, 'assets')
  const files = (await readdir(assetDir)).filter((file) => file.endsWith('.js'))
  const scripts = []
  for (const file of files) {
    const body = await readFile(path.join(assetDir, file))
    const href = `/assets/${file}`
    scripts.push({
      file,
      initial: referenced.has(href),
      minBytes: body.length,
      gzipBytes: gzipSync(body).length,
    })
  }
  const initial = scripts.filter((script) => script.initial)
  const route = scripts.filter((script) => !script.initial)
  const largestInitial = initial.reduce(
    (largest, script) => (script.gzipBytes > largest.gzipBytes ? script : largest),
    { file: 'none', minBytes: 0, gzipBytes: 0 },
  )
  const largestRoute = route.reduce(
    (largest, script) => (script.gzipBytes > largest.gzipBytes ? script : largest),
    { file: 'none', minBytes: 0, gzipBytes: 0 },
  )
  return {
    scriptCount: scripts.length,
    initialGzipBytes: initial.reduce((total, script) => total + script.gzipBytes, 0),
    initialMinBytes: initial.reduce((total, script) => total + script.minBytes, 0),
    largestInitial,
    largestRoute,
    route,
  }
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`
}

function formatMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
}

async function forceGc(cdp) {
  await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined)
}

async function runtimeCounters(cdp) {
  const heap = await cdp.send('Runtime.getHeapUsage').catch(() => ({ usedSize: 0 }))
  const dom = await cdp
    .send('Memory.getDOMCounters')
    .catch(() => ({ documents: 0, nodes: 0, jsEventListeners: 0 }))
  return {
    heapBytes: heap.usedSize ?? 0,
    documents: dom.documents ?? 0,
    nodes: dom.nodes ?? 0,
    listeners: dom.jsEventListeners ?? 0,
  }
}

async function main() {
  try {
    await access(path.join(DASHBOARD_DIST, 'index.html'))
    await access(path.join(ROOT, 'packages', 'cli', 'dist', 'collector', 'server.js'))
  } catch {
    throw new Error('Build first: pnpm build (dashboard dist and CLI dist are required)')
  }

  const projectDir = await mkdtemp(path.join(tmpdir(), 'stacknext-dashboard-benchmark-'))
  const baseTime = Date.now() - 120_000
  const collector = await startCollector({
    port: 0,
    autoPort: false,
    token: TOKEN,
    projectName: 'stacknext-dashboard-benchmark',
    dashboardDir: DASHBOARD_DIST,
    projectDir,
    config: parseStackNextConfig({ collector: { maxSpans: 20_000 } }),
    log: () => undefined,
  })

  let browser = null
  let ingest = null
  try {
    console.log('Dashboard benchmark')
    console.log(
      `  collector ${collector.url} · ${EVENTS_PER_SECOND} ingest events/s · ${MEASURE_MS / 1_000}s windows`,
    )

    // Seed enough data for lists and detail routes before the browser starts.
    const seedStart = Date.now()
    for (let index = 0; index < 100; index += 1) {
      await postBatch(collector.url, makeBatch(index, baseTime))
    }
    const seedMs = Date.now() - seedStart
    console.log(`  seeded 100 batches in ${seedMs.toLocaleString('en-US')} ms`)

    const traces = await fetchJson(collector.url, '/api/traces?limit=1')
    const errors = await fetchJson(collector.url, '/api/errors?limit=1')
    const traceRoute = traces.items?.[0]?.traceId
      ? `/traces/${traces.items[0].traceId}`
      : null
    const errorRoute = errors.items?.[0]?.id
      ? `/errors/${encodeURIComponent(errors.items[0].id)}`
      : null
    if (traceRoute) ROUTES.push([traceRoute, 'trace detail'])
    if (errorRoute) ROUTES.push([errorRoute, 'error detail'])

    ingest = startIngestLoop(collector.url, 100, Date.now())

    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.addInitScript(() => {
      window.__stacknextLongTasks = []
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__stacknextLongTasks.push({
              startTime: entry.startTime,
              duration: entry.duration,
            })
          }
        }).observe({ type: 'longtask', buffered: true })
      } catch {
        // Long-task entries are unavailable in some embedded browsers.
      }
    })

    const page = await context.newPage()
    const consoleErrors = []
    const failedResponses = []
    page.on('pageerror', (error) => consoleErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('response', (response) => {
      if (response.status() < 400) return
      const url = new URL(response.url())
      failedResponses.push(`${response.status()} ${url.pathname}`)
    })

    const cdp = await context.newCDPSession(page)
    await cdp.send('Performance.enable').catch(() => undefined)
    await cdp.send('HeapProfiler.enable').catch(() => undefined)

    await page.goto(`${collector.url}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(
      () => document.querySelector('#root')?.children.length > 0,
      null,
      { timeout: 15_000 },
    )
    await page.waitForTimeout(ROUTE_SETTLE_MS)
    await forceGc(cdp)
    const baseline = await runtimeCounters(cdp)

    const results = []
    for (const [pathname, label] of ROUTES) {
      const reads = []
      const onRequest = (request) => {
        if (request.method() !== 'GET') return
        const url = new URL(request.url())
        if (url.origin !== collector.url) return
        if (!url.pathname.startsWith('/api/')) return
        if (url.pathname === '/api/stream') return
        reads.push(url.pathname)
      }
      page.on('request', onRequest)
      try {
        await page.goto(`${collector.url}${pathname}`, { waitUntil: 'domcontentloaded' })
        await page.waitForFunction(
          () => document.querySelector('#root')?.children.length > 0,
          null,
          { timeout: 15_000 },
        )
        await page.waitForTimeout(ROUTE_SETTLE_MS)
        const resources = await page.evaluate(() =>
          performance
            .getEntriesByType('resource')
            .filter((entry) => entry.name.includes('/assets/'))
            .map((entry) => ({
              name: entry.name,
              decoded: entry.decodedBodySize ?? 0,
              transfer: entry.transferSize ?? 0,
            })),
        )
        reads.length = 0
        await page.evaluate(() => {
          window.__stacknextLongTasks = []
        })
        await page.waitForTimeout(MEASURE_MS)
        const longTasks = await page.evaluate(() => window.__stacknextLongTasks ?? [])
        const decodedBytes = resources.reduce((total, entry) => total + entry.decoded, 0)
        const transferBytes = resources.reduce((total, entry) => total + entry.transfer, 0)
        const maxLongTask = longTasks.reduce(
          (max, entry) => Math.max(max, entry.duration),
          0,
        )
        results.push({
          label,
          pathname,
          reads: reads.length,
          distinctReads: new Set(reads).size,
          paths: reads.reduce((counts, pathname) => {
            counts[pathname] = (counts[pathname] ?? 0) + 1
            return counts
          }, {}),
          resources: resources.length,
          decodedBytes,
          transferBytes,
          longTasks: longTasks.length,
          maxLongTask,
        })
      } finally {
        page.off('request', onRequest)
      }
    }

    await page.goto(`${collector.url}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(
      () => document.querySelector('#root')?.children.length > 0,
      null,
      { timeout: 15_000 },
    )
    await page.waitForTimeout(ROUTE_SETTLE_MS)
    await forceGc(cdp)
    const afterFirstCycle = await runtimeCounters(cdp)

    // A second pass over every route looks for growth that a single pass hides.
    for (const [pathname] of ROUTES) {
      await page.goto(`${collector.url}${pathname}`, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(
        () => document.querySelector('#root')?.children.length > 0,
        null,
        { timeout: 15_000 },
      )
      await page.waitForTimeout(CYCLE_WAIT_MS)
    }
    await page.goto(`${collector.url}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(ROUTE_SETTLE_MS)
    await forceGc(cdp)
    const afterSecondCycle = await runtimeCounters(cdp)

    // Hidden tab: headless Chromium keeps every page visible, so override the
    // visibility API and dispatch the same event a real tab switch would.
    const hiddenReads = []
    const onHiddenRequest = (request) => {
      if (request.method() !== 'GET') return
      const url = new URL(request.url())
      if (url.origin !== collector.url) return
      if (!url.pathname.startsWith('/api/')) return
      if (url.pathname === '/api/stream') return
      hiddenReads.push(url.pathname)
    }
    page.on('request', onHiddenRequest)
    try {
      const overridden = await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          get: () => true,
        })
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'hidden',
        })
        document.dispatchEvent(new Event('visibilitychange'))
        return document.hidden
      })
      if (!overridden) {
        throw new Error('could not simulate a hidden dashboard tab')
      }
      await page.waitForTimeout(500)
      hiddenReads.length = 0
      await page.waitForTimeout(MEASURE_MS)
    } finally {
      page.off('request', onHiddenRequest)
      await page.evaluate(() => {
        delete document.hidden
        delete document.visibilityState
        document.dispatchEvent(new Event('visibilitychange'))
      })
    }

    const bundle = await bundleStats()

    console.log('\nRead API requests during a settled 10 s live window')
    console.log(
      `  ${'route'.padEnd(18)} ${'reads'.padStart(6)} ${'distinct'.padStart(9)} ${'long'.padStart(6)} ${'max ms'.padStart(8)} ${'decoded'.padStart(10)}`,
    )
    for (const result of results) {
      console.log(
        `  ${result.label.padEnd(18)} ${String(result.reads).padStart(6)} ${String(result.distinctReads).padStart(9)} ${String(result.longTasks).padStart(6)} ${result.maxLongTask.toFixed(1).padStart(8)} ${formatKb(result.decodedBytes).padStart(10)}`,
      )
      if (verbose && result.reads > 0) {
        const paths = Object.entries(result.paths)
          .sort((left, right) => right[1] - left[1])
          .map(([pathname, count]) => `${pathname} ×${count}`)
          .join(', ')
        console.log(`    ${paths}`)
      }
    }

    console.log('\nBrowser memory and DOM counters')
    console.log(
      `  heap        baseline ${formatMb(baseline.heapBytes)} · after cycle 1 ${formatMb(afterFirstCycle.heapBytes)} · after cycle 2 ${formatMb(afterSecondCycle.heapBytes)}`,
    )
    console.log(
      `  documents   ${baseline.documents} → ${afterSecondCycle.documents}    nodes ${baseline.nodes} → ${afterSecondCycle.nodes}    listeners ${baseline.listeners} → ${afterSecondCycle.listeners}`,
    )
    console.log(`  hidden tab  ${hiddenReads.length} read requests in ${MEASURE_MS / 1_000}s`)
    console.log(
      `  console     ${consoleErrors.length === 0 ? 'no page errors' : `${consoleErrors.length} error(s): ${consoleErrors.slice(0, 3).join(' | ')}`}`,
    )
    if (failedResponses.length > 0) {
      const counts = failedResponses.reduce((all, entry) => {
        all[entry] = (all[entry] ?? 0) + 1
        return all
      }, {})
      console.log(
        `  http        ${Object.entries(counts)
          .map(([entry, count]) => `${entry} ×${count}`)
          .join(', ')}`,
      )
    }

    console.log('\nJavaScript assets (gzip)')
    console.log(
      `  initial     ${formatKb(bundle.initialGzipBytes)} gzip across ${bundle.scriptCount - bundle.route.length} chunk(s), ${formatKb(bundle.initialMinBytes)} minified`,
    )
    console.log(
      `  largest     ${bundle.largestInitial.file} ${formatKb(bundle.largestInitial.gzipBytes)} gzip, ${formatKb(bundle.largestInitial.minBytes)} minified`,
    )
    console.log(
      `  route max   ${bundle.largestRoute.file} ${formatKb(bundle.largestRoute.gzipBytes)} gzip, ${formatKb(bundle.largestRoute.minBytes)} minified`,
    )
    const largestRoutes = [...bundle.route]
      .sort((left, right) => right.gzipBytes - left.gzipBytes)
      .slice(0, 5)
    for (const chunk of largestRoutes) {
      console.log(
        `    ${chunk.file.padEnd(42)} ${formatKb(chunk.gzipBytes).padStart(10)} gzip`,
      )
    }

    if (enforce) {
      const failures = []
      for (const result of results) {
        if (result.reads > budgets.readsPerWindow) {
          failures.push(
            `${result.label}: ${result.reads} reads > ${budgets.readsPerWindow}`,
          )
        }
        if (result.maxLongTask > budgets.longTaskMs) {
          failures.push(
            `${result.label}: long task ${result.maxLongTask.toFixed(1)} ms > ${budgets.longTaskMs} ms`,
          )
        }
      }
      if (hiddenReads.length > 0) {
        failures.push(`hidden tab made ${hiddenReads.length} read request(s)`)
      }
      const heapGrowth = afterSecondCycle.heapBytes - afterFirstCycle.heapBytes
      if (heapGrowth > budgets.heapGrowthMb * 1024 * 1024) {
        failures.push(
          `heap grew ${formatMb(heapGrowth)} between route cycles > ${budgets.heapGrowthMb} MiB`,
        )
      }
      const nodeGrowth = afterSecondCycle.nodes - afterFirstCycle.nodes
      if (nodeGrowth > budgets.domNodeGrowth) {
        failures.push(
          `DOM nodes grew ${nodeGrowth} between route cycles > ${budgets.domNodeGrowth}`,
        )
      }
      const listenerGrowth = afterSecondCycle.listeners - afterFirstCycle.listeners
      if (listenerGrowth > budgets.listenerGrowth) {
        failures.push(
          `event listeners grew ${listenerGrowth} between route cycles > ${budgets.listenerGrowth}`,
        )
      }
      if (bundle.largestInitial.gzipBytes > budgets.initialJsGzipKb * 1024) {
        failures.push(
          `initial chunk ${bundle.largestInitial.file} ${formatKb(bundle.largestInitial.gzipBytes)} > ${budgets.initialJsGzipKb} KiB`,
        )
      }
      if (bundle.largestRoute.gzipBytes > budgets.routeJsGzipKb * 1024) {
        failures.push(
          `route chunk ${bundle.largestRoute.file} ${formatKb(bundle.largestRoute.gzipBytes)} > ${budgets.routeJsGzipKb} KiB`,
        )
      }
      if (consoleErrors.length > 0) {
        failures.push(`browser console reported ${consoleErrors.length} error(s)`)
      }
      if (failures.length > 0) {
        console.error('\nBudget failures')
        for (const failure of failures) console.error(`  - ${failure}`)
        process.exitCode = 1
      } else {
        console.log('\nAll enforced budgets passed.')
      }
    } else {
      console.log('\nBudgets are report-only. Pass --enforce to fail on the plan targets.')
    }
  } finally {
    ingest?.stop()
    await browser?.close().catch(() => undefined)
    await collector.close()
    await rm(projectDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
