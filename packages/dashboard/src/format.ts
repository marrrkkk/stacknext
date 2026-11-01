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

export function formatUptime(ms: number): string {
  return formatDuration(ms)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value)
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
  if (total === 0) return '0%'
  return `${((failed / total) * 100).toFixed(1)}%`
}

export function sqlPreview(sql: string, max = 100): string {
  return truncate(sql.replace(/\s+/g, ' ').trim(), max)
}
