import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseStackNextConfig, stackNextConfigSchema } from '@stacknext/core'
import { resolveRuntimeMode } from '../src/commands/dev.js'
import { runStop } from '../src/commands/stop.js'
import {
  DockerUnavailableError,
  buildDockerRunArgs,
  checkDockerAvailability,
  dockerConfigPath,
  dockerContainerName,
  dockerContainerStatus,
  findAvailablePort,
  isPortAvailable,
  projectDockerKey,
  removeManagedContainers,
  startDockerCollector,
  stopDockerCollector,
} from '../src/docker/runtime.js'
import {
  normalizeDockerImageReference,
  repositoryOwnerFromUrl,
  resolveDockerImage,
  validateDockerImageReference,
} from '../src/docker/image.js'
import {
  acquireRuntimeLock,
  runtimeStatePath,
  runtimeStateSchema,
  writeRuntimeState,
} from '../src/runtime.js'
import type { DockerResult, DockerRunner } from '../src/docker/runner.js'

const TEMP_DIRS: string[] = []

async function tempProject(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'stacknext-docker-test-'))
  TEMP_DIRS.push(dir)
  return dir
}

async function nextProject(): Promise<string> {
  const dir = await tempProject()
  await mkdir(path.join(dir, 'app'), { recursive: true })
  await writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'docker-test-app', dependencies: { next: '16.4.3' } }),
  )
  return dir
}

afterEach(async () => {
  for (const dir of TEMP_DIRS.splice(0)) {
    await rm(dir, { recursive: true, force: true })
  }
})

function result(overrides: Partial<DockerResult> = {}): DockerResult {
  return {
    code: 0,
    signal: null,
    stdout: '',
    stderr: '',
    ...overrides,
  }
}

class FakeDocker implements DockerRunner {
  readonly calls: string[][] = []
  readonly labels = new Map<string, { managed: string; project: string }>()
  readonly containers: string[] = []
  failRun = false
  failInfo = false
  failPull = false
  leaveFailedContainer = false

  async run(args: string[], _options?: unknown): Promise<DockerResult> {
    this.calls.push(args)
    if (args[0] === '--version') return result({ stdout: 'Docker version 27.0.0\n' })
    if (args[0] === 'info') {
      return this.failInfo
        ? result({ code: 1, stderr: 'Cannot connect to the Docker daemon' })
        : result({ stdout: '27.0.0\n' })
    }
    if (args[0] === 'image' && args[1] === 'inspect') return result()
    if (args[0] === 'pull') {
      return this.failPull ? result({ code: 1, stderr: 'pull failed' }) : result()
    }
    if (args[0] === 'ps') {
      return result({ stdout: `${this.containers.join('\n')}\n` })
    }
    if (args[0] === 'run') {
      if (this.failRun) {
        if (this.leaveFailedContainer) {
          const nameIndex = args.indexOf('--name')
          const name =
            nameIndex >= 0 ? (args[nameIndex + 1] ?? '') : 'a'.repeat(64)
          const projectLabel = args.find((entry) =>
            entry.startsWith('stacknext.project='),
          )
          this.containers.push(name)
          this.labels.set(name, {
            managed: 'true',
            project:
              projectLabel?.slice('stacknext.project='.length) ?? '',
          })
        }
        return result({ code: 125, stderr: 'port is already allocated' })
      }
      const id = 'a'.repeat(64)
      this.containers.push(id)
      this.labels.set(id, {
        managed: 'true',
        project: args.includes('--label')
          ? (args[args.indexOf('--label') + 1] ?? '').split('=')[1] ?? ''
          : '',
      })
      // The project label is the third label pair in buildDockerRunArgs.
      const projectLabel = args.find((entry) => entry.startsWith('stacknext.project='))
      if (projectLabel) {
        this.labels.set(id, {
          managed: 'true',
          project: projectLabel.slice('stacknext.project='.length),
        })
      }
      return result({ stdout: `${id}\n` })
    }
    if (args[0] === 'inspect') {
      const id = args.at(-1) ?? ''
      if (args.some((entry) => entry.includes('.State.Running'))) {
        return this.containers.includes(id)
          ? result({ stdout: 'true\n' })
          : result({ code: 1, stderr: 'no such container' })
      }
      const labels = this.labels.get(id)
      return labels
        ? result({ stdout: `${labels.managed}|${labels.project}\n` })
        : result({ code: 1, stderr: 'no such container' })
    }
    if (args[0] === 'logs') return result({ stdout: 'collector log line\n' })
    if (args[0] === 'stop' || args[0] === 'rm') {
      const id = args.at(-1) ?? ''
      const index = this.containers.indexOf(id)
      if (index >= 0) this.containers.splice(index, 1)
      return result()
    }
    return result()
  }
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen({ port: 0, host: '127.0.0.1' }, () => {
      const address = server.address()
      server.close(() => {
        if (typeof address === 'object' && address) resolve(address.port)
        else reject(new Error('no port'))
      })
    })
  })
}

