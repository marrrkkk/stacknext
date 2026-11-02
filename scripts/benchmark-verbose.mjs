#!/usr/bin/env node
/**
 * Real-app verbose-tracing overhead benchmark.
 *
 * Starts the built StackNext CLI with the example app, measures sequential
 * requests with NEXT_OTEL_VERBOSE=0 and NEXT_OTEL_VERBOSE=1, and reports HTTP
 * latency plus observed span counts. The example app is started and stopped
 * once per mode per pair; no app is left running.
 *
 * Run `pnpm build` first. Numbers are machine-specific and include dev-server
 * compilation/cache effects; see docs/benchmark.md.
 */
import { spawn } from 'node:child_process'
import { access, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APP_DIR = path.join(ROOT, 'apps', 'example-next-app')
const CLI = path.join(ROOT, 'packages', 'cli', 'dist', 'bin.js')
const DASHBOARD_INDEX = path.join(ROOT, 'packages', 'dashboard', 'dist', 'index.html')
const RUNTIME_FILE = path.join(APP_DIR, '.stacknext', 'run.json')
const APP_URL = 'http://127.0.0.1:4402'
const SAMPLES = 40
const WARMUP = 10
const PAIRS = 2
const MODES = ['standard', 'verbose']
const ENDPOINTS = [
  ['/api/projects', 'route handler'],
  ['/', 'page render'],
]

let child = null
let appLog = ''

function appendLog(chunk) {
  appLog = `${appLog}${chunk}`.slice(-12_000)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function exists(file) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function readRuntime() {
  try {
    return JSON.parse(await readFile(RUNTIME_FILE, 'utf8'))
  } catch {
    return null
  }
}

async function fetchJson(url, token, timeoutMs = 10_000) {
  const response = await fetch(url, {
    headers: token
      ? { authorization: `Bearer ${token}`, accept: 'application/json' }
      : { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status}: ${text.slice(0, 400)}`)
  }
  return JSON.parse(text)
}

async function appIsUp() {
  try {
    const response = await fetch(`${APP_URL}/api/projects`, {
      signal: AbortSignal.timeout(2_000),
    })
    await response.arrayBuffer()
    return true
  } catch {
    return false
  }
}

async function waitFor(label, check, timeoutMs, intervalMs = 300) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(
        `stacknext dev exited with code ${child.exitCode} while waiting for ${label}\n${appLog}`,
      )
    }
    try {
      const value = await check()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await sleep(intervalMs)
  }
  throw new Error(
    `Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}\n${appLog}`,
  )
}

async function stopApp() {
  const current = child
  child = null
  if (!current) return
  if (current.exitCode === null) {
    if (process.platform !== 'win32' && current.pid) {
      try {
        process.kill(-current.pid, 'SIGINT')
      } catch {
        current.kill('SIGINT')
      }
    } else {
      current.kill('SIGINT')
    }
    const exited = await waitForExit(current, 10_000)
    if (!exited) {
      if (process.platform !== 'win32' && current.pid) {
        try {
          process.kill(-current.pid, 'SIGKILL')
        } catch {
          current.kill('SIGKILL')
        }
      } else {
        current.kill('SIGKILL')
      }
      await waitForExit(current, 5_000)
    }
  }
  await rm(RUNTIME_FILE, { force: true })
  await waitFor(
    'the example app to stop',
    async () => !(await appIsUp()),
    10_000,
    200,
  )
}

function waitForExit(target, timeoutMs) {
  if (target.exitCode !== null) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      target.off('exit', onExit)
      resolve(false)
    }, timeoutMs)
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    target.once('exit', onExit)
  })
}

async function assertCleanStart() {
  const existing = await readRuntime()
  if (existing && processAlive(existing.pid)) {
    throw new Error(
      `StackNext is already running for the example app at ${existing.dashboardUrl} (pid ${existing.pid}). Stop it before running the verbose benchmark.`,
    )
  }
  await rm(RUNTIME_FILE, { force: true })
  if (await appIsUp()) {
    throw new Error(
      `${APP_URL} already responds. Stop the existing Next.js dev server before running the verbose benchmark.`,
    )
  }
}

async function startApp(mode) {
  await assertCleanStart()
  appLog = ''
  child = spawn(process.execPath, [CLI, 'dev', '--quiet'], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_OTEL_VERBOSE: mode === 'verbose' ? '1' : '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  })
  child.stdout.on('data', (chunk) => appendLog(chunk.toString()))
  child.stderr.on('data', (chunk) => appendLog(chunk.toString()))

  const runtime = await waitFor(
    'the StackNext runtime file',
    async () => {
      const state = await readRuntime()
      return state && processAlive(state.pid) ? state : null
    },
    30_000,
  )
  await waitFor(
    'the collector',
    async () => {
      const response = await fetch(`${runtime.collectorUrl}/api/ping`, {
        signal: AbortSignal.timeout(2_000),
      })
      return response.ok
    },
    15_000,
  )
  await waitFor('the Next.js dev server', appIsUp, 120_000)
  return runtime
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
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  }
}

function median(values) {
  return percentile(values.filter((value) => value !== null), 0.5)
}

function formatMs(value) {
  if (value === null || value === undefined) return 'n/a'
  return value < 10 ? value.toFixed(2) : value.toFixed(1)
}

async function measure(runtime, mode) {
  const healthBeforeWarmup = await fetchJson(
    `${runtime.collectorUrl}/api/health`,
    runtime.token,
  )
  const verbose = healthBeforeWarmup.instrumentation?.nextOtelVerbose
  const expected = mode === 'verbose'
  if (!verbose || verbose.enabled !== expected) {
    throw new Error(
      `Expected NEXT_OTEL_VERBOSE enabled=${expected} for ${mode}, got ${JSON.stringify(verbose)}`,
    )
  }

  for (let index = 0; index < WARMUP; index += 1) {
    const response = await fetch(`${APP_URL}/api/projects`, {
      signal: AbortSignal.timeout(30_000),
    })
    await response.arrayBuffer()
    if (!response.ok) throw new Error(`Warm-up failed with ${response.status}`)
  }
  for (let index = 0; index < Math.ceil(WARMUP / 2); index += 1) {
    const response = await fetch(`${APP_URL}/`, {
      signal: AbortSignal.timeout(30_000),
    })
    await response.arrayBuffer()
    if (!response.ok) throw new Error(`Page warm-up failed with ${response.status}`)
  }
  await sleep(750)

  const before = await fetchJson(`${runtime.collectorUrl}/api/health`, runtime.token)
  const endpoints = {}
  for (const [endpoint, label] of ENDPOINTS) {
    const samples = []
    for (let index = 0; index < SAMPLES; index += 1) {
      const started = performance.now()
      const response = await fetch(`${APP_URL}${endpoint}`, {
        signal: AbortSignal.timeout(30_000),
      })
      await response.arrayBuffer()
      if (!response.ok) {
        throw new Error(`${endpoint} failed with HTTP ${response.status}`)
      }
      samples.push(performance.now() - started)
    }
    endpoints[label] = stats(samples)
  }
  await sleep(750)

  const after = await fetchJson(`${runtime.collectorUrl}/api/health`, runtime.token)
  const coverage = await fetchJson(`${runtime.collectorUrl}/api/coverage`, runtime.token)
  const verboseItem = coverage.items.find((item) => item.id === 'next.verbose-spans')
  const requests = after.counts.requests - before.counts.requests
  const spans = after.counts.spans - before.counts.spans

  return {
    mode,
    endpoints,
    requests,
    spans,
    spansPerRequest: requests > 0 ? spans / requests : null,
    verboseSpanTypes: verboseItem?.evidence.spanTypes ?? [],
  }
}

function runSummary(runs) {
  const summary = {}
  for (const mode of MODES) {
    const entries = runs[mode]
    summary[mode] = {
      runs: entries.length,
      endpoints: {},
    }
    for (const [, label] of ENDPOINTS) {
      summary[mode].endpoints[label] = {
        p50: median(entries.map((entry) => entry.endpoints[label].p50)),
        p95: median(entries.map((entry) => entry.endpoints[label].p95)),
        max: median(entries.map((entry) => entry.endpoints[label].max)),
      }
    }
    summary[mode].spansPerRequest = median(
      entries.map((entry) => entry.spansPerRequest),
    )
    summary[mode].verboseSpanTypes = [
      ...new Set(entries.flatMap((entry) => entry.verboseSpanTypes)),
    ].sort()
  }
  return summary
}

async function main() {
  if (!(await exists(CLI))) {
    throw new Error('Build the CLI first: pnpm build')
  }
  if (!(await exists(DASHBOARD_INDEX))) {
    throw new Error('Build the dashboard first: pnpm build')
  }

  const runs = { standard: [], verbose: [] }
  for (let pair = 0; pair < PAIRS; pair += 1) {
    const order = pair % 2 === 0 ? ['standard', 'verbose'] : ['verbose', 'standard']
    for (const mode of order) {
      console.log(
        `Run ${pair + 1}/${PAIRS}: ${mode === 'verbose' ? 'NEXT_OTEL_VERBOSE=1' : 'standard spans'}...`,
      )
      try {
        const runtime = await startApp(mode)
        runs[mode].push(await measure(runtime, mode))
      } finally {
        await stopApp()
      }
    }
  }

  const summary = runSummary(runs)
  console.log('')
  console.log('StackNext verbose-tracing overhead benchmark')
  console.log(
    `Node ${process.versions.node} · ${process.platform}/${process.arch} · ${new Date().toISOString()}`,
  )
  console.log(
    `Example app ${APP_URL} · ${SAMPLES} sequential requests per endpoint · ${PAIRS} paired runs`,
  )
  console.log('')
  console.log('Median of paired runs (ms)')
  console.log('  mode      endpoint          p50      p95      max')
  for (const mode of MODES) {
    for (const [, label] of ENDPOINTS) {
      const result = summary[mode].endpoints[label]
      console.log(
        `  ${mode.padEnd(9)} ${label.padEnd(16)} ${formatMs(result.p50).padStart(7)} ${formatMs(result.p95).padStart(8)} ${formatMs(result.max).padStart(8)}`,
      )
    }
  }
  console.log('')
  console.log('Observed telemetry per measured request')
  for (const mode of MODES) {
    console.log(
      `  ${mode.padEnd(9)} ${summary[mode].spansPerRequest === null ? 'n/a' : summary[mode].spansPerRequest.toFixed(2)} spans/request · ${summary[mode].verboseSpanTypes.length} verbose span type(s)`,
    )
  }
  console.log('')
  for (const mode of MODES) {
    const p50 = summary[mode].endpoints['route handler'].p50
    const p95 = summary[mode].endpoints['route handler'].p95
    console.log(
      `  ${mode}: route handler p50 ${formatMs(p50)} ms, p95 ${formatMs(p95)} ms`,
    )
  }
  const standardP50 = summary.standard.endpoints['route handler'].p50
  const verboseP50 = summary.verbose.endpoints['route handler'].p50
  if (standardP50 && verboseP50) {
    const delta = ((verboseP50 - standardP50) / standardP50) * 100
    console.log(
      `  paired p50 delta: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% (verbose vs standard)`,
    )
  }
  console.log('')
  console.log(
    'Note: dev-server cache/warm-up order and machine load affect this measurement; treat it as directional.',
  )
}

let stopping = false
async function shutdown(signal) {
  if (stopping) return
  stopping = true
  console.error(`\nReceived ${signal}; stopping the example app...`)
  try {
    await stopApp()
  } finally {
    process.exit(signal === 'SIGINT' ? 130 : 143)
  }
}

process.once('SIGINT', () => {
  void shutdown('SIGINT')
})
process.once('SIGTERM', () => {
  void shutdown('SIGTERM')
})

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  try {
    await stopApp()
  } finally {
    process.exitCode = 1
  }
})
