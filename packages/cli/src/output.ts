const useColor =
  process.stdout.isTTY === true &&
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== 'dumb'

function wrap(code: string, text: string): string {
  return useColor ? `\u001B[${code}m${text}\u001B[0m` : text
}

export const style = {
  bold: (text: string): string => wrap('1', text),
  dim: (text: string): string => wrap('2', text),
  red: (text: string): string => wrap('31', text),
  green: (text: string): string => wrap('32', text),
  yellow: (text: string): string => wrap('33', text),
  cyan: (text: string): string => wrap('36', text),
}

export function printBanner(version: string): void {
  console.log(`${style.bold('StackNext')} ${style.dim(`v${version}`)}`)
}

export function printSection(title: string): void {
  console.log(`\n${style.bold(title)}`)
}

export function printCheck(
  status: 'pass' | 'warn' | 'fail',
  label: string,
  detail?: string,
): void {
  const marker =
    status === 'pass'
      ? style.green('✓')
      : status === 'warn'
        ? style.yellow('!')
        : style.red('✗')
  console.log(`${marker} ${label}${detail ? style.dim(` — ${detail}`) : ''}`)
}

export function errorLine(message: string): void {
  console.error(`${style.red('Error')} ${message}`)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—'
  if (ms < 1_000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(2)} s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1_000)
  return `${minutes}m ${seconds}s`
}

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const delta = Math.max(0, now - timestamp)
  if (delta < 1_000) return 'just now'
  if (delta < 60_000) return `${Math.floor(delta / 1_000)}s ago`
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
  return `${Math.floor(delta / 3_600_000)}h ago`
}