describe('runtime selection', () => {
  it('defaults to native and gives the CLI argument precedence', () => {
    expect(resolveRuntimeMode(undefined, undefined)).toBe('native')
    expect(resolveRuntimeMode(undefined, 'docker')).toBe('docker')
    expect(resolveRuntimeMode('native', 'docker')).toBe('native')
    expect(resolveRuntimeMode('docker', 'native')).toBe('docker')
    expect(() => resolveRuntimeMode('container', undefined)).toThrow(/Invalid --runtime/)
  })
})

describe('runtime configuration', () => {
  it('keeps old configurations valid and defaults to native', () => {
    expect(parseStackNextConfig({}).runtime.mode).toBe('native')
    expect(parseStackNextConfig({ runtime: { mode: 'docker' } }).runtime.mode).toBe(
      'docker',
    )
    expect(stackNextConfigSchema.safeParse({ runtime: { mode: 'container' } }).success).toBe(
      false,
    )
  })
})

describe('runtime state', () => {
  it('parses pre-Docker state and the new Docker metadata', () => {
    const old = {
      version: 1,
      pid: 10,
      startedAt: 1,
      projectDir: '/tmp/app',
      projectName: 'app',
      dashboardUrl: 'http://127.0.0.1:4400',
      collectorUrl: 'http://127.0.0.1:4400',
      port: 4400,
      token: 'a'.repeat(32),
    }
    expect(runtimeStateSchema.parse(old)).toEqual(old)
    const docker = runtimeStateSchema.parse({
      ...old,
      runtime: {
        mode: 'docker',
        containerId: 'b'.repeat(64),
        containerName: 'stacknext-test',
        image: 'ghcr.io/acme/stacknext:0.7.0',
        hostPort: 4401,
      },
    })
    expect(docker.runtime?.mode).toBe('docker')
    expect(docker.runtime?.hostPort).toBe(4401)
  })
})

describe('runtime lock', () => {
  it('serializes startup and reclaims a stale lock', async () => {
    const projectDir = await tempProject()
    const first = await acquireRuntimeLock(projectDir)
    await expect(acquireRuntimeLock(projectDir)).rejects.toThrow(
      /already starting or running/,
    )
    await first.release()

    const stale = path.join(projectDir, '.stacknext', 'dev.lock')
    await writeFile(
      stale,
      `${JSON.stringify({ pid: 999_999, startedAt: 1, token: 'stale' })}\n`,
    )
    const second = await acquireRuntimeLock(projectDir)
    await second.release()
  })
})

