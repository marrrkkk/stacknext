import type { SampleSubmission, ScenarioIdentity } from '@stacknext/regression'

export interface CaptureConfig {
  runId: string
  collectorUrl: string
  token: string
  settleMs: number
  timeoutMs: number
}

export class CaptureTransportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CaptureTransportError'
  }
}

function loopbackHost(hostname: string): boolean {
  return (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '[::1]' ||
    hostname === '::1'
  )
}

function positiveNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

/**
 * Resolves capture state from the environment. Nothing is captured unless the
 * capture command explicitly started a test run.
 */
export function resolveCaptureConfig(
  env: NodeJS.ProcessEnv = process.env,
): CaptureConfig | null {
  const runId = env.STACKNEXT_TEST_RUN_ID?.trim()
  if (!runId) return null
  if (!/^run-[0-9a-f]{16}$/.test(runId)) {
    throw new CaptureTransportError('STACKNEXT_TEST_RUN_ID is not a valid StackNext run id')
  }
  const collectorUrl = env.STACKNEXT_COLLECTOR_URL?.trim() ?? ''
  const token = env.STACKNEXT_TOKEN?.trim() ?? ''
  if (!collectorUrl || !token) {
    throw new CaptureTransportError(
      'STACKNEXT_COLLECTOR_URL and STACKNEXT_TOKEN are required when capture is active',
    )
  }
  let url: URL
  try {
    url = new URL(collectorUrl)
  } catch {
    throw new CaptureTransportError('STACKNEXT_COLLECTOR_URL is not a valid URL')
  }
  if (url.protocol !== 'http:' || !loopbackHost(url.hostname)) {
    throw new CaptureTransportError('StackNext capture only connects to a loopback HTTP collector')
  }
  return {
    runId,
    collectorUrl: url.origin,
    token,
    settleMs: positiveNumber(env.STACKNEXT_CAPTURE_SETTLE_MS, 500),
    timeoutMs: positiveNumber(env.STACKNEXT_CAPTURE_TIMEOUT_MS, 5_000),
  }
}

async function request(
  config: CaptureConfig,
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${config.collectorUrl}${pathname}`, {
      ...init,
      headers: {
        authorization: `Bearer ${config.token}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(Math.max(config.timeoutMs, 1_000)),
    })
  } catch (error) {
    throw new CaptureTransportError(
      `Could not reach the StackNext collector at ${config.collectorUrl}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
  return response
}

export interface TraceProbe {
  found: boolean
  spanCount: number
}

/** Checks whether a correlated trace has reached the collector store yet. */
export async function probeTrace(
  config: CaptureConfig,
  traceId: string,
): Promise<TraceProbe> {
  const response = await request(config, `/api/traces/${traceId}`)
  if (response.status === 404) return { found: false, spanCount: 0 }
  if (!response.ok) {
    throw new CaptureTransportError(
      `Collector rejected trace lookup with HTTP ${response.status}`,
    )
  }
  const payload = (await response.json()) as { spans?: unknown }
  return {
    found: true,
    spanCount: Array.isArray(payload.spans) ? payload.spans.length : 0,
  }
}

export async function submitSample(
  config: CaptureConfig,
  scenario: ScenarioIdentity,
  sample: SampleSubmission,
): Promise<void> {
  const response = await request(
    config,
    `/api/test-runs/${config.runId}/samples`,
    {
      method: 'POST',
      body: JSON.stringify({ scenario, sample }),
    },
  )
  if (!response.ok) {
    let detail = ''
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload.error) detail = `: ${payload.error}`
    } catch {
      // Keep the status-only message.
    }
    throw new CaptureTransportError(
      `Collector rejected the captured sample with HTTP ${response.status}${detail}`,
    )
  }
}
