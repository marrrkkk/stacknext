export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'
  if (ms < 1) return '<1 ms'
  if (ms < 1_000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(2)} s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1_000)
  return `${minutes}m ${seconds}s`
}

export function formatRelative(timestamp: number | null | undefined, now = Date.now()): string {
  if (!timestamp) return '—'
  const delta = Math.max(0, now - timestamp)
  if (delta < 1_000) return 'just now'
  if (delta < 60_000) return `${Math.floor(delta / 1_000)}s ago`
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
  return `${Math.floor(delta / 86_400_000)}d ago`
}

export function formatTime(timestamp: number | null | undefined): string {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** Compact clock for chart axes: 24-hour, no day-period suffix. */
export function formatTimeShort(timestamp: number | null | undefined): string {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function formatDateTime(timestamp: number | null | undefined): string {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** Absolute timestamp with an explicit timezone, used in hover tooltips. */
export function formatAbsolute(timestamp: number | null | undefined): string {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  })
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`
}

/** Human threshold label that keeps the exact stored values in the tooltip. */
export function formatThreshold(ms: number, percent: number): string {
  return `${formatDuration(ms)} and ${formatNumber(percent)}%`
}

export function formatUptime(ms: number): string {
  return formatDuration(ms)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value)
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—'
  if (bytes < 1_024) return `${Math.round(bytes)} B`
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KiB`
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MiB`
  return `${(bytes / 1_073_741_824).toFixed(1)} GiB`
}

/**
 * Human duration for configuration and status surfaces: "500 ms", "15s",
 * "15 min", "1m 13s", "2h 5m". The exact millisecond value belongs in a title.
 */
export function formatHumanDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'
  const value = Math.max(0, ms)
  if (value < 1_000) return `${Math.round(value)} ms`
  const totalSeconds = Math.round(value / 1_000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const totalMinutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (totalMinutes < 60) {
    if (seconds === 0) return `${totalMinutes} min`
    return `${totalMinutes}m ${seconds}s`
  }
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

/** Binary size without a trailing ".0", e.g. "64 MiB". */
export function formatBinarySize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—'
  const units = ['B', 'KiB', 'MiB', 'GiB'] as const
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1_024 && unit < units.length - 1) {
    value /= 1_024
    unit += 1
  }
  const rounded = unit === 0 ? Math.round(value) : Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${units[unit]}`
}

export function formatExactDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return 'Not captured'
  return `${formatNumber(Math.round(ms))} ms`
}

export function formatExactBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return 'Not captured'
  }
  return `${formatNumber(bytes)} bytes`
}

export function truncate(value: string, max = 120): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}

export function statusTone(statusCode: number | null): 'good' | 'warn' | 'bad' | 'muted' {
  if (statusCode === null) return 'muted'
  if (statusCode >= 500) return 'bad'
  if (statusCode >= 400) return 'warn'
  return 'good'
}

export function errorRate(failed: number, total: number): string {
  return `${errorRateParts(failed, total).value}%`
}

export interface ValueUnit {
  value: string
  unit: string | null
}

/** Split a duration into the display value and its muted unit. */
export function formatDurationParts(ms: number | null | undefined): ValueUnit {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) {
    return { value: '—', unit: null }
  }
  if (ms === 0) return { value: '0', unit: 'ms' }
  if (ms < 1) return { value: '<1', unit: 'ms' }
  if (ms < 1_000) return { value: formatNumber(Math.round(ms)), unit: 'ms' }
  if (ms < 60_000) return { value: (ms / 1_000).toFixed(1), unit: 's' }
  return { value: formatDuration(ms), unit: null }
}

/** Split an error rate into the display value and its muted unit. */
export function errorRateParts(failed: number, total: number): ValueUnit {
  if (total === 0) return { value: '0', unit: '%' }
  return { value: ((failed / total) * 100).toFixed(1), unit: '%' }
}

export function sqlPreview(sql: string, max = 100): string {
  return truncate(sql.replace(/\s+/g, ' ').trim(), max)
}