describe('stacknext stop', () => {
  it('never removes legacy native runtime state while its process is alive', async () => {
    const projectDir = await nextProject()
    await writeRuntimeState(projectDir, {
      version: 1,
      pid: process.pid,
      startedAt: Date.now(),
      projectDir,
      projectName: 'docker-test-app',
      dashboardUrl: 'http://127.0.0.1:4400',
      collectorUrl: 'http://127.0.0.1:4400',
      port: 4400,
      token: 'a'.repeat(32),
    })

    expect(await runStop({ json: true }, projectDir)).toBe(1)
    expect(await readFile(runtimeStatePath(projectDir), 'utf8')).toContain('token')
  })

  it('refuses to stop a live Docker runtime', async () => {
    const projectDir = await nextProject()
    await writeRuntimeState(projectDir, {
      version: 1,
      pid: process.pid,
      startedAt: Date.now(),
      projectDir,
      projectName: 'docker-test-app',
      dashboardUrl: 'http://127.0.0.1:4400',
      collectorUrl: 'http://127.0.0.1:4400',
      port: 4400,
      token: 'a'.repeat(32),
      runtime: {
        mode: 'docker',
        containerId: 'b'.repeat(64),
        containerName: 'stacknext-test',
        image: 'ghcr.io/acme/stacknext:0.7.0',
        hostPort: 4400,
      },
    })

    expect(await runStop({ json: true }, projectDir)).toBe(1)
    expect(await readFile(runtimeStatePath(projectDir), 'utf8')).toContain('token')
  })

  it('refuses to stop while another process is starting', async () => {
    const projectDir = await nextProject()
    const lock = await acquireRuntimeLock(projectDir)
    expect(await runStop({ json: true }, projectDir)).toBe(1)
    expect(await readFile(lock.file, 'utf8')).toContain('pid')
    await lock.release()
  })

  it('removes a stopped Docker runtime and its container', async () => {
    const projectDir = await nextProject()
    const docker = new FakeDocker()
    const id = 'c'.repeat(64)
    docker.containers.push(id)
    docker.labels.set(id, {
      managed: 'true',
      project: projectDockerKey(projectDir),
    })
    await writeRuntimeState(projectDir, {
      version: 1,
      pid: 999_999,
      startedAt: Date.now(),
      projectDir,
      projectName: 'docker-test-app',
      dashboardUrl: 'http://127.0.0.1:4400',
      collectorUrl: 'http://127.0.0.1:4400',
      port: 4400,
      token: 'a'.repeat(32),
      runtime: {
        mode: 'docker',
        containerId: id,
        containerName: 'stacknext-test',
        image: 'ghcr.io/acme/stacknext:0.7.0',
        hostPort: 4400,
      },
    })

    expect(await runStop({ json: true, runner: docker }, projectDir)).toBe(0)
    expect(docker.containers).not.toContain(id)
    await expect(readFile(runtimeStatePath(projectDir), 'utf8')).rejects.toThrow()
  })

  it('clears state without failing when Docker is unavailable', async () => {
    const projectDir = await nextProject()
    const docker = new FakeDocker()
    docker.run = async (args) =>
      args[0] === '--version'
        ? result({
            code: null,
            error: Object.assign(new Error('spawn docker ENOENT'), {
              code: 'ENOENT',
            }),
          })
        : result({ code: 1, stderr: 'Docker is unavailable' })

    expect(await runStop({ json: true, runner: docker }, projectDir)).toBe(0)
  })
})

