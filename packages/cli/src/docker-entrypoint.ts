#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { resolveDashboardDir, startCollector } from './collector/server.js'
import { dockerCollectorConfigSchema } from './docker/protocol.js'
import { CLI_VERSION } from './version.js'

function fail(message: string): never {
  console.error(`StackNext Docker collector: ${message}`)
  process.exit(1)
}

async function main(): Promise<void> {
  if (process.env.STACKNEXT_DOCKER_CONTAINER !== '1') {
    fail('this entrypoint is only for the StackNext Docker image')
  }
  const configFile = process.env.STACKNEXT_CONFIG_FILE
  if (!configFile) fail('STACKNEXT_CONFIG_FILE is not set')

  let raw: unknown
  try {
    raw = JSON.parse(await readFile(configFile, 'utf8')) as unknown
  } catch (error) {
    fail(
      `could not read the mounted runtime config: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
  const parsed = dockerCollectorConfigSchema.safeParse(raw)
  if (!parsed.success) {
    fail(
      `invalid mounted runtime config: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')}`,
    )
  }
  const payload = parsed.data
  const dashboardDir = await resolveDashboardDir().catch((error: unknown) => {
    fail(
      `dashboard assets are missing from the image: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  })

  const collector = await startCollector({
    port: payload.internalPort,
    host: '0.0.0.0',
    allowDockerBind: true,
    publicPort: payload.publicPort,
    autoPort: false,
    token: payload.token,
    projectName: payload.projectName,
    config: payload.config,
    dashboardDir,
    projectDir: payload.projectDir,
    version: CLI_VERSION,
    nextOtelVerbose: payload.nextOtelVerbose,
    log: (message) => console.error(`stacknext: ${message}`),
  })

  console.error(
    `StackNext collector ready on 127.0.0.1:${payload.publicPort} (container ${payload.internalPort})`,
  )

  let closing = false
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (closing) return
    closing = true
    console.error(`StackNext collector stopping (${signal})`)
    await collector.close().catch(() => undefined)
    process.exit(0)
  }
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM')
  })
  process.once('SIGINT', () => {
    void shutdown('SIGINT')
  })
}

await main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})
