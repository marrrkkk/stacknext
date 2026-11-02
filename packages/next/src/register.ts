import {
  ProxyTracerProvider,
  propagation,
  trace,
  type TracerProvider,
} from '@opentelemetry/api'
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'
import {
  STACKNEXT_SDK_VERSION,
} from '@stacknext/core'
import {
  getStackNextTransport,
  type StackNextTransport,
  type StackNextTransportOptions,
} from '@stacknext/core/transport'
import { StackNextSpanExporter } from './exporter.js'

export interface StackNextRegisterOptions {
  /** Overrides environment-based transport configuration. */
  transport?: StackNextTransportOptions
  /** Collector URL; used to filter self-instrumentation requests. */
  collectorUrl?: string
  serviceName?: string
  projectName?: string
  nextVersion?: string
  /** Set to false to drop Next.js fetch spans. Defaults to true. */
  captureFetch?: boolean
  /** Set to false to keep StackNext loaded but inactive. */
  enabled?: boolean
}

export interface StackNextRegistration {
  provider: NodeTracerProvider
  transport: StackNextTransport
  exporter: StackNextSpanExporter
  serviceName: string
  registeredAt: number
}

interface RegistrationGlobalState {
  __stacknextRegistration?: StackNextRegistration
  __stacknextBeforeExit?: () => void
}

function globalState(): RegistrationGlobalState {
  return globalThis as unknown as RegistrationGlobalState
}

function debugLog(message: string): void {
  if (process.env.STACKNEXT_DEBUG === '1') {
    console.warn(`[stacknext] ${message}`)
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

function readNextVersion(options: StackNextRegisterOptions): string | undefined {
  const value =
    options.nextVersion ??
    process.env.STACKNEXT_NEXT_VERSION ??
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
      : STACKNEXT_SDK_VERSION
  return resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    'next.runtime': 'nodejs',
    ...(nextVersion ? { 'next.version': nextVersion } : {}),
    ...(process.env.NODE_ENV ? { 'deployment.environment': process.env.NODE_ENV } : {}),
  })
}

function resolveTransport(
  options: StackNextRegisterOptions,
): StackNextTransport | null {
  if (options.transport) {
    return getStackNextTransport({
      ...options.transport,
      ...(options.serviceName ? { serviceName: options.serviceName } : {}),
      ...(options.projectName ? { projectName: options.projectName } : {}),
      ...(readNextVersion(options) ? { nextVersion: readNextVersion(options) } : {}),
    })
  }
  return getStackNextTransport()
}

/**
 * Starts OpenTelemetry span collection for a Next.js Node.js runtime.
 *
 * Call this from `instrumentation.ts` `register()`. It is inert when StackNext
 * environment variables are absent, so applications can deploy the same build
 * without a local collector. Existing tracer providers are never replaced:
 * StackNext yields to another APM rather than breaking its instrumentation.
 */
export async function registerStackNext(
  options: StackNextRegisterOptions = {},
): Promise<StackNextRegistration | null> {
  const state = globalState()
  if (state.__stacknextRegistration) return state.__stacknextRegistration
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
      'STACKNEXT_COLLECTOR_URL and STACKNEXT_TOKEN are not set; tracing is disabled',
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
  const exporter = new StackNextSpanExporter({
    transport,
    collectorUrl,
    fallbackServiceName: serviceName,
    captureFetch:
      options.captureFetch ?? process.env.STACKNEXT_CAPTURE_FETCH !== '0',
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
  // Next.js extracts W3C context from the request headers through the global
  // propagator. Installing a real propagator makes an incoming `traceparent`
  // from a local test runner the parent of the Next.js request trace. Without
  // it the API's no-op propagator silently drops the header.
  propagation.setGlobalPropagator(
    new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    }),
  )

  const registration: StackNextRegistration = {
    provider: tracerProvider,
    transport,
    exporter,
    serviceName,
    registeredAt: Date.now(),
  }
  state.__stacknextRegistration = registration

  const beforeExit = (): void => {
    void shutdownStackNext()
  }
  state.__stacknextBeforeExit = beforeExit
  process.once('beforeExit', beforeExit)

  debugLog(
    `tracing registered for ${serviceName} (queue ${transport.instanceId.slice(0, 8)})`,
  )
  return registration
}

/** Returns the active registration without creating one. */
export function getStackNextRegistration():
  | StackNextRegistration
  | undefined {
  return globalState().__stacknextRegistration
}

/**
 * Flushes buffered spans and shuts the provider down. Safe to call more than
 * once. Next owns process signals; StackNext only hooks process exit.
 */
export async function shutdownStackNext(): Promise<void> {
  const state = globalState()
  const registration = state.__stacknextRegistration
  if (!registration) return
  state.__stacknextRegistration = undefined
  if (state.__stacknextBeforeExit) {
    process.removeListener('beforeExit', state.__stacknextBeforeExit)
    state.__stacknextBeforeExit = undefined
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
  options: StackNextRegisterOptions = {},
): Promise<StackNextRegistration | null> {
  return registerStackNext(options)
}
