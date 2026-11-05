#!/usr/bin/env node
/**
 * Real end-to-end smoke test for the built StackNext CLI, collector, example
 * app, dashboard API and MCP server. Run `pnpm build` first.
 *
 * If the example app already has a live StackNext runtime, the script reuses it
 * and leaves it running. Otherwise it starts `stacknext dev` and stops it.
 */
import { spawn, spawnSync } from 'node:child_process'
import { access, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APP_DIR = path.join(ROOT, 'apps', 'example-next-app')
const CLI = path.join(ROOT, 'packages', 'cli', 'dist', 'bin.js')
const RUNTIME_FILE = path.join(APP_DIR, '.stacknext', 'run.json')
const DASHBOARD_INDEX = path.join(ROOT, 'packages', 'dashboard', 'dist', 'index.html')
const APP_URL = 'http://127.0.0.1:4402'

let passed = 0
let devLog = ''
let devProcess = null
let spawned = false

function ok(label) {
  passed += 1
  console.log(`  ok   ${label}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function exists(file) {
  try {
    await access(file)
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

function processAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function appendLog(chunk) {
  devLog = `${devLog}${chunk}`.slice(-20_000)
}

async function fetchJson(url, token, timeoutMs = 8_000) {
  const response = await fetch(url, {
    headers: {
      connection: 'close',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status}: ${text.slice(0, 400)}`)
  }
  return JSON.parse(text)
}

async function fetchApp(pathname) {
  const response = await fetch(`${APP_URL}${pathname}`, {
    signal: AbortSignal.timeout(30_000),
    redirect: 'manual',
  })
  await response.arrayBuffer()
  return response.status
}

async function waitFor(label, check, timeoutMs = 90_000, intervalMs = 400) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    if (devProcess && devProcess.exitCode !== null) {
      throw new Error(
        `stacknext dev exited with code ${devProcess.exitCode} while waiting for ${label}\n${devLog}`,
      )
    }
    try {
      const value = await check()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(
    `Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`,
  )
}

function runCli(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: APP_DIR,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `stacknext ${args.join(' ')} exited ${result.status}\n${result.stdout}\n${result.stderr}`,
    )
  }
  return result.stdout
}

function killDevProcess(signal) {
  if (!devProcess || devProcess.exitCode !== null) return
  if (process.platform !== 'win32' && devProcess.pid) {
    try {
      process.kill(-devProcess.pid, signal)
      return
    } catch {
      // Fall through to killing the direct child.
    }
  }
  try {
    devProcess.kill(signal)
  } catch {
    // Already gone.
  }
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return true
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit)
      resolve(false)
    }, timeoutMs)
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    child.once('exit', onExit)
  })
}

async function startDev() {
  const existing = await readRuntime()
  if (existing && processAlive(existing.pid)) {
    await fetchJson(`${existing.collectorUrl}/api/ping`, null)
    console.log(`Reusing running StackNext at ${existing.dashboardUrl}\n`)
    return existing
  }
  if (existing) await rm(RUNTIME_FILE, { force: true })

  console.log('Starting StackNext and the example app...')
  devProcess = spawn(process.execPath, [CLI, 'dev', '--quiet'], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  })
  spawned = true
  devProcess.stdout.on('data', (chunk) => appendLog(chunk.toString()))
  devProcess.stderr.on('data', (chunk) => appendLog(chunk.toString()))

  const runtime = await waitFor('the StackNext runtime file', async () => {
    const state = await readRuntime()
    return state && processAlive(state.pid) ? state : null
  })
  await fetchJson(`${runtime.collectorUrl}/api/ping`, null)
  await waitFor('the Next.js dev server', async () => {
    const status = await fetchApp('/')
    return status >= 200 && status < 500
  })
  return runtime
}

