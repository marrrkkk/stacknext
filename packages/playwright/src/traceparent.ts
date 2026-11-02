import { randomBytes } from 'node:crypto'

export interface InjectedTraceContext {
  traceId: string
  spanId: string
  traceparent: string
}

function nonZeroHex(bytes: number): string {
  const buffer = randomBytes(bytes)
  if (buffer.every((value) => value === 0)) buffer[bytes - 1] = 1
  return buffer.toString('hex')
}

/**
 * Creates a W3C trace context for one browser request. The child span id is
 * what proves server correlation: Next.js must parent a server span to it.
 */
export function createTraceparent(): InjectedTraceContext {
  const traceId = nonZeroHex(16)
  const spanId = nonZeroHex(8)
  return {
    traceId,
    spanId,
    traceparent: `00-${traceId}-${spanId}-01`,
  }
}