describe('Docker image selection', () => {
  it('derives the image from package metadata and supports overrides', async () => {
    expect(repositoryOwnerFromUrl('git+https://github.com/acme/stacknext.git')).toBe(
      'acme',
    )
    expect(
      await resolveDockerImage({
        cliVersion: '0.7.0',
        repositoryUrl: 'git+https://github.com/acme/stacknext.git',
        env: {},
      }),
    ).toBe('ghcr.io/acme/stacknext:0.7.0')
    expect(
      await resolveDockerImage({
        cliVersion: '0.7.0',
        repositoryUrl: null,
        env: { STACKNEXT_DOCKER_IMAGE: 'ghcr.io/dev/stacknext:dev' },
      }),
    ).toBe('ghcr.io/dev/stacknext:dev')
    expect(
      await resolveDockerImage({
        cliVersion: '0.7.0',
        repositoryUrl: null,
        env: { STACKNEXT_DOCKER_IMAGE: 'ghcr.io/dev/stacknext' },
      }),
    ).toBe('ghcr.io/dev/stacknext:0.7.0')
    expect(
      await resolveDockerImage({
        cliVersion: '0.7.0',
        repositoryUrl: null,
        env: { STACKNEXT_DOCKER_REPOSITORY: 'acme/stacknext' },
      }),
    ).toBe('ghcr.io/acme/stacknext:0.7.0')
  })

  it('rejects unsafe image references', () => {
    expect(() => validateDockerImageReference('--privileged')).toThrow()
    expect(() => validateDockerImageReference('ghcr.io/acme/stacknext;rm -rf /')).toThrow()
    expect(normalizeDockerImageReference('ghcr.io/acme/stacknext', '1.2.3')).toBe(
      'ghcr.io/acme/stacknext:1.2.3',
    )
  })
})

describe('Docker availability', () => {
  it('detects a missing CLI and a stopped daemon', async () => {
    const missing = new FakeDocker()
    missing.run = async () =>
      result({
        code: null,
        error: Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' }),
      })
    await expect(checkDockerAvailability(missing)).rejects.toBeInstanceOf(
      DockerUnavailableError,
    )

    const stopped = new FakeDocker()
    stopped.failInfo = true
    await expect(checkDockerAvailability(stopped)).rejects.toThrow(/daemon is not running/)
  })

  it('returns the daemon version when Docker is ready', async () => {
    await expect(checkDockerAvailability(new FakeDocker())).resolves.toEqual({
      version: '27.0.0',
    })
  })
})

describe('Docker container status', () => {
  it('distinguishes running, stopped and unknown states', async () => {
    const docker = new FakeDocker()
    const running = 'a'.repeat(64)
    docker.containers.push(running)
    expect(await dockerContainerStatus(running, docker)).toBe('running')
    expect(await dockerContainerStatus('b'.repeat(64), docker)).toBe('stopped')

    const unavailable = new FakeDocker()
    unavailable.run = async () =>
      result({ code: 1, stderr: 'Cannot connect to the Docker daemon' })
    expect(await dockerContainerStatus(running, unavailable)).toBe('unknown')
  })
})

describe('Docker command construction', () => {
  it('publishes only loopback and never puts the token in arguments', () => {
    const args = buildDockerRunArgs({
      image: 'ghcr.io/acme/stacknext:0.7.0',
      name: 'stacknext-test',
      projectDir: '/tmp/my app',
      hostPort: 4401,
      version: '0.7.0',
      user: '1000:1000',
    })
    expect(args).toContain('127.0.0.1:4401:4400')
    expect(args).toContain('--read-only')
    expect(args).toContain('--cap-drop')
    expect(args).toContain('ALL')
    expect(args).toContain('--security-opt')
    expect(args).toContain('no-new-privileges')
    expect(args).toContain('--user')
    expect(args).toContain('1000:1000')
    expect(args).toContain('stacknext.managed=true')
    expect(args).toContain(`stacknext.project=${projectDockerKey('/tmp/my app')}`)
    expect(args.join(' ')).not.toContain('token')
    expect(args.join(' ')).not.toContain('STACKNEXT_TOKEN')
    expect(args.at(-1)).toBe('ghcr.io/acme/stacknext:0.7.0')
    const mountIndex = args.indexOf('--mount')
    expect(mountIndex).toBeGreaterThan(-1)
    expect(args[mountIndex + 1]).toMatch(
      /^type=bind,source=.*\/\.stacknext,target=\/data\/\.stacknext,readonly$/,
    )
  })

  it('falls back to a read-only volume for a project path containing a comma', async () => {
    const projectDir = path.join(await tempProject(), 'comma,project')
    const args = buildDockerRunArgs({
      image: 'ghcr.io/acme/stacknext:0.7.0',
      name: 'stacknext-test',
      projectDir,
      hostPort: 4401,
      version: '0.7.0',
      user: '1000:1000',
    })
    const volumeIndex = args.indexOf('--volume')
    expect(volumeIndex).toBeGreaterThan(-1)
    expect(args).not.toContain('--mount')
    expect(args[volumeIndex + 1]).toMatch(
      /comma,project\/\.stacknext:\/data\/\.stacknext:ro$/,
    )
  })

  it.skipIf(process.platform === 'win32')(
    'rejects a project path containing both a comma and a colon',
    async () => {
      const projectDir = path.join(await tempProject(), 'comma,colon:project')
      expect(() =>
        buildDockerRunArgs({
          image: 'ghcr.io/acme/stacknext:0.7.0',
          name: 'stacknext-test',
          projectDir,
          hostPort: 4401,
          version: '0.7.0',
          user: '1000:1000',
        }),
      ).toThrow(/both a comma and a colon/)
    },
  )
})