class McpSession {
  constructor(child) {
    this.child = child
    this.buffer = ''
    this.nextId = 1
    this.pending = new Map()
    this.stderr = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => this.onData(chunk))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-4_000)
    })
    child.once('exit', (code) => {
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer)
        reject(new Error(`MCP server exited with code ${code}\n${this.stderr}`))
      }
      this.pending.clear()
    })
  }

  onData(chunk) {
    this.buffer += chunk
    let newline = this.buffer.indexOf('\n')
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (line !== '') this.onMessage(line)
      newline = this.buffer.indexOf('\n')
    }
  }

  onMessage(line) {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    const entry = this.pending.get(message.id)
    if (!entry) return
    this.pending.delete(message.id)
    clearTimeout(entry.timer)
    if (message.error) {
      entry.reject(
        new Error(`MCP error ${message.error.code}: ${message.error.message}`),
      )
    } else {
      entry.resolve(message.result)
    }
  }

  send(message) {
    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  request(method, params) {
    const id = this.nextId
    this.nextId += 1
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP request ${method} timed out\n${this.stderr}`))
      }, 15_000)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.send({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  async close() {
    this.child.stdin.end()
    const exited = await waitForExit(this.child, 500)
    if (!exited) {
      this.child.kill('SIGTERM')
      if (!(await waitForExit(this.child, 2_000))) this.child.kill('SIGKILL')
    }
  }
}

async function runRegressionChecks(api, secrets) {
  const captureArgs = (name) => [
    'capture',
    '--name',
    name,
    '--quiet',
    '--json',
    '--',
    'pnpm',
    'exec',
    'playwright',
    'test',
    '--workers=1',
    '--repeat-each=3',
  ]

  const baselineCapture = JSON.parse(runCli(captureArgs('e2e regression baseline')))
  assert(baselineCapture.run, 'baseline capture returned no run')
  assert(
    baselineCapture.run.status === 'completed',
    `baseline capture status is ${baselineCapture.run.status}: ${baselineCapture.run.warnings.join('; ')}`,
  )
  assert(
    baselineCapture.run.stats.scenarios === 3,
    `baseline capture has ${baselineCapture.run.stats.scenarios} scenarios, expected 3`,
  )
  assert(
    baselineCapture.run.stats.verifiedSamples === 9,
    `baseline capture has ${baselineCapture.run.stats.verifiedSamples} verified samples, expected 9`,
  )
  assert(
    baselineCapture.run.command.exitCode === 0,
    'baseline capture did not preserve the Playwright exit code',
  )
  for (const scenario of baselineCapture.run.scenarios) {
    assert(
      scenario.identity.source === 'annotation',
      `scenario ${scenario.identity.title} did not use the explicit annotation identity`,
    )
    assert(
      scenario.samples.length === 3,
      `scenario ${scenario.identity.title} has ${scenario.samples.length} samples, expected 3`,
    )
    assert(
      scenario.samples.every(
        (sample) =>
          sample.correlation.status === 'verified' &&
          sample.correlation.traces.length > 0,
      ),
      `scenario ${scenario.identity.title} has an unverified sample`,
    )
  }
  ok(
    `baseline capture verified ${baselineCapture.run.stats.verifiedSamples} Playwright samples across ${baselineCapture.run.stats.scenarios} scenarios`,
  )

  const baselineSave = JSON.parse(
    runCli([
      'baseline',
      'save',
      baselineCapture.run.id,
      '--name',
      'e2e regression baseline',
      '--json',
    ]),
  )
  assert(baselineSave.baseline?.id?.startsWith('base-'), 'baseline save returned no id')
  assert(
    baselineSave.baseline.sourceRunId === baselineCapture.run.id,
    'baseline does not reference the capture run',
  )
  ok(`baseline ${baselineSave.baseline.id} saved from run ${baselineCapture.run.id}`)

  const candidateCapture = JSON.parse(runCli(captureArgs('e2e regression candidate')))
  assert(candidateCapture.run, 'candidate capture returned no run')
  assert(
    candidateCapture.run.status === 'completed',
    `candidate capture status is ${candidateCapture.run.status}: ${candidateCapture.run.warnings.join('; ')}`,
  )
  assert(
    candidateCapture.run.stats.verifiedSamples === 9,
    `candidate capture has ${candidateCapture.run.stats.verifiedSamples} verified samples, expected 9`,
  )
  assert(
    candidateCapture.run.id !== baselineCapture.run.id,
    'baseline and candidate capture reused the same run id',
  )
  ok(`candidate capture ${candidateCapture.run.id} verified 9 samples`)

  const compareResult = JSON.parse(
    runCli([
      'compare',
      baselineSave.baseline.id,
      candidateCapture.run.id,
      '--json',
      '--min-samples',
      '3',
      '--duration-regression-ms',
      '60000',
      '--duration-regression-pct',
      '10000',
      '--duration-improvement-ms',
      '60000',
      '--duration-improvement-pct',
      '10000',
      '--count-regression-min',
      '1000',
    ]),
  )
  const comparison = compareResult.comparison
  assert(comparison?.id?.startsWith('cmp-'), 'compare command returned no comparison id')
  assert(
    comparison.baselineId === baselineSave.baseline.id &&
      comparison.candidateId === candidateCapture.run.id,
    'comparison ids do not match the saved baseline and candidate',
  )
  assert(
    comparison.environment.compatible === true,
    `comparison environments differ: ${JSON.stringify(comparison.environment.differences)}`,
  )
  assert(
    comparison.summary.scenarios === 3,
    `comparison has ${comparison.summary.scenarios} scenarios, expected 3`,
  )
  assert(
    comparison.scenarios.every(
      (scenario) =>
        scenario.baseline.verifiedSamples === 3 &&
        scenario.candidate.verifiedSamples === 3,
    ),
    'comparison scenario sample counts are incomplete',
  )
  assert(
    comparison.status === 'unchanged',
    `comparison status is ${comparison.status}: ${JSON.stringify(
      comparison.scenarios.map((scenario) => ({
        title: scenario.title,
        status: scenario.status,
        reasons: scenario.reasons,
      })),
    )}`,
  )
  assert(
    comparison.limitations.some((limitation) => limitation.includes('significance')),
    'comparison is missing the no-significance limitation',
  )
  assert(
    comparison.options.ignoreEnvironment === false,
    'comparison unexpectedly ignored the environment',
  )
  ok(`comparison ${comparison.id} is unchanged with compatible environments`)

  const runsPage = await api('/api/test-runs?limit=200')
  assert(
    runsPage.items.some((run) => run.id === baselineCapture.run.id) &&
      runsPage.items.some((run) => run.id === candidateCapture.run.id),
    'collector run list is missing a capture run',
  )
  const canonicalRun = await api(`/api/test-runs/${candidateCapture.run.id}`)
  assert(
    canonicalRun.scenarios?.length === 3,
    'collector test-run detail is missing scenarios',
  )
  const baselinesPage = await api('/api/baselines?limit=200')
  assert(
    baselinesPage.items.some((baseline) => baseline.id === baselineSave.baseline.id),
    'collector baseline list is missing the saved baseline',
  )
  const canonicalBaseline = await api(`/api/baselines/${baselineSave.baseline.id}`)
  assert(
    canonicalBaseline.sourceRunId === baselineCapture.run.id,
    'collector baseline detail has the wrong source run',
  )
  const comparisonsPage = await api('/api/comparisons?limit=200')
  assert(
    comparisonsPage.items.some((entry) => entry.id === comparison.id),
    'collector comparison list is missing the saved comparison',
  )
  const canonicalComparison = await api(`/api/comparisons/${comparison.id}`)
  assert(
    canonicalComparison.status === comparison.status &&
      canonicalComparison.summary.scenarios === 3,
    'collector comparison detail disagrees with the CLI result',
  )
  ok('collector read APIs return the persisted run, baseline and comparison')

  const cliRuns = JSON.parse(runCli(['runs', 'list', '--json', '--limit', '200']))
  assert(
    cliRuns.items.some((run) => run.id === candidateCapture.run.id),
    'CLI runs list is missing the candidate run',
  )
  const cliRun = JSON.parse(runCli(['runs', 'show', candidateCapture.run.id, '--json']))
  assert(cliRun.id === candidateCapture.run.id, 'CLI runs show returned the wrong run')
  const cliBaselines = JSON.parse(
    runCli(['baseline', 'list', '--json', '--limit', '200']),
  )
  assert(
    cliBaselines.items.some((baseline) => baseline.id === baselineSave.baseline.id),
    'CLI baseline list is missing the saved baseline',
  )
  const cliBaseline = JSON.parse(
    runCli(['baseline', 'show', baselineSave.baseline.id, '--json']),
  )
  assert(
    cliBaseline.id === baselineSave.baseline.id,
    'CLI baseline show returned the wrong baseline',
  )
  ok('CLI runs and baseline commands agree with the persisted records')

  const serialized = JSON.stringify({
    baselineCapture,
    baselineSave,
    candidateCapture,
    comparison,
    runsPage,
    canonicalRun,
    baselinesPage,
    canonicalBaseline,
    comparisonsPage,
    canonicalComparison,
  })
  for (const secret of secrets) {
    assert(
      !serialized.includes(secret),
      `secret ${secret} leaked into regression records`,
    )
  }
  ok('regression records contain no captured secrets')

  return {
    baselineRunId: baselineCapture.run.id,
    candidateRunId: candidateCapture.run.id,
    baselineId: baselineSave.baseline.id,
    comparisonId: comparison.id,
  }
}

async function runSnapshotChecks(api, secrets) {
  const saved = JSON.parse(
    runCli(['snapshot', 'save', '--label', 'e2e snapshot', '--json']),
  )
  assert(saved.id?.startsWith('snap-'), 'snapshot save returned no id')
  assert(saved.source === 'manual', `snapshot source is ${saved.source}`)
  assert(saved.label === 'e2e snapshot', 'snapshot label was not preserved')
  assert(saved.stats.spans > 0, 'snapshot contains no spans')
  ok(`manual snapshot ${saved.id} saved with ${saved.stats.spans} spans`)

  const list = await api('/api/snapshots?limit=200')
  assert(
    list.items.some((snapshot) => snapshot.id === saved.id),
    'collector snapshot list is missing the saved snapshot',
  )
  const detail = await api(`/api/snapshots/${saved.id}`)
  assert(detail.snapshot.id === saved.id, 'snapshot detail returned the wrong id')
  assert(detail.config.collector.retentionMs > 0, 'snapshot has no captured config')
  assert(detail.limitations.length > 0, 'snapshot has no limitations')
  assert(detail.traces.length > 0, 'snapshot has no traces')
  assert(detail.errors.length > 0, 'snapshot has no errors')
  assert(detail.databaseQueries.length > 0, 'snapshot has no database queries')
  assert(!('diagnostics' in detail), 'snapshot detail contains live diagnostics')
  const traceId = detail.traces[0].traceId
  const errorId = detail.errors[0].id

  const traces = await api(`/api/snapshots/${saved.id}/traces?limit=200`)
  assert(
    traces.items.some((trace) => trace.traceId === traceId),
    'snapshot trace list is missing the detail trace',
  )
  const trace = await api(`/api/snapshots/${saved.id}/traces/${traceId}`)
  assert(trace.traceId === traceId, 'snapshot trace detail returned the wrong trace')
  assert(trace.spans.length > 0, 'snapshot trace detail has no spans')
  assert(!('diagnostics' in trace), 'snapshot trace detail contains live diagnostics')
  const errors = await api(`/api/snapshots/${saved.id}/errors?limit=200`)
  assert(
    errors.items.some((error) => error.id === errorId),
    'snapshot error list is missing the detail error',
  )
  const error = await api(`/api/snapshots/${saved.id}/errors/${errorId}`)
  assert(error.error.id === errorId, 'snapshot error detail returned the wrong error')
  const database = await api(`/api/snapshots/${saved.id}/database?limit=200`)
  assert(database.items.length > 0, 'snapshot database list is empty')
  ok(
    `snapshot scoped reads return trace ${traceId.slice(0, 8)}…, error ${errorId} and ${database.items.length} queries`,
  )

  const exported = await api(`/api/snapshots/${saved.id}/export`)
  assert(exported.format === 'stacknext-export', 'snapshot export format mismatch')
  assert(exported.exportedAt === saved.createdAt, 'snapshot export time mismatch')
  assert(!('diagnostics' in exported), 'snapshot export contains live diagnostics')

  const cliList = JSON.parse(runCli(['snapshot', 'list', '--json', '--limit', '200']))
  assert(
    cliList.items.some((snapshot) => snapshot.id === saved.id),
    'CLI snapshot list is missing the saved snapshot',
  )
  const cliShow = JSON.parse(runCli(['snapshot', 'show', saved.id, '--json']))
  assert(cliShow.id === saved.id, 'CLI snapshot show returned the wrong snapshot')
  const cliExport = JSON.parse(runCli(['snapshot', 'export', saved.id, '--stdout']))
  assert(cliExport.format === 'stacknext-export', 'CLI snapshot export format mismatch')
  ok('CLI snapshot save, list, show and export agree with the collector')

  for (const secret of secrets) {
    assert(
      !JSON.stringify(detail).includes(secret),
      `secret ${secret} leaked into snapshot detail`,
    )
    assert(
      !JSON.stringify(trace).includes(secret),
      `secret ${secret} leaked into snapshot trace`,
    )
    assert(
      !JSON.stringify(exported).includes(secret),
      `secret ${secret} leaked into snapshot export`,
    )
    assert(
      !JSON.stringify(cliShow).includes(secret),
      `secret ${secret} leaked into CLI snapshot show`,
    )
    assert(
      !JSON.stringify(cliExport).includes(secret),
      `secret ${secret} leaked into CLI snapshot export`,
    )
  }
  ok('snapshot records contain no captured secrets')

  return { snapshotId: saved.id, traceId, errorId }
}

async function runMcpChecks(runtime, errorId, diagnosticId, regression, snapshot) {
  const child = spawn(
    process.execPath,
    [CLI, 'mcp', '--collector', runtime.collectorUrl, '--token', runtime.token],
    {
      cwd: APP_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    },
  )
  const session = new McpSession(child)
  try {
    const initialize = await session.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'stacknext-e2e', version: '0.6.1' },
    })
    assert(initialize.serverInfo?.name === 'stacknext', 'MCP server name mismatch')
    assert(
      initialize.serverInfo?.version === '0.6.1',
      `MCP server version mismatch: ${initialize.serverInfo?.version}`,
    )
    assert(
      initialize.instructions?.includes('get_project_summary'),
      'MCP server instructions are missing',
    )
    assert(
      initialize.instructions?.includes('coverage'),
      'MCP server instructions do not mention coverage',
    )
    assert(
      initialize.instructions?.includes('stacknext_list_test_runs'),
      'MCP server instructions do not mention regression runs',
    )
    assert(
      initialize.instructions?.includes('stacknext_list_snapshots'),
      'MCP server instructions do not mention snapshots',
    )
    session.send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    ok('MCP initialize with instructions')

    const tools = await session.request('tools/list', {})
    const names = new Set(tools.tools.map((tool) => tool.name))
    for (const name of [
      'get_project_summary',
      'list_requests',
      'get_request',
      'list_traces',
      'get_trace',
      'list_errors',
      'get_error',
      'list_database_queries',
      'find_slow_requests',
      'stacknext_list_diagnostics',
      'stacknext_get_diagnostic',
      'stacknext_list_test_runs',
      'stacknext_get_test_run',
      'stacknext_list_baselines',
      'stacknext_get_baseline',
      'stacknext_list_comparisons',
      'stacknext_get_comparison',
      'stacknext_list_snapshots',
      'stacknext_get_snapshot',
      'stacknext_get_snapshot_trace',
    ]) {
      assert(names.has(name), `MCP tool ${name} is missing`)
    }
    assert(tools.tools.length === 20, `MCP exposes ${tools.tools.length} tools, expected 20`)
    const notReadOnly = tools.tools.find(
      (tool) => tool.annotations?.readOnlyHint !== true,
    )
    assert(!notReadOnly, `MCP tool ${notReadOnly?.name} is not marked read-only`)
    const withoutSchema = tools.tools.find((tool) => !tool.outputSchema)
    assert(!withoutSchema, `MCP tool ${withoutSchema?.name} has no output schema`)
    ok('MCP exposes 20 read-only tools with output schemas')

    const prompts = await session.request('prompts/list', {})
    const promptNames = new Set(prompts.prompts.map((prompt) => prompt.name))
    for (const name of [
      'diagnose-error',
      'investigate-slow-request',
      'inspect-database-activity',
      'investigate-trace',
      'diagnose-runtime-issue',
    ]) {
      assert(promptNames.has(name), `MCP prompt ${name} is missing`)
    }
    const prompt = await session.request('prompts/get', {
      name: 'diagnose-error',
      arguments: errorId ? { errorId } : {},
    })
    assert(
      prompt.messages?.[0]?.content?.text?.includes('get_error'),
      'MCP diagnose-error prompt is not actionable',
    )
    ok('MCP exposes 5 guided prompts')

    const summary = await session.request('tools/call', {
      name: 'get_project_summary',
      arguments: {},
    })
    const summaryPayload = JSON.parse(summary.content[0].text)
    assert(summaryPayload.summary?.totalRequests > 0, 'MCP summary has no requests')
    assert(summary.structuredContent?.meta?.tool === 'get_project_summary', 'MCP summary structured content is missing')
    assert(
      summary.structuredContent.meta.connection.instrumentation === 'connected',
      'MCP summary does not report a connected instrumentation',
    )
    assert(
      summaryPayload.coverage?.items?.some(
        (item) => item.id === 'custom.spans' && item.status === 'observed',
      ),
      'MCP summary coverage does not show observed custom spans',
    )
    assert(
      summary.structuredContent.meta.coverage?.requestsInSample > 0,
      'MCP summary meta is missing coverage counts',
    )
    ok('MCP get_project_summary with structured coverage metadata')

    const slow = await session.request('tools/call', {
      name: 'find_slow_requests',
      arguments: { minDurationMs: 250, limit: 5 },
    })
    const slowPayload = JSON.parse(slow.content[0].text)
    assert(slowPayload.items.length > 0, 'MCP found no slow requests')
    assert(
      slowPayload.items.every((request) => request.durationMs >= 250),
      'MCP slow-request filter returned a fast request',
    )
    assert(
      slow.structuredContent?.meta?.result?.found >= slow.structuredContent?.meta?.result?.returned,
      'MCP slow-request pagination metadata is inconsistent',
    )
    ok('MCP find_slow_requests with pagination metadata')

    const diagnosticList = await session.request('tools/call', {
      name: 'stacknext_list_diagnostics',
      arguments: { limit: 100 },
    })
    const diagnosticPayload = JSON.parse(diagnosticList.content[0].text)
    assert(
      diagnosticPayload.items?.some((finding) => finding.id === diagnosticId),
      'MCP diagnostics list is missing the expected finding',
    )
    assert(
      diagnosticList.structuredContent?.meta?.tool === 'stacknext_list_diagnostics',
      'MCP diagnostics metadata is missing',
    )
    assert(
      diagnosticList.structuredContent.meta.notes?.some((note) =>
        note.includes('not confirmed root causes'),
      ),
      'MCP diagnostics output is missing the root-cause caveat',
    )
    const diagnostic = await session.request('tools/call', {
      name: 'stacknext_get_diagnostic',
      arguments: { diagnosticId },
    })
    const diagnosticDetail = JSON.parse(diagnostic.content[0].text)
    assert(
      diagnosticDetail.finding?.id === diagnosticId,
      'MCP diagnostic detail returned the wrong finding',
    )
    const relatedTraceId = diagnosticDetail.finding?.traceIds?.[0]
    assert(relatedTraceId, 'MCP diagnostic finding has no related trace')
    assert(
      diagnosticDetail.trace?.traceId === relatedTraceId,
      'MCP diagnostic detail is missing the related trace',
    )
    assert(
      diagnosticDetail.meta?.identifiers?.diagnosticId === diagnosticId,
      'MCP diagnostic metadata is missing identifiers',
    )
    const traceWithDiagnostics = await session.request('tools/call', {
      name: 'get_trace',
      arguments: { traceId: relatedTraceId },
    })
    assert(
      traceWithDiagnostics.structuredContent?.diagnostics?.some(
        (reference) => reference.id === diagnosticId,
      ),
      'MCP get_trace is missing additive diagnostic references',
    )
    assert(
      traceWithDiagnostics.structuredContent.meta.notes?.some((note) =>
        note.includes('diagnostic finding'),
      ),
      'MCP get_trace is missing its diagnostic note',
    )
    ok('MCP diagnostics, detail and get_trace references agree')

    const runList = await session.request('tools/call', {
      name: 'stacknext_list_test_runs',
      arguments: { limit: 200 },
    })
    const runListPayload = runList.structuredContent
    assert(
      runListPayload?.items?.some((run) => run.id === regression.candidateRunId) &&
        runListPayload.items.some((run) => run.id === regression.baselineRunId),
      'MCP test-run list is missing a capture run',
    )
    assert(
      runListPayload.meta?.tool === 'stacknext_list_test_runs',
      'MCP test-run list metadata is missing',
    )
    const runDetail = await session.request('tools/call', {
      name: 'stacknext_get_test_run',
      arguments: { runId: regression.candidateRunId },
    })
    assert(
      runDetail.structuredContent?.scenarios?.length === 3,
      'MCP test-run detail is missing scenarios',
    )
    assert(
      runDetail.structuredContent.meta?.identifiers?.runId ===
        regression.candidateRunId,
      'MCP test-run detail metadata is missing its identifier',
    )
    const baselineList = await session.request('tools/call', {
      name: 'stacknext_list_baselines',
      arguments: { limit: 200 },
    })
    assert(
      baselineList.structuredContent?.items?.some(
        (baseline) => baseline.id === regression.baselineId,
      ),
      'MCP baseline list is missing the saved baseline',
    )
    const baselineDetail = await session.request('tools/call', {
      name: 'stacknext_get_baseline',
      arguments: { baselineId: regression.baselineId },
    })
    assert(
      baselineDetail.structuredContent?.sourceRunId === regression.baselineRunId &&
        baselineDetail.structuredContent.scenarios?.length === 3,
      'MCP baseline detail disagrees with the saved baseline',
    )
    const comparisonList = await session.request('tools/call', {
      name: 'stacknext_list_comparisons',
      arguments: { limit: 200 },
    })
    assert(
      comparisonList.structuredContent?.items?.some(
        (entry) => entry.id === regression.comparisonId,
      ),
      'MCP comparison list is missing the saved comparison',
    )
    const comparisonDetail = await session.request('tools/call', {
      name: 'stacknext_get_comparison',
      arguments: { comparisonId: regression.comparisonId },
    })
    assert(
      comparisonDetail.structuredContent?.candidateId ===
        regression.candidateRunId &&
        comparisonDetail.structuredContent.summary?.scenarios === 3,
      'MCP comparison detail disagrees with the saved comparison',
    )
    assert(
      comparisonDetail.structuredContent.meta?.notes?.some((note) =>
        note.includes('significance'),
      ),
      'MCP comparison detail is missing the no-significance note',
    )
    ok('MCP regression runs, baselines and comparisons agree')

    const snapshotList = await session.request('tools/call', {
      name: 'stacknext_list_snapshots',
      arguments: { limit: 200 },
    })
    assert(
      snapshotList.structuredContent?.items?.some(
        (entry) => entry.id === snapshot.snapshotId,
      ),
      'MCP snapshot list is missing the saved snapshot',
    )
    assert(
      snapshotList.structuredContent.meta?.notes?.some((note) =>
        note.includes('frozen copies'),
      ),
      'MCP snapshot list is missing the frozen-evidence note',
    )
    const snapshotDetail = await session.request('tools/call', {
      name: 'stacknext_get_snapshot',
      arguments: { snapshotId: snapshot.snapshotId },
    })
    assert(
      snapshotDetail.structuredContent?.snapshot?.id === snapshot.snapshotId,
      'MCP snapshot detail returned the wrong snapshot',
    )
    assert(
      snapshotDetail.structuredContent.traces?.some(
        (trace) => trace.traceId === snapshot.traceId,
      ),
      'MCP snapshot detail is missing the scoped trace',
    )
    assert(
      snapshotDetail.structuredContent.meta?.identifiers?.snapshotId ===
        snapshot.snapshotId,
      'MCP snapshot detail metadata is missing its identifier',
    )
    const snapshotTrace = await session.request('tools/call', {
      name: 'stacknext_get_snapshot_trace',
      arguments: {
        snapshotId: snapshot.snapshotId,
        traceId: snapshot.traceId,
      },
    })
    assert(
      snapshotTrace.structuredContent?.traceId === snapshot.traceId,
      'MCP snapshot trace returned the wrong trace',
    )
    assert(
      !snapshotTrace.structuredContent.diagnostics,
      'MCP snapshot trace contains live diagnostics',
    )
    ok('MCP snapshots, detail and scoped trace agree')

    if (errorId) {
      const listed = await session.request('tools/call', {
        name: 'list_errors',
        arguments: { limit: 10 },
      })
      const listedItems = listed.structuredContent?.items ?? []
      assert(listedItems.length > 0, 'MCP list_errors returned no errors')
      assert(
        listedItems.every((entry) => entry.stack === undefined),
        'MCP list_errors leaked stacks by default',
      )
      const detail = await session.request('tools/call', {
        name: 'get_error',
        arguments: { errorId },
      })
      assert(
        typeof detail.structuredContent?.error?.stack === 'string',
        'MCP get_error did not return the error stack',
      )
      ok('MCP list_errors omits stacks and get_error returns one')
    }
  } finally {
    await session.close()
  }
}

async function main() {
  for (const [file, hint] of [
    [CLI, 'pnpm build'],
    [DASHBOARD_INDEX, 'pnpm build'],
    [path.join(APP_DIR, 'node_modules', 'next', 'package.json'), 'pnpm install'],
  ]) {
    if (!(await exists(file))) {
      throw new Error(`${file} is missing. Run "${hint}" first.`)
    }
  }

  let completed = false
  try {
    const runtime = await startDev()

    const api = async (pathname) => {
      try {
        return await fetchJson(`${runtime.collectorUrl}${pathname}`, runtime.token)
      } catch (error) {
        console.error(
          `API request failed: ${pathname}: ${
            error?.cause?.message ?? (error instanceof Error ? error.message : String(error))
          }`,
        )
        throw error
      }
    }
    const secrets = [
      'demo-url-secret',
      'super-secret-demo-token',
      'hunter2',
      'e2e-url-secret',
      'action-attribute-secret',
      'custom-attribute-secret',
      'custom-url-secret',
    ]

    const initial = await api('/api/health')
    assert(initial.status === 'ok', 'collector health is not ok')
    assert(
      typeof initial.instrumentation?.nextOtelVerbose?.enabled === 'boolean',
      'collector health does not report NEXT_OTEL_VERBOSE status',
    )
    if (process.env.NEXT_OTEL_VERBOSE === undefined) {
      assert(
        initial.instrumentation.nextOtelVerbose.source === 'disabled',
        `unexpected verbose source: ${initial.instrumentation.nextOtelVerbose.source}`,
      )
    }
    ok(`collector healthy on ${runtime.collectorUrl}`)

    await fetchApp('/')
    await fetchApp('/projects/1')
    await fetchApp('/api/projects')
    await fetchApp('/api/projects/1/tasks')
    await fetchApp('/api/slow?delay=350')
    await fetchApp('/api/n-plus-one')
    await fetchApp('/api/n-plus-one-fixed')
    const slowDbStatus = await fetchApp('/api/slow-db')
    assert(slowDbStatus === 200, `slow DB route returned ${slowDbStatus}`)
    const repeatedFetchStatus = await fetchApp('/api/repeated-fetch')
    assert(repeatedFetchStatus === 200, `repeated fetch route returned ${repeatedFetchStatus}`)
    await fetchApp('/actions-demo')
    const customStatus = await fetchApp('/api/custom-work')
    assert(customStatus === 200, `custom span route returned ${customStatus}`)
    const actionStatuses = {
      success: await fetchApp('/api/actions-demo?case=success'),
      failure: await fetchApp('/api/actions-demo?case=failure'),
      redirect: await fetchApp('/api/actions-demo?case=redirect'),
      'not-found': await fetchApp('/api/actions-demo?case=not-found'),
      revalidate: await fetchApp('/api/actions-demo?case=revalidate'),
      concurrent: await fetchApp('/api/actions-demo?case=concurrent'),
    }
    assert(actionStatuses.success === 200, `success action returned ${actionStatuses.success}`)
    assert(actionStatuses.failure === 500, `failure action returned ${actionStatuses.failure}`)
    assert(
      [303, 307, 308].includes(actionStatuses.redirect),
      `redirect action returned ${actionStatuses.redirect}`,
    )
    assert(
      actionStatuses['not-found'] === 404,
      `not-found action returned ${actionStatuses['not-found']}`,
    )
    assert(
      actionStatuses.revalidate === 200,
      `revalidate action returned ${actionStatuses.revalidate}`,
    )
    assert(
      actionStatuses.concurrent === 200,
      `concurrent action returned ${actionStatuses.concurrent}`,
    )
    for (let index = 0; index < 3; index += 1) {
      const errorStatus = await fetchApp('/api/error?token=e2e-url-secret&password=hunter2')
      assert(errorStatus === 500, `error route returned ${errorStatus}, expected 500`)
    }
    ok('example app routes and Server Action scenarios exercised')

    const health = await waitFor('captured request telemetry', async () => {
      const value = await api('/api/health')
      if (
        value.counts.requests < 18 ||
        value.counts.errors < 3 ||
        value.counts.databaseQueries < 5
      ) {
        return null
      }
      // A reused runtime may already satisfy the counters, so also wait for the
      // routes exercised above to be ingested before reading the request list.
      const recent = await api('/api/requests?limit=100&sort=recent')
      return recent.items.some((request) => request.route === '/api/slow') &&
        recent.items.some((request) => request.route === '/api/error') &&
        recent.items.some((request) => request.route === '/api/custom-work') &&
        recent.items.some((request) => request.route === '/api/n-plus-one') &&
        recent.items.some((request) => request.route === '/api/n-plus-one-fixed') &&
        recent.items.some((request) => request.route === '/api/slow-db') &&
        recent.items.some((request) => request.route === '/api/repeated-fetch') &&
        recent.items.filter((request) => request.route === '/api/error').length >= 3 &&
        recent.items.filter((request) => request.route === '/api/actions-demo').length >= 6
        ? value
        : null
    }, 60_000)
    assert(health.connected, 'instrumentation is not connected')
    assert(health.counts.spans > 0, 'no spans were captured')
    ok(
      `${health.counts.requests} requests · ${health.counts.spans} spans · ${health.counts.databaseQueries} queries · ${health.counts.errors} errors`,
    )

    const requests = await api('/api/requests?limit=100&sort=recent')
    const slow = requests.items.find((request) => request.route === '/api/slow')
    assert(slow, 'slow request was not captured')
    assert(slow.slow === true, 'slow request was not marked slow')
    const failed = requests.items.find((request) => request.route === '/api/error')
    assert(failed, 'failing request was not captured')
    assert(failed.failed === true && failed.statusClass === '5xx', 'failing request status is wrong')
    ok('request list marks slow and failed requests')

    const slowDetail = await api(`/api/traces/${slow.traceId}`)
    assert(slowDetail.spans.length >= 3, 'slow request trace has too few spans')
    assert(slowDetail.databaseQueries.length >= 1, 'slow request has no database query')
    assert(slowDetail.durationMs >= 250, 'slow request trace duration is too low')
    ok(`slow trace ${slow.traceId.slice(0, 8)}… has ${slowDetail.spans.length} spans`)

    const custom = requests.items.find((request) => request.route === '/api/custom-work')
    assert(custom, 'custom span request was not captured')
    const customDetail = await api(`/api/traces/${custom.traceId}`)
    const customSpans = customDetail.spans.filter((span) =>
      span.name.startsWith('demo.custom.'),
    )
    assert(customSpans.length >= 2, 'manual custom spans were not captured')
    const asyncSpan = customSpans.find((span) => span.name === 'demo.custom.async')
    const syncSpan = customSpans.find((span) => span.name === 'demo.custom.sync')
    assert(asyncSpan, 'async custom span is missing')
    assert(syncSpan, 'sync custom span is missing')
    assert(
      asyncSpan.attributes['stacknext.span.kind'] === 'custom',
      'custom span marker is missing',
    )
    assert(
      asyncSpan.attributes.authorization === '[redacted]',
      'sensitive custom span attribute was not redacted',
    )
    assert(
      syncSpan.parentSpanId === asyncSpan.spanId,
      'sync custom span is not linked to its async parent',
    )
    assert(
      !JSON.stringify(customDetail).includes('custom-attribute-secret'),
      'custom attribute secret leaked into trace detail',
    )
    assert(
      !JSON.stringify(customDetail).includes('custom-url-secret'),
      'custom URL query leaked into trace detail',
    )
    ok(`custom spans are linked and redacted in trace ${custom.traceId.slice(0, 8)}…`)

    const actionRequests = requests.items.filter(
      (request) => request.route === '/api/actions-demo',
    )
    assert(actionRequests.length >= 6, 'Server Action scenarios were not all captured')
    const actionDetails = await Promise.all(
      actionRequests.map((request) => api(`/api/traces/${request.traceId}`)),
    )
    const actionSpans = actionDetails
      .flatMap((detail) => detail.spans)
      .filter((span) => span.attributes['stacknext.span.kind'] === 'action')
    const actionByName = new Map(actionSpans.map((span) => [span.name, span]))
    for (const name of [
      'action/create-task',
      'action/failing',
      'action/redirect',
      'action/not-found',
      'action/revalidate',
      'action/concurrent-0',
      'action/concurrent-1',
      'action/concurrent-2',
    ]) {
      assert(actionByName.has(name), `Server Action span ${name} is missing`)
    }
    const successSpan = actionByName.get('action/create-task')
    assert(
      successSpan?.attributes.authorization === '[redacted]',
      'sensitive action attribute was not redacted',
    )
    assert(
      successSpan?.attributes['app.form.fields'] === 1,
      'FormData metadata was not recorded on the action span',
    )
    const failedSpan = actionByName.get('action/failing')
    assert(failedSpan?.status === 'error', 'failing action span was not marked as an error')
    assert(
      failedSpan?.statusMessage?.includes('[redacted]'),
      'failing action status message was not redacted',
    )
    for (const name of ['action/redirect', 'action/not-found']) {
      const span = actionByName.get(name)
      assert(span?.status !== 'error', `${name} control flow was marked as an error`)
    }
    assert(
      !JSON.stringify(actionDetails).includes('action-attribute-secret'),
      'action attribute secret leaked into trace detail',
    )
    ok(`Server Action success, failure, FormData and control flow spans captured`)

    const coverage = await api('/api/coverage')
    const coverageById = new Map(coverage.items.map((item) => [item.id, item]))
    assert(coverageById.get('custom.spans')?.status === 'observed', 'custom spans are not covered')
    assert(
      coverageById.get('custom.server-actions')?.status === 'observed',
      'Server Actions are not covered',
    )
    assert(coverage.sample.requests > 0, 'coverage sample has no requests')
    assert(
      coverage.statusCounts &&
        Object.values(coverage.statusCounts).reduce((sum, value) => sum + value, 0) ===
          coverage.items.length,
      'coverage status counts are inconsistent',
    )
    const scoreKey = /(percent|score)/i
    assert(
      !Object.keys(coverage).some((key) => scoreKey.test(key)),
      'coverage report has a top-level percentage or score field',
    )
    assert(
      coverage.items.every(
        (item) => !Object.keys(item).some((key) => scoreKey.test(key)),
      ),
      'coverage item has a percentage or score field',
    )
    ok('coverage API reports observed custom instrumentation without a score')

    const summaryWithCoverage = await api('/api/summary')
    assert(
      summaryWithCoverage.coverage?.items?.some(
        (item) => item.id === 'custom.spans' && item.status === 'observed',
      ),
      'summary response does not include coverage',
    )
    ok('summary includes additive coverage metadata')

    const nPlusOneRequest = requests.items.find(
      (request) => request.route === '/api/n-plus-one',
    )
    const nPlusOneFixedRequest = requests.items.find(
      (request) => request.route === '/api/n-plus-one-fixed',
    )
    const slowDbRequest = requests.items.find(
      (request) => request.route === '/api/slow-db',
    )
    const repeatedFetchRequest = requests.items.find(
      (request) => request.route === '/api/repeated-fetch',
    )
    assert(nPlusOneRequest, 'N+1 request was not captured')
    assert(nPlusOneFixedRequest, 'fixed N+1 request was not captured')
    assert(slowDbRequest, 'slow DB request was not captured')
    assert(repeatedFetchRequest, 'repeated fetch request was not captured')

    const diagnostics = await api('/api/diagnostics?limit=100')
    assert(diagnostics.format === undefined || diagnostics.engineVersion, 'diagnostics response is malformed')
    assert(diagnostics.engineVersion === '0.6.1', 'diagnostics engine version mismatch')
    assert(diagnostics.ruleSetVersion === 2, 'diagnostics rule set version mismatch')
    assert(diagnostics.sample.requests > 0, 'diagnostics sample has no requests')
    assert(diagnostics.counts.total === diagnostics.items.length, 'diagnostics counts are inconsistent')
    assert(
      !Object.keys(diagnostics).some((key) => /(percent|score)/i.test(key)),
      'diagnostics response has a percentage or score field',
    )
    const nPlusOneFinding = diagnostics.items.find(
      (finding) =>
        finding.ruleId === 'n-plus-one-queries' &&
        finding.traceIds.includes(nPlusOneRequest.traceId),
    )
    assert(nPlusOneFinding, 'N+1 diagnostic finding is missing')
    assert(nPlusOneFinding.status === 'possible', 'N+1 finding status is not possible')
    assert(
      nPlusOneFinding.affectedTraceCount >= 1,
      'N+1 finding has no affected trace count',
    )
    assert(
      nPlusOneFinding.evidence.traces.length >= 1,
      'N+1 finding has no trace occurrences',
    )
    assert(nPlusOneFinding.evidence.queries.length >= 5, 'N+1 finding has too little query evidence')
    assert(
      nPlusOneFinding.evidence.queries.every((query) => query.sqlPreview.includes('?')),
      'N+1 SQL previews are not normalized',
    )
    const repeatedHttpFinding = diagnostics.items.find(
      (finding) =>
        finding.ruleId === 'repeated-external-http' &&
        finding.traceIds.includes(repeatedFetchRequest.traceId),
    )
    assert(repeatedHttpFinding, 'repeated HTTP diagnostic finding is missing')
    assert(
      repeatedHttpFinding.affectedTraceCount >= 1,
      'repeated HTTP finding has no affected trace count',
    )
    assert(
      repeatedHttpFinding.evidence.spans.length >= 3,
      'repeated HTTP finding has too little span evidence',
    )
    assert(
      repeatedHttpFinding.evidence.measurements.some(
        (measurement) => measurement.label === 'endpoint',
      ),
      'repeated HTTP finding has no normalized endpoint',
    )
    const slowRequestFinding = diagnostics.items.find(
      (finding) =>
        finding.ruleId === 'slow-request' &&
        finding.traceIds.includes(slowDbRequest.traceId),
    )
    const slowDbFinding = diagnostics.items.find(
      (finding) =>
        finding.ruleId === 'slow-span' &&
        finding.traceIds.includes(slowDbRequest.traceId) &&
        finding.title.includes('database'),
    )
    assert(
      slowRequestFinding || slowDbFinding,
      'slow request or slow database span finding is missing',
    )
    const slowFinding = slowRequestFinding ?? slowDbFinding
    assert(slowFinding.status === 'observed', 'slow finding status is not observed')
    assert(
      slowFinding.evidence.contributors.length > 0,
      'slow finding has no self-time contributors',
    )
    assert(
      slowFinding.evidence.traces.length > 0,
      'slow finding has no trace occurrences',
    )
    const errorFinding = diagnostics.items.find(
      (finding) => finding.ruleId === 'error-fingerprint',
    )
    assert(errorFinding, 'repeated error finding is missing')
    assert(errorFinding.severity === 'error', 'repeated error severity is not error')
    assert(
      errorFinding.evidence.errors.length >= 2,
      'repeated error finding has too little evidence',
    )
    assert(
      errorFinding.affectedTraceCount >= 2,
      'repeated error finding has too few affected traces',
    )
    assert(
      errorFinding.evidence.traces.length >= 2,
      'repeated error finding has too few trace occurrences',
    )
    assert(
      errorFinding.evidence.errors.some(
        (entry) => entry.route === '/api/error' && entry.statusCode === 500,
      ),
      'repeated error evidence is missing route or status context',
    )
    const serializedDiagnostics = JSON.stringify(diagnostics)
    for (const secret of secrets) {
      assert(
        !serializedDiagnostics.includes(secret),
        `secret ${secret} leaked into diagnostics`,
      )
    }
    assert(
      !serializedDiagnostics.includes('e2e-url-secret'),
      'URL query secret leaked into diagnostics',
    )
    ok('diagnostics API reports deterministic grouped N+1, HTTP, slow-request and error findings')

    const traceDiagnostics = await api(
      `/api/diagnostics?traceId=${nPlusOneRequest.traceId}`,
    )
    assert(
      traceDiagnostics.items.every((finding) =>
        finding.traceIds.includes(nPlusOneRequest.traceId),
      ),
      'trace diagnostic filter returned an unrelated finding',
    )
    assert(
      traceDiagnostics.items.some((finding) => finding.id === nPlusOneFinding.id),
      'trace diagnostic filter omitted the N+1 finding',
    )
    const diagnosticDetail = await api(`/api/diagnostics/${nPlusOneFinding.id}`)
    assert(
      diagnosticDetail.finding.id === nPlusOneFinding.id,
      'diagnostic detail returned the wrong finding',
    )
    assert(
      diagnosticDetail.finding.traceIds.length > 0 &&
        diagnosticDetail.trace?.traceId === diagnosticDetail.finding.traceIds[0],
      'diagnostic detail is missing the related trace',
    )
    assert(
      diagnosticDetail.finding.verification.length > 0 &&
        diagnosticDetail.finding.limitations.length > 0,
      'diagnostic detail has no verification or limitations',
    )
    const requestWithDiagnostics = await api(
      `/api/traces/${nPlusOneRequest.traceId}`,
    )
    assert(
      requestWithDiagnostics.diagnostics?.some(
        (reference) => reference.id === nPlusOneFinding.id,
      ),
      'request detail does not reference the diagnostic finding',
    )
    const fixedDetail = await api(`/api/traces/${nPlusOneFixedRequest.traceId}`)
    assert(
      !fixedDetail.diagnostics?.some(
        (reference) => reference.ruleId === 'n-plus-one-queries',
      ),
      'batched route was incorrectly marked as N+1',
    )
    ok('diagnostic detail, trace filters and additive trace references agree')

    const cliDiagnostics = JSON.parse(runCli(['diagnose', '--json']))
    assert(
      cliDiagnostics.items.some((finding) => finding.id === nPlusOneFinding.id),
      'CLI diagnose output does not include the API finding',
    )
    assert(
      cliDiagnostics.counts.total === diagnostics.counts.total,
      'CLI diagnose counts differ from the collector API',
    )
    const cliDiagnosticDetail = JSON.parse(
      runCli(['diagnose', '--id', nPlusOneFinding.id, '--json']),
    )
    assert(
      cliDiagnosticDetail.finding.id === nPlusOneFinding.id,
      'CLI diagnose --id returned the wrong finding',
    )
    const cliDiagnosticText = runCli(['diagnose'])
    assert(
      cliDiagnosticText.includes('StackNext diagnostics'),
      'CLI diagnose human output is missing its banner',
    )
    assert(
      cliDiagnosticText.includes('not confirmed root causes'),
      'CLI diagnose output is missing the root-cause caveat',
    )
    ok('CLI diagnose agrees with the collector diagnostics API')

    const errors = await api('/api/errors?limit=100')
    const error = errors.items.find((entry) => entry.route === '/api/error')
    assert(error, 'error was not captured')
    const detail = await api(`/api/errors/${error.id}`)
    assert(detail.error.message.includes('[redacted]'), 'error message was not redacted')
    assert(detail.error.resolvedTraceId?.length === 32, 'error is not correlated to a trace')
    assert(detail.trace && detail.trace.errors.length >= 1, 'correlated trace is missing')
    const serializedError = JSON.stringify(detail)
    for (const secret of secrets) {
      assert(!serializedError.includes(secret), `secret ${secret} leaked into error detail`)
    }
    ok('error detail is redacted and correlated to a trace')

    const exported = await api('/api/export')
    assert(exported.format === 'stacknext-export', 'export format mismatch')
    assert(exported.stats.spans > 0, 'export contains no spans')
    const serializedExport = JSON.stringify(exported)
    for (const secret of secrets) {
      assert(!serializedExport.includes(secret), `secret ${secret} leaked into export`)
    }
    ok('export API is redacted')

    const status = JSON.parse(runCli(['status', '--json']))
    assert(status.health.status === 'ok', 'CLI status health is not ok')
    assert(status.runtime.projectName === 'stacknext-example', 'CLI runtime project mismatch')
    assert(
      typeof status.health.instrumentation?.nextOtelVerbose?.enabled === 'boolean',
      'CLI status does not report NEXT_OTEL_VERBOSE state',
    )
    ok('CLI status --json')

    const cliCoverage = JSON.parse(runCli(['coverage', '--json']))
    assert(cliCoverage.sample.requests > 0, 'CLI coverage sample has no requests')
    assert(
      cliCoverage.items.some(
        (item) => item.id === 'custom.server-actions' && item.status === 'observed',
      ),
      'CLI coverage does not report observed Server Actions',
    )
    const cliCoverageText = runCli(['coverage'])
    assert(cliCoverageText.includes('StackNext coverage'), 'CLI coverage banner is missing')
    assert(cliCoverageText.includes('not a score'), 'CLI coverage is missing the score caveat')
    assert(
      cliCoverageText.includes('not-observed') ||
        cliCoverageText.includes('Not observed') ||
        cliCoverageText.includes('unsupported') ||
        cliCoverageText.includes('Not supported'),
      'CLI coverage does not explain missing evidence',
    )
    ok('CLI coverage --json and human output')

    const doctor = JSON.parse(runCli(['doctor', '--json']))
    assert(doctor.failures === 0, `doctor reported ${doctor.failures} failure(s)`)
    ok(`CLI doctor (${doctor.warnings} warning(s))`)

    const cliExport = JSON.parse(runCli(['export', '--stdout']))
    assert(cliExport.format === 'stacknext-export', 'CLI export format mismatch')
    for (const secret of secrets) {
      assert(
        !JSON.stringify(cliExport).includes(secret),
        `secret ${secret} leaked into CLI export`,
      )
    }
    ok('CLI export --stdout')

    const regression = await runRegressionChecks(api, secrets)

    const snapshot = await runSnapshotChecks(api, secrets)

    await runMcpChecks(
      runtime,
      error.id,
      nPlusOneFinding.id,
      regression,
      snapshot,
    )

    const dashboard = await fetch(`${runtime.dashboardUrl}/`)
    assert(dashboard.ok, `dashboard responded ${dashboard.status}`)
    assert(
      (await dashboard.text()).includes('<div id="root">'),
      'dashboard HTML is missing the React root',
    )
    ok('dashboard is served by the collector')

    const diagnosticsPage = await fetch(`${runtime.dashboardUrl}/diagnostics`)
    assert(diagnosticsPage.ok, `diagnostics dashboard route responded ${diagnosticsPage.status}`)
    assert(
      (await diagnosticsPage.text()).includes('<div id="root">'),
      'diagnostics dashboard route is missing the React root',
    )
    const diagnosticDetailPage = await fetch(
      `${runtime.dashboardUrl}/diagnostics/${nPlusOneFinding.id}`,
    )
    assert(
      diagnosticDetailPage.ok,
      `diagnostic detail dashboard route responded ${diagnosticDetailPage.status}`,
    )
    assert(
      (await diagnosticDetailPage.text()).includes('<div id="root">'),
      'diagnostic detail dashboard route is missing the React root',
    )
    ok('dashboard serves diagnostics and finding detail deep links')

    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
      const pageErrors = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      await page.goto(`${runtime.dashboardUrl}/diagnostics`, {
        waitUntil: 'domcontentloaded',
      })
      await page.waitForSelector('.finding-row', { timeout: 20_000 })
      assert(pageErrors.length === 0, `diagnostics dashboard threw: ${pageErrors.join('; ')}`)
      assert(
        (await page.locator('.finding-row').count()) > 0,
        'diagnostics dashboard rendered no findings',
      )
      await page.goto(`${runtime.dashboardUrl}/diagnostics/${nPlusOneFinding.id}`, {
        waitUntil: 'domcontentloaded',
      })
      await page.waitForSelector('h1', { timeout: 20_000 })
      await page.waitForTimeout(500)
      const detailText = await page.locator('body').innerText()
      assert(
        detailText.includes('not a confirmed root cause'),
        'diagnostic detail is missing its evidence caveat',
      )
      assert(
        detailText.includes('Trace occurrences'),
        'diagnostic detail has no trace occurrences',
      )
      assert(pageErrors.length === 0, `diagnostic detail threw: ${pageErrors.join('; ')}`)
      ok('diagnostics dashboard renders findings and detail without client errors')
    } finally {
      await browser.close()
    }

    for (const [label, pathname] of [
      ['traces', '/traces'],
      ['trace detail', `/traces/${slow.traceId}`],
      ['legacy requests', '/requests'],
      ['legacy request detail', `/requests/${slow.traceId}`],
      ['runs', '/runs'],
      ['run detail', `/runs/${regression.candidateRunId}`],
      ['baselines', '/baselines'],
      ['baseline detail', `/baselines/${regression.baselineId}`],
      ['comparisons', '/comparisons'],
      ['comparison detail', `/comparisons/${regression.comparisonId}`],
      ['snapshots', '/snapshots'],
      ['snapshot detail', `/snapshots/${snapshot.snapshotId}`],
      ['snapshot traces', `/snapshots/${snapshot.snapshotId}/traces`],
      [
        'snapshot trace detail',
        `/snapshots/${snapshot.snapshotId}/traces/${snapshot.traceId}`,
      ],
      ['snapshot errors', `/snapshots/${snapshot.snapshotId}/errors`],
      [
        'snapshot error detail',
        `/snapshots/${snapshot.snapshotId}/errors/${snapshot.errorId}`,
      ],
      ['snapshot database', `/snapshots/${snapshot.snapshotId}/database`],
      ['settings', '/settings'],
      ['mcp', '/mcp'],
    ]) {
      const page = await fetch(`${runtime.dashboardUrl}${pathname}`)
      assert(page.ok, `${label} dashboard route responded ${page.status}`)
      assert(
        (await page.text()).includes('<div id="root">'),
        `${label} dashboard route is missing the React root`,
      )
    }
    ok('dashboard serves testing, snapshot, settings and MCP deep links')

    const deleted = JSON.parse(
      runCli(['snapshot', 'delete', snapshot.snapshotId, '--yes', '--json']),
    )
    assert(deleted.deleted === true, 'CLI snapshot delete did not report success')
    const afterDelete = await api('/api/snapshots?limit=200')
    assert(
      !afterDelete.items.some((entry) => entry.id === snapshot.snapshotId),
      'snapshot is still listed after deletion',
    )
    ok('CLI snapshot delete removes the saved snapshot')

    completed = true
    console.log(`\n${passed} checks passed.`)
  } finally {
    if (spawned) {
      console.log('\nStopping spawned StackNext...')
      killDevProcess('SIGTERM')
      const exited = devProcess ? await waitForExit(devProcess, 8_000) : true
      if (!exited) {
        killDevProcess('SIGKILL')
        await waitForExit(devProcess, 2_000)
      }
      await rm(RUNTIME_FILE, { force: true })
      if (!completed && devLog.trim() !== '') {
        console.error('\n--- stacknext dev output ---')
        console.error(devLog.trim())
      }
    } else {
      console.log('\nReused an existing StackNext process; left it running.')
    }
  }
}

main().catch((error) => {
  console.error(`\nE2E failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
