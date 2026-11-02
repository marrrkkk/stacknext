import { test as base, expect, type TestInfo } from '@playwright/test'

export { expect }
import {
  createSampleId,
  scenarioIdentity,
  type SampleSubmission,
  type ScenarioIdentity,
} from '@stacknext/regression'
import {
  probeTrace,
  resolveCaptureConfig,
  submitSample,
  type CaptureConfig,
} from './collector-client.js'
import { createTraceparent } from './traceparent.js'

const INJECTED_TYPES = new Set(['document', 'fetch', 'xhr'])
const MAX_TRACES = 20

interface InjectedRequest {
  traceId: string
  spanId: string
  resourceType: string
  url: string
  sequence: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function loopbackHost(hostname: string): boolean {
  return (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '[::1]' ||
    hostname === '::1'
  )
}

function shouldInject(
  rawUrl: string,
  baseURL: string | undefined,
): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (loopbackHost(url.hostname)) return true
  if (!baseURL) return false
  try {
    return new URL(baseURL).origin === url.origin
  } catch {
    return false
  }
}

function scenarioAnnotation(testInfo: TestInfo): string | undefined {
  for (const annotation of testInfo.annotations) {
    if (!annotation.type.startsWith('stacknext')) continue
    const description = annotation.description?.trim()
    if (description) return description
  }
  return undefined
}

function identityFor(testInfo: TestInfo): ScenarioIdentity {
  return scenarioIdentity({
    title: testInfo.title,
    file: testInfo.file,
    project: testInfo.project.name,
    tags: testInfo.tags,
    testId: testInfo.testId,
    annotation: scenarioAnnotation(testInfo),
    rootDir: testInfo.config.rootDir,
  })
}

async function waitForInjectedTraces(
  config: CaptureConfig,
  injected: InjectedRequest[],
): Promise<Map<string, number>> {
  const found = new Map<string, number>()
  const documents = injected.filter((request) => request.resourceType === 'document')
  const deadline = Date.now() + config.timeoutMs
  await sleep(config.settleMs)
  const inspect = async (): Promise<void> => {
    for (const request of injected) {
      if (found.has(request.traceId)) continue
      const probe = await probeTrace(config, request.traceId)
      if (probe.found && probe.spanCount > 0) found.set(request.traceId, probe.spanCount)
    }
  }
  await inspect()
  while (
    Date.now() < deadline &&
    documents.some((request) => !found.has(request.traceId))
  ) {
    await sleep(150)
    await inspect()
  }
  return found
}

async function captureSample(
  config: CaptureConfig,
  testInfo: TestInfo,
  injected: InjectedRequest[],
): Promise<void> {
  const found = await waitForInjectedTraces(config, injected)
  const ordered = [...injected].sort((left, right) => {
    const leftDocument = left.resourceType === 'document' ? 0 : 1
    const rightDocument = right.resourceType === 'document' ? 0 : 1
    return leftDocument - rightDocument || left.sequence - right.sequence
  })
  const references = ordered
    .filter(
      (request) =>
        request.resourceType === 'document' || found.has(request.traceId),
    )
    .slice(0, MAX_TRACES)
    .map((request) => ({
      traceId: request.traceId,
      injectedSpanId: request.spanId,
    }))
  const sample: Omit<SampleSubmission, 'traces'> = {
    id: createSampleId(),
    status:
      testInfo.status === 'timedOut' ||
      testInfo.status === 'interrupted' ||
      testInfo.status === 'failed'
        ? testInfo.status
        : 'passed',
    expectedStatus:
      testInfo.expectedStatus === 'failed' || testInfo.expectedStatus === 'skipped'
        ? testInfo.expectedStatus
        : 'passed',
    retry: testInfo.retry,
    repeatEachIndex: testInfo.repeatEachIndex,
    durationMs: testInfo.duration,
    capturedAt: Date.now(),
  }
  await submitSample(config, identityFor(testInfo), { ...sample, traces: references })
}

type StackNextFixtures = {
  stacknextCapture: void
}

/**
 * Auto fixture that injects W3C trace context into same-origin browser requests
 * and submits only verified, collector-backed evidence for this test.
 */
export const test = base.extend<StackNextFixtures>({
  stacknextCapture: [
    async ({ context }, use, testInfo) => {
      const config = resolveCaptureConfig()
      if (!config) {
        await use()
        return
      }
      let sequence = 0
      const injected: InjectedRequest[] = []
      const baseURL = testInfo.project.use.baseURL
      await context.route('**/*', async (route) => {
        const request = route.request()
        if (!INJECTED_TYPES.has(request.resourceType())) {
          await route.fallback()
          return
        }
        if (!shouldInject(request.url(), baseURL)) {
          await route.fallback()
          return
        }
        const trace = createTraceparent()
        injected.push({
          traceId: trace.traceId,
          spanId: trace.spanId,
          resourceType: request.resourceType(),
          url: request.url(),
          sequence,
        })
        sequence += 1
        await route.fallback({
          headers: {
            ...request.headers(),
            traceparent: trace.traceparent,
          },
        })
      })
      await use()
      await context.unroute('**/*')
      if (testInfo.status === 'skipped') return
      await captureSample(config, testInfo, injected)
    },
    { auto: true },
  ],
})

export function stackNextFixtures(): { test: typeof test; expect: typeof expect } {
  return { test, expect }
}
