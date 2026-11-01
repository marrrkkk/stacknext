import {
  ProxyTracerProvider,
  trace,
  type TracerProvider,
} from '@opentelemetry/api'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'
import {
  NEXTSCOPE_SDK_VERSION,
} from '@nextscope/core'
import {
  getNextScopeTransport,
  type NextScopeTransport,
  type NextScopeTransportOptions,
} from '@nextscope/core/transport'
import { NextScopeSpanExporter } from './exporter.js'

export interface NextScopeRegisterOptions {
  /** Overrides environment-based transport configuration. */
  transport?: NextScopeTransportOptions
  /** Collector URL; used to filter self-instrumentation requests. */
  collectorUrl?: string
  serviceName?: string
  projectName?: string
  nextVersion?: string
  /** Set to false to drop Next.js fetch spans. Defaults to true. */
  captureFetch?: boolean
  /** Set to false to keep NextScope loaded but inactive. */
  enabled?: boolean
}

export interface NextScopeRegistration {
  provider: NodeTracerProvider
  transport: NextScopeTransport
  exporter: NextScopeSpanExporter
  serviceName: string
  registeredAt: number
}

interface RegistrationGlobalState {
  __nextscopeRegistration?: NextScopeRegistration
  __nextscopeBeforeExit?: () => void
}

function globalState(): RegistrationGlobalState {
  return globalThis as unknown as RegistrationGlobalState
}

function debugLog(message: string): void {
  if (process.env.NEXTSCOPE_DEBUG === '1') {
    console.warn(`[nextscope] ${message}`)
  }
}

/**
 * Returns the provider currently serving the OTel API, or null when only the
 * API's no-op proxy is installed. `trace.getTracerProvider()` returns the proxy
 * even after registration, so the delegate must be inspected.
 */
function registeredProvider(): TracerProvider | null {
  const provider = trace.getTracerProvider()
  if (provider instanceof ProxyTracerProvider) {
    const delegate = provider.getDelegate()
    return delegate.constructor?.name === 'NoopTracerProvider' ? null : delegate
  }
  if (provider.constructor?.name === 'ProxyTracerProvider') {
    const delegate = (
      provider as unknown as { getDelegate(): TracerProvider }
    ).getDelegate()
    return delegate.constructor?.name === 'NoopTracerProvider' ? null : delegate
  }
  return provider
}

function isNodeRuntime(): boolean {
  const runtime = process.env.NEXT_RUNTIME
  return runtime === undefined || runtime === 'nodejs'
}

function readNextVersion(options: NextScopeRegisterOptions): string | undefined {
  const value =
    options.nextVersion ??
    process.env.NEXTSCOPE_NEXT_VERSION ??
    process.env.npm_package_dependencies_next ??
    undefined
  return value && value.trim() !== '' ? value.trim() : undefined
}

function buildResource(
  serviceName: string,
  nextVersion: string | undefined,
): ReturnType<typeof resourceFromAttributes> {
  const serviceVersion =
    process.env.npm_package_version && process.env.npm_package_version.trim() !== ''
      ? process.env.npm_package_version.trim()
      : NEXTSCOPE_SDK_VERSION
  return resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    'next.runtime': 'nodejs',
    ...(nextVersion ? { 'next.version': nextVersion } : {}),
    ...(process.env.NODE_ENV ? { 'deployment.environment': process.env.NODE_ENV } : {}),
  })
}

function resolveTransport(
  options: NextScopeRegisterOptions,
): NextScopeTransport | null {
  if (options.transport) {
    return getNextScopeTransport({
      ...options.transport,
      ...(options.serviceName ? { serviceName: options.serviceName } : {}),
      ...(options.projectName ? { projectName: options.projectName } : {}),
      ...(readNextVersion(options) ? { nextVersion: readNextVersion(options) } : {}),
    })
  }
  return getNextScopeTransport()
}

/**
 * Starts OpenTelemetry span collection for a Next.js Node.js runtime.
 *
 * Call this from `instrumentation.ts` `register()`. It is inert when NextScope
 * environment variables are absent, so applications can deploy the same build
 * without a local collector. Existing tracer providers are never replaced:
 * NextScope yields to another APM rather than breaking its instrumentation.
 */
export async function registerNextScope(
  options: NextScopeRegisterOptions = {},
): Promise<NextScopeRegistration | null> {
  const state = globalState()
  if (state.__nextscopeRegistration) return state.__nextscopeRegistration
  if (options.enabled === false) return null
  if (!isNodeRuntime()) return null

  if (registeredProvider()) {
    debugLog(
      'an OpenTelemetry tracer provider is already registered; leaving it untouched',
    )
    return null
  }

  const transport = resolveTransport(options)
  if (!transport) {
    debugLog(
      'NEXTSCOPE_COLLECTOR_URL and NEXTSCOPE_TOKEN are not set; tracing is disabled',
    )
    return null
  }

  const nextVersion = readNextVersion(options)
  const serviceName =
    options.serviceName ??
    transport.options.serviceName ??
    transport.options.projectName ??
    'next-app'
  const collectorUrl = options.collectorUrl ?? transport.options.collectorUrl
  const exporter = new NextScopeSpanExporter({
    transport,
    collectorUrl,
    fallbackServiceName: serviceName,
    captureFetch:
      options.captureFetch ?? process.env.NEXTSCOPE_CAPTURE_FETCH !== '0',
  })
  const processor = new BatchSpanProcessor(exporter, {
    scheduledDelayMillis: 200,
    maxQueueSize: 2_048,
    maxExportBatchSize: 256,
    exportTimeoutMillis: 2_000,
  })
  const tracerProvider = new NodeTracerProvider({
    resource: buildResource(serviceName, nextVersion),
    spanProcessors: [processor],
  })
  tracerProvider.register()

  const registration: NextScopeRegistration = {
    provider: tracerProvider,
    transport,
    exporter,
    serviceName,
    registeredAt: Date.now(),
  }
  state.__nextscopeRegistration = registration

  const beforeExit = (): void => {
    void shutdownNextScope()
  }
  state.__nextscopeBeforeExit = beforeExit
  process.once('beforeExit', beforeExit)

  debugLog(
    `tracing registered for ${serviceName} (queue ${transport.instanceId.slice(0, 8)})`,
  )
  return registration
}

/** Returns the active registration without creating one. */
export function getNextScopeRegistration():
  | NextScopeRegistration
  | undefined {
  return globalState().__nextscopeRegistration
}

/**
 * Flushes buffered spans and shuts the provider down. Safe to call more than
 * once. Next owns process signals; NextScope only hooks process exit.
 */
export async function shutdownNextScope(): Promise<void> {
  const state = globalState()
  const registration = state.__nextscopeRegistration
  if (!registration) return
  state.__nextscopeRegistration = undefined
  if (state.__nextscopeBeforeExit) {
    process.removeListener('beforeExit', state.__nextscopeBeforeExit)
    state.__nextscopeBeforeExit = undefined
  }
  try {
    await registration.provider.shutdown()
  } catch (error) {
    debugLog(
      `provider shutdown failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  try {
    await registration.transport.shutdown(1_000)
  } catch {
    // Transport shutdown is best effort; the process is exiting.
  }
}

/**
 * Next.js `register()` entry point. Re-export this from `instrumentation.ts`.
 */
export async function register(
  options: NextScopeRegisterOptions = {},
): Promise<NextScopeRegistration | null> {
  return registerNextScope(options)
}
