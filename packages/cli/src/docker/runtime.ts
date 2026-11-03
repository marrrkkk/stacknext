import { createHash } from 'node:crypto'
import { rmSync } from 'node:fs'
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import type { NextOtelVerboseStatus, StackNextConfig } from '@stacknext/core'
import { ensureRuntimeDir } from '../runtime.js'
import { resolveDockerImage, normalizeDockerImageReference } from './image.js'
import {
  DOCKER_CONFIG_DIR_NAME,
  DOCKER_CONFIG_FILE_NAME,
  DOCKER_CONTAINER_CONFIG_PATH,
  DOCKER_INTERNAL_PORT,
  dockerCollectorConfigSchema,
  type DockerCollectorConfig,
} from './protocol.js'
import {
  dockerResultMessage,
  dockerRunner,
  type DockerRunner,
} from './runner.js'

const MANAGED_LABEL = 'stacknext.managed'
const PROJECT_LABEL = 'stacknext.project'
const RUNTIME_LABEL = 'stacknext.runtime'
const VERSION_LABEL = 'stacknext.version'
const CONTAINER_PREFIX = 'stacknext'
const MAX_PORT_ATTEMPTS = 25

export class DockerUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DockerUnavailableError'
  }
}

export interface DockerCollectorHandle {
  port: number
  url: string
  token: string
  containerId: string
  containerName: string
  image: string
  close: () => Promise<void>
}

export interface StartDockerCollectorOptions {
  projectDir: string
  config: StackNextConfig
  token: string
  projectName: string
  version: string
  nextOtelVerbose: NextOtelVerboseStatus
  image?: string
  hostPort?: number
  user?: string
  startupTimeoutMs?: number
  pollIntervalMs?: number
  runner?: DockerRunner
  probe?: (url: string) => Promise<boolean>
  portFinder?: (start: number) => Promise<number>
  log?: (message: string) => void
}

export interface StopDockerOptions {
  runner?: DockerRunner
  containerId?: string
}

export function projectDockerKey(projectDir: string): string {
  const resolved = path.resolve(projectDir)
  // Windows paths are case-insensitive, so keep the label stable when the
  // drive letter or directory casing changes between invocations.
  const normalized =
    process.platform === 'win32' ? resolved.toLowerCase() : resolved
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}

export function dockerContainerName(projectDir: string): string {
  return `${CONTAINER_PREFIX}-${projectDockerKey(projectDir)}`
}

export function dockerNetworkName(projectDir: string): string {
  return `${CONTAINER_PREFIX}-net-${projectDockerKey(projectDir)}`
}

const CONTAINER_DATA_PATH = '/data/.stacknext'

function normalizeMountPath(value: string): string {
  const absolute = path.resolve(value)
  return process.platform === 'win32'
    ? absolute.replace(/\\/g, '/')
    : absolute
}

/**
 * Docker's `--mount` parser splits on commas and has no escape syntax, so a
 * project path containing a comma must use `--volume` instead. `--volume`
 * splits on colons, which cannot appear in Windows paths beyond the drive
 * letter and are legal but rare on POSIX; reject only the ambiguous
 * comma-and-colon combination.
 */
function dataMountArgs(projectDir: string): string[] {
  const source = normalizeMountPath(path.join(projectDir, '.stacknext'))
  if (!source.includes(',')) {
    return [
      '--mount',
      `type=bind,source=${source},target=${CONTAINER_DATA_PATH},readonly`,
    ]
  }
  if (process.platform !== 'win32' && source.includes(':')) {
    throw new Error(
      `Cannot mount ${source} into the StackNext container: the project path contains both a comma and a colon. Move the project to a path without one of those characters or use native mode.`,
    )
  }
  return ['--volume', `${source}:${CONTAINER_DATA_PATH}:ro`]
}

export function buildDockerRunArgs(input: {
  image: string
  name: string
  network: string
  projectDir: string
  hostPort: number
  version: string
  user?: string
}): string[] {
  const args = [
    'run',
    '--detach',
    '--init',
    '--name',
    input.name,
    '--label',
    `${MANAGED_LABEL}=true`,
    '--label',
    `${PROJECT_LABEL}=${projectDockerKey(input.projectDir)}`,
    '--label',
    `${RUNTIME_LABEL}=docker`,
    '--label',
    `${VERSION_LABEL}=${input.version}`,
    '--publish',
    `127.0.0.1:${input.hostPort}:${DOCKER_INTERNAL_PORT}`,
    // A dedicated user-defined network keeps other containers on the default
    // bridge away from the collector, which must bind 0.0.0.0 inside the
    // container for port publishing.
    '--network',
    input.network,
    ...dataMountArgs(input.projectDir),
    '--env',
    'STACKNEXT_DOCKER_CONTAINER=1',
    '--env',
    `STACKNEXT_CONFIG_FILE=${DOCKER_CONTAINER_CONFIG_PATH}`,
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=16m',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
  ]
  if (input.user) args.push('--user', input.user)
  args.push(input.image)
  return args
}

