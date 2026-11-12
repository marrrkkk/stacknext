import type { Command } from 'commander'
import { requireRunningState } from '../session.js'

export interface McpOptions {
  collector?: string
  token?: string
  check?: boolean
}

/**
 * Starts the read-only MCP server on stdio. Diagnostics must go to stderr;
 * stdout is reserved for the protocol. With `--check`, verifies the collector
 * and tool surface over an in-memory transport and exits.
 */
export async function runMcp(
  options: McpOptions,
  cwd = process.cwd(),
): Promise<number> {
  let baseUrl = options.collector
  let token = options.token
  if (!baseUrl || !token) {
    const state = await requireRunningState(cwd)
    baseUrl = baseUrl ?? state.collectorUrl
    token = token ?? state.token
  }
  if (!token || token.length < 16) {
    throw new Error('A collector token of at least 16 characters is required')
  }
  const { startMcpServer, verifyMcpServer } = await import('@stacknext/mcp')
  if (options.check) {
    const result = await verifyMcpServer({ baseUrl, token })
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) {
      console.error(result.error ?? 'MCP check failed')
      return 1
    }
    return 0
  }
  await startMcpServer({ baseUrl, token })
  // MCP stdio servers run until the client closes stdin.
  return new Promise<never>(() => {})
}

export function registerMcpCommand(program: Command, cwd: string): void {
  program
    .command('mcp')
    .description('Run the read-only MCP server over stdio')
    .option('--collector <url>', 'collector URL (defaults to .stacknext/run.json)')
    .option('--token <token>', 'collector bearer token (defaults to runtime state)')
    .option('--check', 'verify the collector and MCP tools, then exit')
    .action(async (options: McpOptions) => {
      const code = await runMcp(options, cwd)
      if (code !== 0) process.exitCode = code
    })
}
