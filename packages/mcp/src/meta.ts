import type { HealthResponse } from '@stacknext/core'
import type { StackNextApiClient } from './client.js'
import type { ToolMeta } from './schemas.js'

export function isoTime(value: number | null | undefined): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value).toISOString()
    : null
}

export function withoutStack<T extends { stack?: string }>(
  item: T,
): Omit<T, 'stack'> {
  const { stack: _stack, ...rest } = item
  return rest
}

export interface CoverageMeta {
  observed: number
  active: number
  configured: number
  notObserved: number
  unsupported: number
  unknown: number
  requestsInSample: number
}

export interface MetaOptions {
  tool: string
  health: HealthResponse | null
  project?: string | null
  firstEventTime?: number | null
  lastEventTime?: number | null
  found: number
  returned: number
  limit?: number
  offset?: number
  identifiers?: Record<string, string>
  reasons?: string[]
  notes?: string[]
  coverage?: CoverageMeta
  now?: number
}

function latestConnection(
  health: HealthResponse | null,
): HealthResponse['connections'][number] | null {
  const connections = health?.connections ?? []
  return (
    [...connections].sort((a, b) => b.lastSeen - a.lastSeen)[0] ?? null
  )
}

/**
 * Builds the additive response metadata shared by every tool. It is deliberately
 * small: enough for an agent to know whether the evidence is complete and how to
 * continue, without duplicating the payload.
 */
export function buildMeta(options: MetaOptions): ToolMeta {
  const reasons = [...(options.reasons ?? [])]
  const notes = [...(options.notes ?? [])]
  const health = options.health
  const connection = latestConnection(health)
  const hasMore =
    options.limit !== undefined && options.offset !== undefined
      ? options.offset + options.returned < options.found
      : undefined
  const nextOffset =
    hasMore === undefined
      ? undefined
      : hasMore
        ? (options.offset ?? 0) + options.returned
        : null

  if (hasMore) {
    reasons.push(
      `Results are paginated: ${options.returned} of ${options.found} matching records were returned. Request offset=${nextOffset} for the next page.`,
    )
  }

  if (!health) {
    reasons.push(
      'Collector health is unavailable, so connection and instrumentation state are unknown.',
    )
  } else {
    if (!health.connected) {
      reasons.push(
        'No Next.js app is currently connected to the collector. Start the app through "stacknext dev" and make a request.',
      )
    }
    const storeDropped =
      (health.store?.dropped.capacity ?? 0) +
      (health.store?.dropped.retention ?? 0)
    if (storeDropped > 0) {
      reasons.push(
        `The collector dropped ${storeDropped} record(s) because of capacity or retention limits.`,
      )
    }
    const ingestDropped =
      (health.server?.droppedPayload ?? 0) +
      (health.server?.droppedMalformed ?? 0)
    if (ingestDropped > 0) {
      reasons.push(
        `The collector rejected ${ingestDropped} ingest payload(s) as oversized or malformed.`,
      )
    }
    const exporterDropped =
      (health.exporter?.droppedSpans ?? 0) +
      (health.exporter?.droppedEvents ?? 0)
    if (exporterDropped > 0) {
      reasons.push(
        `The app exporter dropped ${exporterDropped} span(s) or event(s) before delivery.`,
      )
    }
  }

  if (options.found === 0) {
    reasons.push(
      'No matching telemetry is present in the collector\'s current retention window.',
    )
  }

  return {
    tool: options.tool,
    generatedAt: new Date(options.now ?? Date.now()).toISOString(),
    project: options.project ?? health?.projectName ?? null,
    timeRange: {
      firstEventTime: isoTime(options.firstEventTime),
      lastEventTime: isoTime(options.lastEventTime),
    },
    result: {
      found: options.found,
      returned: options.returned,
      ...(options.limit !== undefined ? { limit: options.limit } : {}),
      ...(options.offset !== undefined ? { offset: options.offset } : {}),
      ...(hasMore !== undefined ? { hasMore } : {}),
      ...(nextOffset !== undefined ? { nextOffset } : {}),
    },
    connection: {
      instrumentation: health
        ? health.connected
          ? 'connected'
          : 'waiting'
        : 'unknown',
      instances: health?.connections?.length ?? 0,
      lastSeen: isoTime(connection?.lastSeen),
      sdkVersion: connection?.sdkVersion ?? null,
      collectorVersion: health?.version ?? null,
    },
    completeness: {
      complete: reasons.length === 0,
      reasons: [...new Set(reasons)],
    },
    ...(options.identifiers ? { identifiers: options.identifiers } : {}),
    ...(options.coverage ? { coverage: options.coverage } : {}),
    notes: [...new Set(notes)],
  }
}

/**
 * Short-lived health cache. List/detail responses use it to report connection
 * state without adding a collector round trip to every tool call.
 */
export class HealthCache {
  private value: HealthResponse | null = null
  private expiresAt = 0

  constructor(
    private readonly client: StackNextApiClient,
    private readonly ttlMs = 5_000,
    private readonly failureTtlMs = 1_000,
  ) {}

  seed(health: HealthResponse): void {
    this.value = health
    this.expiresAt = Date.now() + this.ttlMs
  }

  async get(): Promise<HealthResponse | null> {
    if (Date.now() < this.expiresAt) return this.value
    try {
      this.value = await this.client.health()
      this.expiresAt = Date.now() + this.ttlMs
      return this.value
    } catch {
      this.value = null
      this.expiresAt = Date.now() + this.failureTtlMs
      return null
    }
  }
}