export function dockerUserForCurrentProcess(): string | undefined {
  if (process.platform === 'win32') return undefined
  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined
  const gid = typeof process.getgid === 'function' ? process.getgid() : undefined
  if (uid === undefined || gid === undefined) return undefined
  if (uid === 0) {
    throw new DockerUnavailableError(
      'Docker mode must run as a non-root user because the private runtime config is mounted with 0600 permissions. Run StackNext as your normal development user.',
    )
  }
  return `${uid}:${gid}`
}

export async function isPortAvailable(
  port: number,
  host = '127.0.0.1',
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const server = createServer()
    const done = (available: boolean): void => {
      server.removeAllListeners()
      resolve(available)
    }
    server.unref()
    server.once('error', () => done(false))
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => done(true))
    })
  })
}

export async function findAvailablePort(
  start: number,
  attempts = MAX_PORT_ATTEMPTS,
): Promise<number> {
  for (let offset = 0; offset < attempts; offset += 1) {
    const candidate = start + offset
    if (candidate > 65535) break
    if (await isPortAvailable(candidate)) return candidate
  }
  throw new Error(
    `Could not find an available loopback port near ${start}. Stop the process using that port or change dashboard.port.`,
  )
}

export async function checkDockerAvailability(
  runner: DockerRunner = dockerRunner,
): Promise<{ version: string }> {
  const cli = await runner.run(['--version'], { timeoutMs: 10_000 })
  if (
    (cli.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT' ||
    (cli.code === null && !cli.stderr)
  ) {
    throw new DockerUnavailableError(
      'Docker CLI was not found. Install Docker Desktop (Windows/macOS) or Docker Engine (Linux), make sure "docker" is on PATH, then retry "stacknext dev --runtime docker".',
    )
  }
  if (cli.code !== 0) {
    throw new DockerUnavailableError(
      `Docker CLI is not usable: ${dockerResultMessage(cli)}. Check that Docker Desktop or Docker Engine is running and that "docker" is available in this shell, then retry.`,
    )
  }
  const info = await runner.run(['info', '--format', '{{.ServerVersion}}'], {
    timeoutMs: 15_000,
  })
  if (info.code !== 0) {
    throw new DockerUnavailableError(
      `Docker daemon is not running or not reachable: ${dockerResultMessage(info)}. Start Docker Desktop or the Docker service, then retry.`,
    )
  }
  return { version: info.stdout.trim() }
}

async function ensureImage(
  runner: DockerRunner,
  image: string,
  log: (message: string) => void,
): Promise<void> {
  const inspected = await runner.run(['image', 'inspect', image], {
    timeoutMs: 15_000,
  })
  if (inspected.code === 0) return
  log(`Pulling ${image} (the image is not present locally)`)
  const pulled = await runner.run(['pull', image], { stdio: 'inherit' })
  if (pulled.code !== 0) {
    throw new Error(
      `Could not pull ${image}: ${dockerResultMessage(pulled)}. Check network access to the registry or set STACKNEXT_DOCKER_IMAGE to a locally built image.`,
    )
  }
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export async function listManagedContainers(
  runner: DockerRunner,
  projectDir: string,
): Promise<string[]> {
  const result = await runner.run(
    [
      'ps',
      '--all',
      '--filter',
      `label=${MANAGED_LABEL}=true`,
      '--filter',
      `label=${PROJECT_LABEL}=${projectDockerKey(projectDir)}`,
      '--format',
      '{{.ID}}',
    ],
    { timeoutMs: 15_000 },
  )
  if (result.code !== 0) {
    throw new Error(
      `Could not list StackNext containers: ${dockerResultMessage(result)}`,
    )
  }
  return lines(result.stdout).filter((line) => /^[0-9a-f]{12,64}$/i.test(line))
}

async function containerLabels(
  runner: DockerRunner,
  containerId: string,
): Promise<{ managed: string; project: string } | null> {
  const result = await runner.run(
    [
      'inspect',
      '--format',
      `{{index .Config.Labels "${MANAGED_LABEL}"}}|{{index .Config.Labels "${PROJECT_LABEL}"}}`,
      containerId,
    ],
    { timeoutMs: 10_000 },
  )
  if (result.code !== 0) {
    const detail = `${result.stderr}\n${result.stdout}`.toLowerCase()
    if (
      detail.includes('no such container') ||
      detail.includes('no such object') ||
      detail.includes('not found')
    ) {
      return null
    }
    throw new Error(
      `Could not inspect StackNext container ${containerId.slice(0, 12)}: ${dockerResultMessage(result)}`,
    )
  }
  const [managed = '', project = ''] = result.stdout.trim().split('|')
  return { managed, project }
}

async function removeContainer(
  runner: DockerRunner,
  containerId: string,
): Promise<void> {
  const result = await runner.run(['rm', '--force', containerId], {
    timeoutMs: 20_000,
  })
  if (result.code !== 0) {
    const detail = `${result.stderr}\n${result.stdout}`.toLowerCase()
    if (
      detail.includes('no such container') ||
      detail.includes('no such object') ||
      detail.includes('not found')
    ) {
      return
    }
    throw new Error(
      `Could not remove StackNext container ${containerId.slice(0, 12)}: ${dockerResultMessage(result)}`,
    )
  }
}

export async function removeManagedContainers(
  runner: DockerRunner,
  projectDir: string,
): Promise<string[]> {
  const ids = await listManagedContainers(runner, projectDir)
  const removed: string[] = []
  for (const id of ids) {
    const labels = await containerLabels(runner, id)
    if (labels?.managed === 'true' && labels.project === projectDockerKey(projectDir)) {
      await removeContainer(runner, id)
      removed.push(id)
    }
  }
  return removed
}

/**
 * Removes a container only after confirming both StackNext labels. Used when
 * the caller has a name or id but did not necessarily create it.
 */
async function removeOwnedContainer(
  runner: DockerRunner,
  projectDir: string,
  container: string,
): Promise<boolean> {
  const labels = await containerLabels(runner, container)
  if (
    labels?.managed !== 'true' ||
    labels.project !== projectDockerKey(projectDir)
  ) {
    return false
  }
  await removeContainer(runner, container)
  return true
}

/**
 * Reads the StackNext labels from a network. Returns null when Docker reports
 * that the network does not exist, and throws for daemon/permission failures so
 * callers never treat an unreadable network as disposable.
 */
async function networkOwnership(
  runner: DockerRunner,
  network: string,
): Promise<{ managed: string; project: string } | null> {
  const result = await runner.run(
    [
      'network',
      'inspect',
      '--format',
      `{{index .Labels "${MANAGED_LABEL}"}}|{{index .Labels "${PROJECT_LABEL}"}}`,
      network,
    ],
    { timeoutMs: 10_000 },
  )
  if (result.code !== 0) {
    const detail = `${result.stderr}\n${result.stdout}`.toLowerCase()
    if (
      detail.includes('no such network') ||
      detail.includes('no such object') ||
      detail.includes('not found')
    ) {
      return null
    }
    throw new Error(
      `Could not inspect StackNext network ${network}: ${dockerResultMessage(result)}`,
    )
  }
  const [managed = '', project = ''] = result.stdout.trim().split('|')
  return { managed, project }
}

async function ensureDockerNetwork(
  runner: DockerRunner,
  projectDir: string,
  version: string,
): Promise<string> {
  const name = dockerNetworkName(projectDir)
  const key = projectDockerKey(projectDir)
  const existing = await networkOwnership(runner, name)
  if (existing) {
    if (existing.managed !== 'true' || existing.project !== key) {
      throw new Error(
        `A Docker network named ${name} already exists but is not managed by StackNext for this project. Remove or rename it, then retry.`,
      )
    }
    return name
  }
  const created = await runner.run(
    [
      'network',
      'create',
      '--label',
      `${MANAGED_LABEL}=true`,
      '--label',
      `${PROJECT_LABEL}=${key}`,
      '--label',
      `${RUNTIME_LABEL}=docker`,
      '--label',
      `${VERSION_LABEL}=${version}`,
      name,
    ],
    { timeoutMs: 20_000 },
  )
  if (created.code !== 0) {
    // A concurrent create may have won the race; accept it only when the
    // existing network is ours.
    const raced = await networkOwnership(runner, name)
    if (raced?.managed === 'true' && raced.project === key) return name
    throw new Error(
      `Could not create the StackNext Docker network: ${dockerResultMessage(created)}`,
    )
  }
  return name
}

/**
 * Removes only networks carrying both StackNext labels for this project. A
 * network is left in place when its labels cannot be read or it still has an
 * attached container.
 */
export async function removeManagedNetworks(
  runner: DockerRunner,
  projectDir: string,
): Promise<string[]> {
  const key = projectDockerKey(projectDir)
  const listed = await runner.run(
    [
      'network',
      'ls',
      '--filter',
      `label=${MANAGED_LABEL}=true`,
      '--filter',
      `label=${PROJECT_LABEL}=${key}`,
      '--format',
      '{{.ID}}',
    ],
    { timeoutMs: 15_000 },
  )
  if (listed.code !== 0) {
    throw new Error(
      `Could not list StackNext networks: ${dockerResultMessage(listed)}`,
    )
  }
  const removed: string[] = []
  for (const id of lines(listed.stdout).filter((line) =>
    /^[0-9a-f]{12,64}$/i.test(line),
  )) {
    const labels = await networkOwnership(runner, id)
    if (labels?.managed !== 'true' || labels.project !== key) continue
    const result = await runner.run(['network', 'rm', id], {
      timeoutMs: 20_000,
    })
    if (result.code === 0) {
      removed.push(id)
      continue
    }
    const detail = `${result.stderr}\n${result.stdout}`.toLowerCase()
    if (detail.includes('no such network') || detail.includes('not found')) {
      continue
    }
    // A network with active endpoints is left in place. This can only happen
    // when something outside StackNext attached to the project network.
    if (
      detail.includes('active endpoints') ||
      detail.includes('is connected to network') ||
      detail.includes('has active endpoints')
    ) {
      continue
    }
    throw new Error(
      `Could not remove StackNext network ${id.slice(0, 12)}: ${dockerResultMessage(result)}`,
    )
  }
  return removed
}

export function dockerConfigPath(projectDir: string): string {
  return path.join(
    projectDir,
    '.stacknext',
    DOCKER_CONFIG_DIR_NAME,
    DOCKER_CONFIG_FILE_NAME,
  )
}

export async function writeDockerConfig(
  projectDir: string,
  payload: DockerCollectorConfig,
): Promise<string> {
  await ensureRuntimeDir(projectDir)
  const dir = path.dirname(dockerConfigPath(projectDir))
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await chmod(dir, 0o700).catch(() => undefined)
  const file = dockerConfigPath(projectDir)
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
  await chmod(file, 0o600).catch(() => undefined)
  return file
}

export async function removeDockerConfig(projectDir: string): Promise<void> {
  await rm(path.dirname(dockerConfigPath(projectDir)), {
    recursive: true,
    force: true,
  })
}

export async function probeCollector(
  url: string,
  timeoutMs = 1_500,
): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/ping`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    await response.arrayBuffer()
    return response.ok
  } catch {
    return false
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForCollector(
  options: Required<
    Pick<StartDockerCollectorOptions, 'pollIntervalMs' | 'startupTimeoutMs'>
  > & {
    url: string
    containerId: string
    runner: DockerRunner
    probe: (url: string) => Promise<boolean>
  },
): Promise<void> {
  const deadline = Date.now() + options.startupTimeoutMs
  while (Date.now() < deadline) {
    if (await options.probe(options.url)) return
    const state = await options.runner.run(
      ['inspect', '--format', '{{.State.Running}} {{.State.Status}}', options.containerId],
      { timeoutMs: 5_000 },
    )
    if (state.code !== 0) {
      throw new Error('The StackNext container disappeared before becoming healthy')
    }
    const [running = '', status = 'unknown'] = state.stdout.trim().split(/\s+/)
    if (running !== 'true') {
      throw new Error(`The StackNext container stopped during startup (${status})`)
    }
    await delay(options.pollIntervalMs)
  }
  throw new Error(
    `StackNext collector did not become healthy within ${options.startupTimeoutMs}ms`,
  )
}

async function readLogs(runner: DockerRunner, containerId: string): Promise<string> {
  const result = await runner.run(['logs', '--tail', '100', containerId], {
    timeoutMs: 10_000,
  })
  return `${result.stdout}${result.stderr}`.trim().slice(-8_000)
}

export async function startDockerCollector(
  options: StartDockerCollectorOptions,
): Promise<DockerCollectorHandle> {
  const runner = options.runner ?? dockerRunner
  const log = options.log ?? (() => undefined)
  await checkDockerAvailability(runner)

  // Fail before touching stale resources when Docker mode cannot safely mount
  // the private config as the current host user.
  const user = options.user ?? dockerUserForCurrentProcess()

  const image = options.image
    ? normalizeDockerImageReference(options.image, options.version)
    : await resolveDockerImage({ cliVersion: options.version })
  await ensureImage(runner, image, log)

  // A container left behind by an abnormal CLI exit still owns the preferred
  // port. Remove it before probing so a restart can reclaim dashboard.port.
  const containerName = dockerContainerName(options.projectDir)
  await removeManagedContainers(runner, options.projectDir)

  const portFinder = options.portFinder ?? findAvailablePort
  const hostPort =
    options.hostPort ?? (await portFinder(options.config.dashboard.port))
  if (!Number.isInteger(hostPort) || hostPort < 1024 || hostPort > 65535) {
    throw new Error(`Invalid Docker host port: ${hostPort}`)
  }
  if (!(await isPortAvailable(hostPort))) {
    throw new Error(
      `Port ${hostPort} is already in use. Stop the process using it or change dashboard.port.`,
    )
  }

  const network = await ensureDockerNetwork(
    runner,
    options.projectDir,
    options.version,
  )
  await removeDockerConfig(options.projectDir)
  const config: DockerCollectorConfig = {
    version: 1,
    token: options.token,
    projectName: options.projectName,
    internalPort: DOCKER_INTERNAL_PORT,
    publicPort: hostPort,
    projectDir: '/data',
    config: options.config,
    nextOtelVerbose: options.nextOtelVerbose,
  }
  const parsed = dockerCollectorConfigSchema.parse(config)
  await writeDockerConfig(options.projectDir, parsed)

  const args = buildDockerRunArgs({
    image,
    name: containerName,
    network,
    projectDir: options.projectDir,
    hostPort,
    version: options.version,
    ...(user ? { user } : {}),
  })
  const started = await runner.run(args, { timeoutMs: 30_000 })
  if (started.code !== 0) {
    // A failed `docker run` can still leave a container behind on some Docker
    // versions. Keep the config when cleanup fails so the container can still
    // read it and `stacknext stop` can retry.
    let cleanupError: string | null = null
    try {
      await removeOwnedContainer(runner, options.projectDir, containerName)
      await removeDockerConfig(options.projectDir)
      await removeManagedNetworks(runner, options.projectDir)
    } catch (error) {
      cleanupError = error instanceof Error ? error.message : String(error)
    }
    throw new Error(
      `Could not start the StackNext container: ${dockerResultMessage(started)}${
        cleanupError ? `\nCleanup also failed: ${cleanupError}` : ''
      }`,
    )
  }
  const containerId = lines(started.stdout).at(-1) ?? ''
  if (!/^[0-9a-f]{12,64}$/i.test(containerId)) {
    let cleanupError: string | null = null
    try {
      await removeOwnedContainer(runner, options.projectDir, containerName)
      await removeDockerConfig(options.projectDir)
      await removeManagedNetworks(runner, options.projectDir)
    } catch (error) {
      cleanupError = error instanceof Error ? error.message : String(error)
    }
    throw new Error(
      `Docker did not return a container id (output: ${started.stdout.trim().slice(0, 200)})${
        cleanupError ? `\nCleanup also failed: ${cleanupError}` : ''
      }`,
    )
  }

  const url = `http://127.0.0.1:${hostPort}`
  let closePromise: Promise<void> | null = null
  const close = (): Promise<void> => {
    if (!closePromise) {
      closePromise = (async () => {
        await runner.run(['stop', '--time', '5', containerId], {
          timeoutMs: 20_000,
        })
        await removeContainer(runner, containerId)
        await removeDockerConfig(options.projectDir)
        await removeManagedNetworks(runner, options.projectDir)
      })().catch((error: unknown) => {
        // Allow a later stop/cleanup attempt to retry after a transient
        // Docker failure instead of caching the rejected promise.
        closePromise = null
        throw error
      })
    }
    return closePromise
  }

  try {
    await waitForCollector({
      url,
      containerId,
      runner,
      probe: options.probe ?? probeCollector,
      startupTimeoutMs: options.startupTimeoutMs ?? 30_000,
      pollIntervalMs: options.pollIntervalMs ?? 250,
    })
  } catch (error) {
    const logs = await readLogs(runner, containerId)
    let cleanupError: string | null = null
    try {
      await close()
    } catch (closeError) {
      cleanupError =
        closeError instanceof Error ? closeError.message : String(closeError)
    }
    const suffix = logs ? `\nContainer logs:\n${logs}` : ''
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}${suffix}${
        cleanupError ? `\nCleanup also failed: ${cleanupError}` : ''
      }`,
    )
  }

  return {
    port: hostPort,
    url,
    token: options.token,
    containerId,
    containerName,
    image,
    close,
  }
}

export async function stopDockerCollector(
  projectDir: string,
  options: StopDockerOptions = {},
): Promise<{ removed: string[] }> {
  const runner = options.runner ?? dockerRunner
  const removed: string[] = []
  if (options.containerId) {
    if (
      await removeOwnedContainer(runner, projectDir, options.containerId)
    ) {
      removed.push(options.containerId)
    }
  }
  if (removed.length === 0) {
    removed.push(...(await removeManagedContainers(runner, projectDir)))
  }
  await removeManagedNetworks(runner, projectDir)
  await removeDockerConfig(projectDir)
  return { removed }
}

export type DockerContainerStatus = 'running' | 'stopped' | 'unknown'

/**
 * Distinguishes a confirmed stopped container from a failed inspect. Callers
 * must not delete runtime state when Docker itself is unavailable or a command
 * timed out.
 */
export async function dockerContainerStatus(
  containerId: string,
  runner: DockerRunner = dockerRunner,
): Promise<DockerContainerStatus> {
  const result = await runner.run(
    ['inspect', '--format', '{{.State.Running}}', containerId],
    { timeoutMs: 10_000 },
  )
  if (result.code !== 0) {
    const detail = `${result.stderr}\n${result.stdout}`.toLowerCase()
    if (
      detail.includes('no such container') ||
      detail.includes('no such object') ||
      detail.includes('not found')
    ) {
      return 'stopped'
    }
    return 'unknown'
  }
  return result.stdout.trim() === 'true' ? 'running' : 'stopped'
}

/**
 * Last-resort cleanup for the process `exit` hook. It verifies the managed
 * labels first and never removes an unrelated container.
 */
export function removeDockerContainerSync(
  projectDir: string,
  containerId: string,
): boolean {
  const labels = spawnSync(
    'docker',
    [
      'inspect',
      '--format',
      `{{index .Config.Labels "${MANAGED_LABEL}"}}|{{index .Config.Labels "${PROJECT_LABEL}"}}`,
      containerId,
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 10_000 },
  )
  if (labels.status !== 0) {
    const detail = `${labels.stderr}${labels.stdout}`.toLowerCase()
    return (
      detail.includes('no such container') ||
      detail.includes('no such object') ||
      detail.includes('not found')
    )
  }
  const [managed = '', project = ''] = labels.stdout.trim().split('|')
  if (managed !== 'true' || project !== projectDockerKey(projectDir)) {
    return false
  }
  const removed = spawnSync('docker', ['rm', '--force', containerId], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20_000,
  })
  return removed.status === 0
}

export function removeDockerConfigSync(projectDir: string): void {
  try {
    rmSync(path.dirname(dockerConfigPath(projectDir)), {
      recursive: true,
      force: true,
    })
  } catch {
    // Best effort during process exit.
  }
}

/**
 * Last-resort network cleanup for the process `exit` hook. It verifies the
 * managed labels first and never removes an unrelated network.
 */
export function removeDockerNetworkSync(projectDir: string): boolean {
  const name = dockerNetworkName(projectDir)
  const labels = spawnSync(
    'docker',
    [
      'network',
      'inspect',
      '--format',
      `{{index .Labels "${MANAGED_LABEL}"}}|{{index .Labels "${PROJECT_LABEL}"}}`,
      name,
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 10_000 },
  )
  if (labels.status !== 0) return false
  const [managed = '', project = ''] = labels.stdout.trim().split('|')
  if (managed !== 'true' || project !== projectDockerKey(projectDir)) {
    return false
  }
  const removed = spawnSync('docker', ['network', 'rm', name], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20_000,
  })
  return removed.status === 0
}
