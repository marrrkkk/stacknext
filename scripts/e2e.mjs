#!/usr/bin/env node
/**
 * Real end-to-end smoke test for the built NextScope CLI, collector, example
 * app, dashboard API and MCP server. Run `pnpm build` first.
 *
 * If the example app already has a live NextScope runtime, the script reuses it
 * and leaves it running. Otherwise it starts `nextscope dev` and stops it.
 */
import { spawn, spawnSync } from 'node:child_process'
import { access, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APP_DIR = path.join(ROOT, 'apps', 'example-next-app')
const CLI = path.join(ROOT, 'packages', 'cli', 'dist', 'bin.js')
const RUNTIME_FILE = path.join(APP_DIR, '.nextscope', 'run.json')
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
    headers: token ? { authorization: `Bearer ${token}`, accept: 'application/json' } : {},
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
        `nextscope dev exited with code ${devProcess.exitCode} while waiting for ${label}\n${devLog}`,
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
    timeout: 90_000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `nextscope ${args.join(' ')} exited ${result.status}\n${result.stdout}\n${result.stderr}`,
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
    console.log(`Reusing running NextScope at ${existing.dashboardUrl}\n`)
    return existing
  }
  if (existing) await rm(RUNTIME_FILE, { force: true })

  console.log('Starting NextScope and the example app...')
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

  const runtime = await waitFor('the NextScope runtime file', async () => {
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

async function runMcpChecks(runtime) {
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
      clientInfo: { name: 'nextscope-e2e', version: '0.1.0' },
    })
    assert(initialize.serverInfo?.name === 'nextscope', 'MCP server name mismatch')
    session.send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    ok('MCP initialize')

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
    ]) {
      assert(names.has(name), `MCP tool ${name} is missing`)
    }
    const notReadOnly = tools.tools.find(
      (tool) => tool.annotations?.readOnlyHint !== true,
    )
    assert(!notReadOnly, `MCP tool ${notReadOnly?.name} is not marked read-only`)
    ok('MCP exposes 9 read-only tools')

    const summary = await session.request('tools/call', {
      name: 'get_project_summary',
      arguments: {},
    })
    const summaryPayload = JSON.parse(summary.content[0].text)
    assert(summaryPayload.summary?.totalRequests > 0, 'MCP summary has no requests')
    ok('MCP get_project_summary')

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
    ok('MCP find_slow_requests')
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

    const api = (pathname) =>
      fetchJson(`${runtime.collectorUrl}${pathname}`, runtime.token)
    const secrets = ['super-secret-demo-token', 'hunter2', 'e2e-url-secret']

    const initial = await api('/api/health')
    assert(initial.status === 'ok', 'collector health is not ok')
    ok(`collector healthy on ${runtime.collectorUrl}`)

    await fetchApp('/')
    await fetchApp('/projects/1')
    await fetchApp('/api/projects')
    await fetchApp('/api/projects/1/tasks')
    await fetchApp('/api/slow?delay=350')
    const errorStatus = await fetchApp('/api/error?token=e2e-url-secret&password=hunter2')
    assert(errorStatus === 500, `error route returned ${errorStatus}, expected 500`)
    ok('example app routes exercised')

    const health = await waitFor('captured request telemetry', async () => {
      const value = await api('/api/health')
      return value.counts.requests >= 6 &&
        value.counts.errors >= 1 &&
        value.counts.databaseQueries >= 1
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

    const slowDetail = await api(`/api/requests/${slow.traceId}`)
    assert(slowDetail.spans.length >= 3, 'slow request trace has too few spans')
    assert(slowDetail.databaseQueries.length >= 1, 'slow request has no database query')
    assert(slowDetail.durationMs >= 250, 'slow request trace duration is too low')
    ok(`slow trace ${slow.traceId.slice(0, 8)}… has ${slowDetail.spans.length} spans`)

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
    assert(exported.format === 'nextscope-export', 'export format mismatch')
    assert(exported.stats.spans > 0, 'export contains no spans')
    const serializedExport = JSON.stringify(exported)
    for (const secret of secrets) {
      assert(!serializedExport.includes(secret), `secret ${secret} leaked into export`)
    }
    ok('export API is redacted')

    const status = JSON.parse(runCli(['status', '--json']))
    assert(status.health.status === 'ok', 'CLI status health is not ok')
    assert(status.runtime.projectName === 'nextscope-example', 'CLI runtime project mismatch')
    ok('CLI status --json')

    const doctor = JSON.parse(runCli(['doctor', '--json']))
    assert(doctor.failures === 0, `doctor reported ${doctor.failures} failure(s)`)
    ok(`CLI doctor (${doctor.warnings} warning(s))`)

    const cliExport = JSON.parse(runCli(['export', '--stdout']))
    assert(cliExport.format === 'nextscope-export', 'CLI export format mismatch')
    for (const secret of secrets) {
      assert(
        !JSON.stringify(cliExport).includes(secret),
        `secret ${secret} leaked into CLI export`,
      )
    }
    ok('CLI export --stdout')

    await runMcpChecks(runtime)

    const dashboard = await fetch(`${runtime.dashboardUrl}/`)
    assert(dashboard.ok, `dashboard responded ${dashboard.status}`)
    assert(
      (await dashboard.text()).includes('<div id="root">'),
      'dashboard HTML is missing the React root',
    )
    ok('dashboard is served by the collector')

    completed = true
    console.log(`\n${passed} checks passed.`)
  } finally {
    if (spawned) {
      console.log('\nStopping spawned NextScope...')
      killDevProcess('SIGTERM')
      const exited = devProcess ? await waitForExit(devProcess, 8_000) : true
      if (!exited) {
        killDevProcess('SIGKILL')
        await waitForExit(devProcess, 2_000)
      }
      await rm(RUNTIME_FILE, { force: true })
      if (!completed && devLog.trim() !== '') {
        console.error('\n--- nextscope dev output ---')
        console.error(devLog.trim())
      }
    } else {
      console.log('\nReused an existing NextScope process; left it running.')
    }
  }
}

main().catch((error) => {
  console.error(`\nE2E failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
