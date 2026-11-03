#!/usr/bin/env node
/**
 * Integration check for the production StackNext collector image.
 *
 * Usage:
 *   node scripts/docker-integration.mjs --image stacknext:local --require-docker
 *
 * The standard unit suite does not run this script and does not require Docker.
 */
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

const TOKEN = 'docker-integration-token-0123456789'
const imageIndex = process.argv.indexOf('--image')
const image = imageIndex >= 0 ? process.argv[imageIndex + 1] : 'stacknext:local'
const requireDocker = process.argv.includes('--require-docker')

let passed = 0
function ok(label) {
  passed += 1
  console.log(`  ok   ${label}`)
}
function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: options.timeout ?? 120_000,
    windowsHide: true,
  })
  if (result.error) throw result.error
  return result
}

function dockerOk(args) {
  const result = docker(args)
  assert(
    result.status === 0,
    `docker ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`,
  )
  return result.stdout
}

async function portAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
      server.close(() => resolve(true))
    })
  })
}

async function findPort(start) {
  for (let port = start; port < start + 25; port += 1) {
    if (await portAvailable(port)) return port
  }
  throw new Error(`No free loopback port near ${start}`)
}

async function waitFor(label, check, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const value = await check()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(
    `Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`,
  )
}

async function fetchStatus(url, token) {
  const response = await fetch(url, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(5_000),
  })
  await response.arrayBuffer()
  return response.status
}

