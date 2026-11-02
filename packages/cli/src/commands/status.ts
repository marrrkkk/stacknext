import type { Command } from 'commander'
import type { HealthResponse } from '@stacknext/core'
import { collectorJson } from '../http.js'
import { style } from '../output.js'
import { formatDuration, formatRelativeTime } from '../output.js'
import { requireRunningState } from '../session.js'

export interface StatusOptions {
  json?: boolean
}

export async function runStatus(
  options: StatusOptions,
  cwd = process.cwd(),
): Promise<number> {
  const state = await requireRunningState(cwd)
  let health: HealthResponse
  try {
    health = await collectorJson<HealthResponse>(
      state.collectorUrl,
      '/api/health',
      state.token,
    )
  } catch (error) {
    if (!options.json) {
      console.error(
        `${style.red('Collector unreachable')} — ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    return 1
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          runtime: { ...state, token: '[redacted]' },
          health,
        },
        null,
        2,
      ),
    )
    return 0
  }

  const connected = health.connections.filter((connection) => connection.connected)
  console.log(`${style.bold('StackNext')} ${style.dim(`v${health.version}`)} — ${health.projectName}`)
  console.log(`Dashboard   ${style.cyan(health.dashboardUrl)}`)
  console.log(
    `Collector   ${state.collectorUrl} ${style.dim(`(pid ${state.pid}, up ${formatDuration(health.uptimeMs)})`)}`,
  )
  if (connected.length === 0) {
    console.log(
      `Instrumentation ${style.yellow('waiting')} ${style.dim('— no app heartbeat received yet')}`,
    )
  } else {
    for (const connection of connected) {
      console.log(
        `Instrumentation ${style.green('connected')} — ${connection.serviceName}` +
          (connection.nextVersion ? ` (Next.js ${connection.nextVersion})` : '') +
          style.dim(` last seen ${formatRelativeTime(connection.lastSeen, health.time)}`),
      )
    }
  }
  console.log(
    `Requests    ${health.counts.requests} total, ${health.counts.failedRequests} failed, ${health.counts.slowRequests} slow`,
  )
  console.log(
    `Telemetry   ${health.counts.spans} spans, ${health.counts.errors} errors, ${health.counts.databaseQueries} database queries`,
  )
  const verbose = health.instrumentation.nextOtelVerbose
  console.log(
    `Next.js spans ${
      verbose.enabled
        ? style.cyan(`verbose (${verbose.source})`)
        : verbose.source === 'unknown'
          ? style.yellow('NEXT_OTEL_VERBOSE has an unrecognized value')
          : style.dim(`standard (${verbose.source})`)
    }`,
  )
  const drops =
    health.store.dropped.capacity +
    health.store.dropped.retention +
    health.server.droppedMalformed +
    health.server.droppedPayload +
    health.exporter.droppedSpans +
    health.exporter.droppedEvents
  console.log(
    `Drops       ${drops} total` +
      (health.exporter.lastError
        ? ` ${style.yellow(`— last exporter error: ${health.exporter.lastError}`)}`
        : ''),
  )
  console.log(
    style.dim(
      `Limits: ${health.store.limits.maxSpans} spans / ${formatDuration(health.store.limits.retentionMs)} retention`,
    ),
  )
  return 0
}

export function registerStatusCommand(program: Command, cwd: string): void {
  program
    .command('status')
    .description('Show collector and instrumentation status')
    .option('--json', 'print machine-readable JSON')
    .action(async (options: StatusOptions) => {
      const code = await runStatus(options, cwd)
      if (code !== 0) process.exitCode = code
    })
}