describe('Docker ports', () => {
  it('detects an occupied port and finds the next one', async () => {
    const port = await freePort()
    const server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen({ port, host: '127.0.0.1' }, () => resolve())
    })
    try {
      expect(await isPortAvailable(port)).toBe(false)
      const next = await findAvailablePort(port, 3)
      expect(next).toBeGreaterThan(port)
      expect(await isPortAvailable(next)).toBe(true)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})

describe('Docker collector lifecycle', () => {
  it('starts the collector through the injectable runner and cleans up', async () => {
    const projectDir = await tempProject()
    const hostPort = await freePort()
    const docker = new FakeDocker()
    const handle = await startDockerCollector({
      projectDir,
      config: parseStackNextConfig({ dashboard: { port: hostPort } }),
      token: 'test-token-that-is-long-enough-123456',
      projectName: 'docker-test',
      version: '0.7.0',
      nextOtelVerbose: { enabled: false, source: 'disabled' },
      runner: docker,
      hostPort,
      user: '1000:1000',
      probe: async () => true,
    })
    expect(handle.url).toBe(`http://127.0.0.1:${hostPort}`)
    expect(handle.containerId).toBe('a'.repeat(64))
    const configFile = dockerConfigPath(projectDir)
    const contents = await readFile(configFile, 'utf8')
    expect(contents).toContain('test-token-that-is-long-enough-123456')
    if (process.platform !== 'win32') {
      expect((await stat(configFile)).mode & 0o777).toBe(0o600)
    }
    const runArgs = docker.calls.find((args) => args[0] === 'run') ?? []
    expect(runArgs.join(' ')).not.toContain('test-token-that-is-long-enough-123456')
    expect(runArgs).toContain('127.0.0.1:' + hostPort + ':4400')

    await handle.close()
    await expect(readFile(configFile, 'utf8')).rejects.toThrow()
    expect(docker.calls.some((args) => args[0] === 'stop')).toBe(true)
    expect(docker.calls.some((args) => args[0] === 'rm')).toBe(true)
  })

  it('removes a failed container and reports its logs', async () => {
    const projectDir = await tempProject()
    const hostPort = await freePort()
    const docker = new FakeDocker()
    await expect(
      startDockerCollector({
        projectDir,
        config: parseStackNextConfig({ dashboard: { port: hostPort } }),
        token: 'test-token-that-is-long-enough-123456',
        projectName: 'docker-test',
        version: '0.7.0',
        nextOtelVerbose: { enabled: false, source: 'disabled' },
        runner: docker,
        hostPort,
        user: '1000:1000',
        probe: async () => false,
        startupTimeoutMs: 40,
        pollIntervalMs: 5,
      }),
    ).rejects.toThrow(/collector log line/)
    expect(docker.calls.some((args) => args[0] === 'logs')).toBe(true)
    expect(docker.calls.some((args) => args[0] === 'rm')).toBe(true)
    await expect(readFile(dockerConfigPath(projectDir), 'utf8')).rejects.toThrow()
  })

  it('does not remove an unrelated container that owns the deterministic name', async () => {
    const projectDir = await tempProject()
    const hostPort = await freePort()
    const docker = new FakeDocker()
    const name = dockerContainerName(projectDir)
    docker.containers.push(name)
    docker.labels.set(name, { managed: 'false', project: 'someone-else' })
    docker.failRun = true
    await expect(
      startDockerCollector({
        projectDir,
        config: parseStackNextConfig({ dashboard: { port: hostPort } }),
        token: 'test-token-that-is-long-enough-123456',
        projectName: 'docker-test',
        version: '0.7.0',
        nextOtelVerbose: { enabled: false, source: 'disabled' },
        runner: docker,
        hostPort,
        user: '1000:1000',
        probe: async () => true,
      }),
    ).rejects.toThrow(/Could not start the StackNext container/)
    expect(docker.containers).toContain(name)
    await expect(readFile(dockerConfigPath(projectDir), 'utf8')).rejects.toThrow()
  })

  it('removes a stale project container before starting a new one', async () => {
    const projectDir = await tempProject()
    const hostPort = await freePort()
    const docker = new FakeDocker()
    const stale = 'd'.repeat(64)
    docker.containers.push(stale)
    docker.labels.set(stale, {
      managed: 'true',
      project: projectDockerKey(projectDir),
    })
    const handle = await startDockerCollector({
      projectDir,
      config: parseStackNextConfig({ dashboard: { port: hostPort } }),
      token: 'test-token-that-is-long-enough-123456',
      projectName: 'docker-test',
      version: '0.7.0',
      nextOtelVerbose: { enabled: false, source: 'disabled' },
      runner: docker,
      hostPort,
      user: '1000:1000',
      probe: async () => true,
    })
    const removeIndex = docker.calls.findIndex(
      (args) => args[0] === 'rm' && args.includes(stale),
    )
    const runIndex = docker.calls.findIndex((args) => args[0] === 'run')
    expect(removeIndex).toBeGreaterThanOrEqual(0)
    expect(runIndex).toBeGreaterThan(removeIndex)
    expect(docker.containers).toEqual([handle.containerId])
    await handle.close()
  })

  it('removes the private config when docker run fails', async () => {
    const projectDir = await tempProject()
    const hostPort = await freePort()
    const docker = new FakeDocker()
    docker.failRun = true
    docker.leaveFailedContainer = true
    await expect(
      startDockerCollector({
        projectDir,
        config: parseStackNextConfig({ dashboard: { port: hostPort } }),
        token: 'test-token-that-is-long-enough-123456',
        projectName: 'docker-test',
        version: '0.7.0',
        nextOtelVerbose: { enabled: false, source: 'disabled' },
        runner: docker,
        hostPort,
        user: '1000:1000',
        probe: async () => true,
      }),
    ).rejects.toThrow(/Could not start the StackNext container/)
    await expect(readFile(dockerConfigPath(projectDir), 'utf8')).rejects.toThrow()
    expect(docker.calls.some((args) => args[0] === 'rm')).toBe(true)
  })

  it('removes only containers carrying this project label', async () => {
    const projectDir = await tempProject()
    const docker = new FakeDocker()
    const managed = 'b'.repeat(64)
    const unrelated = 'c'.repeat(64)
    docker.containers.push(managed, unrelated)
    docker.labels.set(managed, {
      managed: 'true',
      project: projectDockerKey(projectDir),
    })
    docker.labels.set(unrelated, {
      managed: 'true',
      project: 'someone-else',
    })
    const removed = await removeManagedContainers(docker, projectDir)
    expect(removed).toEqual([managed])
    expect(docker.containers).toEqual([unrelated])
    const stopped = await stopDockerCollector(projectDir, { runner: docker })
    expect(stopped.removed).toEqual([])
    expect(docker.containers).toEqual([unrelated])
  })
})
