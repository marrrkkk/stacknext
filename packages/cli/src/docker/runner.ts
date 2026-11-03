import { spawn } from 'node:child_process'

export interface DockerResult {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  error?: Error
}

export interface DockerRunOptions {
  /** Inherit output for commands such as `docker pull`. */
  stdio?: 'pipe' | 'inherit'
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
  cwd?: string
}

/**
 * Small injectable seam around the Docker CLI. Production uses `spawn` with an
 * argument array (never a shell string), while unit tests provide a fake.
 */
export interface DockerRunner {
  run(args: string[], options?: DockerRunOptions): Promise<DockerResult>
}

const MAX_CAPTURE_BYTES = 1024 * 1024

function capture(child: ReturnType<typeof spawn>): {
  stdout: string
  stderr: string
} {
  let stdout = ''
  let stderr = ''
  const append = (current: string, chunk: Buffer): string => {
    if (current.length >= MAX_CAPTURE_BYTES) return current
    return (current + chunk.toString('utf8')).slice(0, MAX_CAPTURE_BYTES)
  }
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout = append(stdout, chunk)
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = append(stderr, chunk)
  })
  return {
    get stdout() {
      return stdout
    },
    get stderr() {
      return stderr
    },
  }
}

export const dockerRunner: DockerRunner = {
  run(args, options = {}) {
    return new Promise<DockerResult>((resolve) => {
      const child = spawn('docker', args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio:
          options.stdio === 'inherit'
            ? 'inherit'
            : ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
      })
      const output = capture(child)
      let timedOut = false
      const timer =
        options.timeoutMs && options.timeoutMs > 0
          ? setTimeout(() => {
              timedOut = true
              child.kill('SIGKILL')
            }, options.timeoutMs)
          : null
      timer?.unref()
      const finish = (
        code: number | null,
        signal: NodeJS.Signals | null,
        error?: Error,
      ): void => {
        if (timer) clearTimeout(timer)
        resolve({
          code,
          signal,
          stdout: output.stdout,
          stderr: timedOut
            ? `${output.stderr}\nDocker command timed out after ${options.timeoutMs}ms`
            : output.stderr,
          ...(error ? { error } : {}),
        })
      }
      child.once('error', (error) => finish(null, null, error))
      child.once('close', (code, signal) => finish(code, signal))
    })
  },
}

export function dockerResultMessage(result: DockerResult): string {
  const detail = result.stderr.trim() || result.stdout.trim()
  if (detail) return detail
  if (result.error) return result.error.message
  if (result.signal) return `docker exited with signal ${result.signal}`
  return `docker exited with code ${result.code ?? 'unknown'}`
}