async function main() {
  const version = docker(['--version'])
  if (version.status !== 0) {
    if (requireDocker) throw new Error('Docker is required but the CLI is unavailable')
    console.log('Docker integration skipped: Docker CLI is unavailable.')
    return
  }
  const info = docker(['info', '--format', '{{.ServerVersion}}'])
  if (info.status !== 0) {
    if (requireDocker) throw new Error('Docker is required but the daemon is unavailable')
    console.log('Docker integration skipped: Docker daemon is unavailable.')
    return
  }

  const root = mkdtempSync(path.join(tmpdir(), 'stacknext-docker-'))
  const stacknext = path.join(root, '.stacknext')
  const configDir = path.join(stacknext, 'docker')
  const runsDir = path.join(stacknext, 'runs')
  mkdirSync(configDir, { recursive: true, mode: 0o700 })
  mkdirSync(runsDir, { recursive: true, mode: 0o700 })
  chmodSync(stacknext, 0o700)
  chmodSync(configDir, 0o700)
  chmodSync(runsDir, 0o700)
  const marker = path.join(root, 'application-marker.txt')
  writeFileSync(marker, 'do not touch\n')
  // An invalid record makes the mounted regression store observable without
  // creating a full run fixture.
  writeFileSync(path.join(runsDir, 'run-0000000000000000.json'), '{}\n', {
    mode: 0o600,
  })

  const hostPort = await findPort(4400)
  const configFile = path.join(configDir, 'config.json')
  const config = {
    version: 1,
    token: TOKEN,
    projectName: 'docker-integration',
    internalPort: 4400,
    publicPort: hostPort,
    projectDir: '/data',
    config: {
      projectName: 'docker-integration',
      runtime: { mode: 'docker' },
    },
    nextOtelVerbose: { enabled: false, source: 'disabled' },
  }
  writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  })
  chmodSync(configFile, 0o600)

  const containerName = `stacknext-integration-${process.pid}`
  const uid = process.platform === 'win32' ? undefined : process.getuid?.()
  const gid = process.platform === 'win32' ? undefined : process.getgid?.()
  if (uid === 0) {
    throw new Error('Run the Docker integration test as a non-root user')
  }
  const args = [
    'run',
    '--detach',
    '--init',
    '--name',
    containerName,
    '--label',
    'stacknext.managed=true',
    '--label',
    'stacknext.project=integration',
    '--publish',
    `127.0.0.1:${hostPort}:4400`,
    '--mount',
    `type=bind,source=${stacknext},target=/data/.stacknext,readonly`,
    '--env',
    'STACKNEXT_DOCKER_CONTAINER=1',
    '--env',
    'STACKNEXT_CONFIG_FILE=/data/.stacknext/docker/config.json',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=16m',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
  ]
  if (uid && gid) args.push('--user', `${uid}:${gid}`)
  args.push(image)

  let started = false
  try {
    const output = dockerOk(args)
    assert(/^[0-9a-f]{12,64}$/i.test(output.trim().split(/\r?\n/).at(-1) ?? ''), 'container id returned')
    started = true
    ok('container starts')

    await waitFor('collector readiness', async () => {
      const status = await fetchStatus(`http://127.0.0.1:${hostPort}/api/ping`)
      return status === 200
    })
    ok('collector health endpoint')

    const dashboard = await fetch(`http://127.0.0.1:${hostPort}/`, {
      signal: AbortSignal.timeout(5_000),
    })
    const html = await dashboard.text()
    assert(dashboard.status === 200 && html.includes('id="root"'), 'dashboard HTML is served')
    ok('dashboard static assets')

    const unauthorized = await fetchStatus(
      `http://127.0.0.1:${hostPort}/api/health`,
    )
    assert(unauthorized === 401, `unauthenticated read returned ${unauthorized}`)
    const unauthorizedIngest = await fetch(
      `http://127.0.0.1:${hostPort}/__stacknext/v1/ingest`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(5_000),
      },
    )
    assert(unauthorizedIngest.status === 401, 'unauthenticated ingest was accepted')
    await unauthorizedIngest.arrayBuffer()
    ok('authentication enforced')

    const traceId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const spanId = '1111111111111111'
    const now = Date.now()
    const envelope = {
      version: 1,
      instance: {
        instanceId: 'docker-integration-instance',
        serviceName: 'docker-integration',
        projectName: 'docker-integration',
        nextVersion: '16.4.3',
        sdkVersion: '0.7.0',
        runtime: 'nodejs',
      },
      spans: [
        {
          traceId,
          spanId,
          name: 'GET /api/docker-integration',
          kind: 'server',
          startTime: now - 50,
          endTime: now,
          durationMs: 50,
          status: 'ok',
          serviceName: 'docker-integration',
          route: '/api/docker-integration',
          method: 'GET',
          statusCode: 200,
          nextSpanType: 'BaseServer.handleRequest',
          attributes: { 'http.method': 'GET', 'http.status_code': 200 },
          events: [],
          resource: { 'service.name': 'docker-integration' },
        },
      ],
      errors: [],
      databaseQueries: [],
    }
    const ingest = await fetch(
      `http://127.0.0.1:${hostPort}/__stacknext/v1/ingest`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(envelope),
        signal: AbortSignal.timeout(5_000),
      },
    )
    assert(ingest.status === 202, `ingest returned ${ingest.status}`)
    await ingest.arrayBuffer()
    ok('telemetry ingest')

    const requests = await fetch(
      `http://127.0.0.1:${hostPort}/api/requests`,
      {
        headers: { authorization: `Bearer ${TOKEN}` },
        signal: AbortSignal.timeout(5_000),
      },
    )
    const requestPayload = await requests.json()
    assert(requestPayload.total === 1, `requests total was ${requestPayload.total}`)
    ok('telemetry read API')

    const regression = await fetch(
      `http://127.0.0.1:${hostPort}/api/test-runs`,
      {
        headers: { authorization: `Bearer ${TOKEN}` },
        signal: AbortSignal.timeout(5_000),
      },
    )
    const regressionPayload = await regression.json()
    assert(regression.status === 200 && regressionPayload.invalid === 1, 'mounted regression storage was not read')
    ok('mounted regression storage')

    const controller = new AbortController()
    const stream = await fetch(
      `http://127.0.0.1:${hostPort}/api/stream`,
      {
        headers: { authorization: `Bearer ${TOKEN}` },
        signal: controller.signal,
      },
    )
    assert(stream.status === 200 && stream.body, 'SSE stream did not open')
    const reader = stream.body.getReader()
    const decoder = new TextDecoder()
    let eventText = ''
    const streamDeadline = Date.now() + 5_000
    while (Date.now() < streamDeadline && !eventText.includes('event: ready')) {
      const chunk = await reader.read()
      if (chunk.done) break
      eventText += decoder.decode(chunk.value, { stream: true })
    }
    controller.abort()
    await reader.cancel().catch(() => undefined)
    assert(eventText.includes('event: ready'), 'SSE ready event was not received')
    ok('SSE stream')

    const published = dockerOk(['port', containerName, '4400/tcp']).trim()
    assert(published.includes(`127.0.0.1:${hostPort}`), `unexpected port binding: ${published}`)
    assert(!published.includes('0.0.0.0'), `port was published publicly: ${published}`)
    ok('host-loopback port binding')

    const metadata = dockerOk([
      'inspect',
      '--format',
      '{{json .Config.Env}} {{json .Config.Labels}} {{json .HostConfig.Mounts}}',
      containerName,
    ])
    assert(!metadata.includes(TOKEN), 'token leaked into container metadata')
    assert(!metadata.includes('STACKNEXT_TOKEN'), 'token environment variable was set')
    ok('token is absent from container metadata')

    const logs = docker(['logs', containerName])
    assert(
      !`${logs.stdout}${logs.stderr}`.includes(TOKEN),
      'token appeared in container logs',
    )
    ok('token is absent from container logs')

    if (process.platform !== 'win32') {
      const configMode = docker([
        'exec',
        containerName,
        'stat',
        '-c',
        '%a',
        '/data/.stacknext/docker/config.json',
      ])
      assert(
        configMode.status === 0 && configMode.stdout.trim() === '600',
        `private config mode was ${configMode.stdout.trim() || '(unreadable)'}`,
      )
      ok('private config file mode')
    }

    const hostConfig = JSON.parse(
      dockerOk(['inspect', '--format', '{{json .HostConfig}}', containerName]),
    )
    assert(hostConfig.ReadonlyRootfs === true, 'root filesystem is writable')
    assert(
      Array.isArray(hostConfig.CapDrop) && hostConfig.CapDrop.includes('ALL'),
      'capabilities were not dropped',
    )
    assert(
      Array.isArray(hostConfig.SecurityOpt) &&
        hostConfig.SecurityOpt.some((value) =>
          String(value).includes('no-new-privileges'),
        ),
      'no-new-privileges was not set',
    )
    assert(hostConfig.Init === true, 'init process was not enabled')
    assert(hostConfig.Privileged !== true, 'container is privileged')
    assert(hostConfig.NetworkMode !== 'host', 'container uses host networking')
    const inspected = JSON.parse(dockerOk(['inspect', containerName]))[0] ?? {}
    const mounts = Array.isArray(inspected.Mounts) ? inspected.Mounts : []
    const dataMount = mounts.find(
      (mount) => mount && mount.Destination === '/data/.stacknext',
    )
    assert(dataMount, 'the .stacknext mount is missing')
    assert(dataMount.RW === false, 'the .stacknext mount is writable')
    const tmpfs =
      hostConfig.Tmpfs && typeof hostConfig.Tmpfs === 'object'
        ? hostConfig.Tmpfs
        : {}
    assert(Object.keys(tmpfs).includes('/tmp'), 'the /tmp tmpfs is missing')
    ok('container isolation settings')

    const mountWrite = docker([
      'exec',
      containerName,
      'sh',
      '-c',
      'echo nope > /data/.stacknext/integration-write',
    ])
    assert(mountWrite.status !== 0, 'the regression mount allowed a write')
    const rootWrite = docker([
      'exec',
      '--user',
      'node',
      containerName,
      'sh',
      '-c',
      'touch /app/integration-write',
    ])
    assert(rootWrite.status !== 0, 'the container root filesystem allowed a write')
    const projectEscape = docker([
      'exec',
      containerName,
      'test',
      '-e',
      '/data/application-marker.txt',
    ])
    assert(projectEscape.status !== 0, 'project files are visible inside the container')
    ok('read-only mounts and filesystem')

    const stopped = docker(['stop', '--time', '5', containerName])
    assert(stopped.status === 0, `docker stop failed: ${stopped.stderr}`)
    const removed = docker(['rm', '--force', containerName])
    assert(removed.status === 0, `docker rm failed: ${removed.stderr}`)
    started = false
    const gone = docker(['inspect', containerName])
    assert(gone.status !== 0, 'container still exists after stop and remove')
    ok('graceful shutdown and container removal')

    const markerAfter = spawnSync(process.execPath, [
      '-e',
      `process.exit(require('node:fs').readFileSync(${JSON.stringify(marker)}, 'utf8') === 'do not touch\\n' ? 0 : 1)`,
    ])
    assert(markerAfter.status === 0, 'application files changed')
    ok('project files remain intact')
  } finally {
    if (started) docker(['rm', '--force', containerName])
    rmSync(root, { recursive: true, force: true })
  }

  console.log(`\nDocker integration passed: ${passed} checks (image ${image}).`)
}

await main().catch((error) => {
  console.error(`Docker integration failed: ${error instanceof Error ? error.stack : error}`)
  process.exit(1)
})
