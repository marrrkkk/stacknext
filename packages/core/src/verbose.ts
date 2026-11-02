import type { NextOtelVerboseStatus } from './types.js'

/**
 * Resolves the effective `NEXT_OTEL_VERBOSE` state.
 *
 * Next.js only treats the literal value `1` as enabled, so `true` or any other
 * value is reported as an unknown override rather than silently claiming that
 * verbose spans are active.
 */
export function nextOtelVerboseStatus(
  configEnabled: boolean,
  environmentValue: string | undefined,
): NextOtelVerboseStatus {
  if (environmentValue !== undefined && environmentValue.trim() !== '') {
    if (environmentValue === '1') {
      return { enabled: true, source: 'environment' }
    }
    if (environmentValue === '0') {
      return { enabled: false, source: 'environment' }
    }
    return { enabled: false, source: 'unknown' }
  }
  if (configEnabled) return { enabled: true, source: 'config' }
  return { enabled: false, source: 'disabled' }
}
