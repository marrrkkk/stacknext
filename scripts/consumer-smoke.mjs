#!/usr/bin/env node
/**
 * Installs StackNext from real package archives into an external Next.js
 * application, exercises the documented startup/inspection/MCP journey and
 * verifies clean shutdown. The fixture is outside the pnpm workspace and does
 * not use workspace aliases.
 *
 * Usage:
 *   node scripts/consumer-smoke.mjs [--next 16.4.3] [--pm npm|pnpm]
 *     [--skip-build] [--keep] [--json]
 */
import { spawn, spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ROOT, packPackages } from './lib/release.mjs'

function option(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const nextVersion = option('--next', process.env.STACKNEXT_NEXT ?? '16.4.3')
const packageManager = option('--pm', process.env.STACKNEXT_PM ?? 'npm')
const keep = process.argv.includes('--keep')
const jsonOutput = process.argv.includes('--json')
const skipBuild = process.argv.includes('--skip-build')
if (!['npm', 'pnpm'].includes(packageManager)) {
  throw new Error(`Unsupported package manager ${packageManager}; use npm or pnpm.`)
}

const steps = []
let fixtureDir = ''
let devChild = null
let devLog = ''
let mcpChild = null

function record(label, detail) {
  steps.push({ label, detail, at: Date.now() })
  if (!jsonOutput) console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`)
}

function fail(message) {
  throw new Error(message)
}

async function exists(file) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? fixtureDir,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      NO_COLOR: '1',
      ...options.env,
    },
    encoding: 'utf8',
    timeout: options.timeout ?? 180_000,
    shell: process.platform === 'win32' && !path.isAbsolute(command),
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit ${result.status}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    )
  }
  return result
}

async function runCli(args) {
  return run(process.execPath, [path.join(fixtureDir, 'node_modules', 'stacknext', 'dist', 'bin.js'), ...args], {
    timeout: 60_000,
  })
}

async function fetchStatus(url, headers = {}, timeoutMs = 5_000) {
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    })
    return { status: response.status, text: await response.text(), headers: response.headers }
  } catch {
    return null
  }
}

async function waitFor(label, fn, timeoutMs = 60_000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    try {
      last = await fn()
      if (last) return last
    } catch {
      // Retry until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

function appFiles() {
  return {
    'package.json': null,
    'next.config.mjs': `const nextConfig = { poweredByHeader: false }\nexport default nextConfig\n`,
    'app/layout.js': `export const metadata = { title: 'StackNext consumer fixture' }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`,
    'app/page.js': `export default function Page() {
  return (
    <main>
      <h1>StackNext consumer fixture</h1>
      <p>Installed from package archives outside the monorepo.</p>
    </main>
  )
}
`,
    'app/api/ping/route.js': `export function GET() {
  return Response.json({ ok: true, runtime: process.env.NEXT_RUNTIME ?? 'unknown' })
}
`,
    'app/api/error/route.js': `export function GET() {
  throw new Error('consumer fixture failure')
}
`,
    'public/.gitkeep': '',
    'next-env.d.ts': null,
  }
}

async function createFixture(packed) {
  fixtureDir = await mkdtemp(path.join(tmpdir(), 'stacknext-consumer-'))
  const appPort = await freePort()
  const dashboardPort = await freePort()
  const files = appFiles()
  const devDependencies = {}
  for (const entry of packed.packages) {
    devDependencies[entry.name] = `file:${entry.tarball.replace(/\\/g, '/')}`
  }
  const manifest = {
    name: 'stacknext-consumer-fixture',
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: {
      dev: `next dev -p ${appPort}`,
      build: 'next build',
      start: `next start -p ${appPort}`,
    },
    dependencies: {
      next: nextVersion,
      react: '19.3.1',
      'react-dom': '19.3.1',
    },
    devDependencies,
  }
  for (const [file, contents] of Object.entries(files)) {
    if (contents === null) continue
    const target = path.join(fixtureDir, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, contents)
  }
  await writeFile(
    path.join(fixtureDir, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  if (packageManager === 'pnpm') {
    const overrides = Object.entries(devDependencies)
      .map(([name, spec]) => `  ${JSON.stringify(name)}: ${JSON.stringify(spec)}`)
      .join('\n')
    await writeFile(
      path.join(fixtureDir, 'pnpm-workspace.yaml'),
      `packages: []\noverrides:\n${overrides}\n`,
    )
  }
  return { appPort, dashboardPort }
}

async function install() {
  const args =
    packageManager === 'npm'
      ? ['install', '--no-audit', '--no-fund', '--no-progress']
      : ['install', '--reporter=append-only']
  run(packageManager, args, { timeout: 600_000 })
  const bin = path.join(
    fixtureDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'stacknext.cmd' : 'stacknext',
  )
  if (!(await exists(bin))) fail('The stacknext bin was not linked after installation')
  const version =
    packageManager === 'npm'
      ? run('npx', ['--no-install', 'stacknext', '--version'], { timeout: 30_000 })
      : run('pnpm', ['exec', 'stacknext', '--version'], { timeout: 30_000 })
  return version.stdout.trim()
}

async function startDev() {
  const bin = path.join(fixtureDir, 'node_modules', 'stacknext', 'dist', 'bin.js')
  devChild = spawn(process.execPath, [bin, 'dev', '--quiet'], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      NO_COLOR: '1',
      STACKNEXT_DEBUG: '1',
    },
    // The IPC channel lets Windows ask for a graceful shutdown; taskkill /F
    // cannot run the CLI's exit cleanup.
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    detached: process.platform !== 'win32',
  })
  const append = (chunk) => {
    devLog = `${devLog}${chunk}`.slice(-40_000)
  }
  devChild.stdout?.on('data', append)
  devChild.stderr?.on('data', append)
  devChild.on('error', (error) => {
    append(`\n[stacknext dev error] ${error.message}`)
  })
  devChild.once('exit', (code, signal) => {
    append(`\n[stacknext dev exited ${code ?? signal}]`)
  })
}

async function stopDev() {
  if (!devChild || devChild.exitCode !== null || devChild.signalCode !== null) return
  const pid = devChild.pid
  if (!pid) return
  const exited = () => devChild.exitCode !== null || devChild.signalCode !== null
  if (devChild.connected) {
    try {
      // A callback consumes asynchronous IPC channel errors so the fallback
      // below runs instead of an unhandled 'error' event aborting the smoke.
      devChild.send({ type: 'shutdown' }, () => {})
      await waitFor('stacknext dev to exit', exited, 20_000)
      return
    } catch {
      // Fall through to signal/forced termination when the control message is lost.
    }
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    try {
      process.kill(-pid, 'SIGINT')
    } catch {
      devChild.kill('SIGINT')
    }
  }
  await waitFor('stacknext dev to exit', exited, 20_000)
}

async function mcpCheck() {
  const bin = path.join(fixtureDir, 'node_modules', 'stacknext', 'dist', 'bin.js')
  mcpChild = spawn(process.execPath, [bin, 'mcp'], {
    cwd: fixtureDir,
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let buffer = ''
  const responses = new Map()
  mcpChild.stdout.on('data', (chunk) => {
    buffer += chunk.toString()
    let index
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (!line) continue
      try {
        const message = JSON.parse(line)
        if (message.id !== undefined) responses.set(message.id, message)
      } catch {
        // Ignore non-protocol output; any stdout log is a bug but surfaced below.
      }
    }
  })
  const send = (message) => mcpChild.stdin.write(`${JSON.stringify(message)}\n`)
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'stacknext-consumer-smoke', version: '1.0.0' },
    },
  })
  send({ jsonrpc: '2.0', method: 'notifications/initialized' })
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  send({ jsonrpc: '2.0', id: 3, method: 'prompts/list', params: {} })
  await waitFor('MCP responses', () => responses.has(2) && responses.has(3), 20_000)
  const tools = responses.get(2).result?.tools ?? []
  const prompts = responses.get(3).result?.prompts ?? []
  mcpChild.kill()
  if (tools.length !== 17) fail(`Expected 17 MCP tools, got ${tools.length}`)
  if (!tools.every((tool) => tool.annotations?.readOnlyHint === true)) {
    fail('Every MCP tool must be read-only')
  }
  if (prompts.length !== 5) fail(`Expected 5 MCP prompts, got ${prompts.length}`)
  return { tools: tools.length, prompts: prompts.length }
}

async function main() {
  if (!skipBuild) {
    run('pnpm', ['build'], { cwd: ROOT, timeout: 900_000 })
    record('workspace build')
  }
  const packDir = path.join(
    process.env.STACKNEXT_PACK_DIR ?? path.join(ROOT, 'release', 'consumer'),
    `${nextVersion}-${packageManager}`,
  )
  const packed = await packPackages({ outDir: packDir })
  record('packed public package archives', `${packed.packages.length} packages`)

  const { appPort, dashboardPort } = await createFixture(packed)
  record('created external fixture', fixtureDir)

  const installedVersion = await install()
  record(
    `installed archives with ${packageManager}`,
    `stacknext ${installedVersion}, Next.js ${nextVersion}`,
  )

  await runCli(['init'])
  const configFile = path.join(fixtureDir, 'stacknext.config.json')
  const instrumentationFile = (
    await Promise.all(
      ['instrumentation.js', 'instrumentation.ts'].map((name) =>
        exists(path.join(fixtureDir, name)).then((found) =>
          found ? path.join(fixtureDir, name) : null,
        ),
      ),
    )
  ).find((file) => file !== null)
  if (!(await exists(configFile))) fail('init did not create stacknext.config.json')
  if (!instrumentationFile) fail('init did not create instrumentation.js or instrumentation.ts')
  const config = JSON.parse(await readFile(configFile, 'utf8'))
  config.dashboard.port = dashboardPort
  await writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`)
  record('initialized the fixture', 'config + instrumentation created')

  await runCli(['init'])
  record('re-ran init idempotently')

  const doctor = JSON.parse((await runCli(['doctor', '--json'])).stdout)
  if (doctor.failures !== 0) {
    fail(`doctor reported ${doctor.failures} failure(s): ${JSON.stringify(doctor.checks)}`)
  }
  record('doctor checks passed')

  await startDev()
  const runtimeFile = path.join(fixtureDir, '.stacknext', 'run.json')
  const state = await waitFor('runtime state', async () => {
    try {
      return JSON.parse(await readFile(runtimeFile, 'utf8'))
    } catch {
      return null
    }
  }, 60_000)
  const auth = { authorization: `Bearer ${state.token}` }
  await waitFor(
    'dashboard and app',
    async () => {
      const ping = await fetchStatus(`${state.dashboardUrl}/api/ping`)
      const page = await fetchStatus(`http://127.0.0.1:${appPort}/`)
      return ping?.status === 200 && page?.status === 200
    },
    90_000,
  )
  const dashboard = await fetchStatus(`${state.dashboardUrl}/`)
  if (!dashboard || dashboard.status !== 200) fail('dashboard HTML was not served')
  if (!dashboard.text.includes('<title>StackNext</title>')) {
    fail('dashboard HTML does not identify StackNext')
  }
  const asset = /src="([^"]+\.js)"/.exec(dashboard.text)?.[1]
  if (!asset) fail('dashboard HTML did not reference a JavaScript asset')
  const assetResponse = await fetchStatus(`${state.dashboardUrl}${asset}`)
  if (!assetResponse || assetResponse.status !== 200) fail('dashboard asset was not served')
  record('dashboard and static assets served', state.dashboardUrl)

  await fetchStatus(`http://127.0.0.1:${appPort}/api/ping`)
  await fetchStatus(`http://127.0.0.1:${appPort}/`)
  await waitFor(
    'captured telemetry',
    async () => {
      const health = await fetchStatus(`${state.dashboardUrl}/api/health`, auth)
      if (!health || health.status !== 200) return null
      const body = JSON.parse(health.text)
      return body.counts.requests > 0 && body.counts.spans > 0 ? body : null
    },
    30_000,
  )
  record('captured real Next.js request telemetry')

  const status = JSON.parse((await runCli(['status', '--json'])).stdout)
  if (!status.runtime?.token) fail('status --json did not return runtime metadata')
  const coverage = JSON.parse((await runCli(['coverage', '--json'])).stdout)
  if (!Array.isArray(coverage.items)) fail('coverage --json did not return items')
  const diagnostics = JSON.parse((await runCli(['diagnose', '--json'])).stdout)
  if (!Array.isArray(diagnostics.items)) fail('diagnose --json did not return items')
  record('status, coverage and diagnostics read the live sample')

  const mcp = await mcpCheck()
  record('MCP handshake', `${mcp.tools} read-only tools, ${mcp.prompts} prompts`)

  await stopDev()
  if (await exists(runtimeFile)) fail('runtime state was not removed on shutdown')
  const after = await fetchStatus(`http://127.0.0.1:${appPort}/`, {}, 1_000)
  if (after) fail('the app still responds after stacknext dev exited')
  record('clean shutdown removed runtime state and stopped the app')

  await runCli(['uninstall'])
  if (!(await exists(instrumentationFile))) fail('uninstall dry run removed instrumentation')
  record('uninstall dry run preserved files')
  await runCli(['uninstall', '--yes'])
  if (await exists(instrumentationFile)) fail('uninstall did not remove generated instrumentation')
  if (await exists(configFile)) fail('uninstall did not remove StackNext config')
  record('uninstall removed only StackNext-owned files')

  if (!jsonOutput) {
    console.log(`\nConsumer smoke passed for Next.js ${nextVersion} with ${packageManager} on Node ${process.version}.`)
    if (keep) console.log(`Fixture kept at ${fixtureDir}`)
  } else {
    console.log(
      JSON.stringify(
        {
          nextVersion,
          packageManager,
          node: process.version,
          installedVersion,
          fixture: fixtureDir,
          steps,
        },
        null,
        2,
      ),
    )
  }
}

try {
  await main()
} catch (error) {
  console.error(`\nConsumer smoke failed: ${error instanceof Error ? error.message : String(error)}`)
  if (devLog) console.error(`\nstacknext dev log:\n${devLog}`)
  process.exitCode = 1
} finally {
  if (mcpChild) mcpChild.kill()
  try {
    await stopDev()
  } catch {
    // Best-effort cleanup before the fixture is removed.
  }
  if (fixtureDir && !keep) {
    await rm(fixtureDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
