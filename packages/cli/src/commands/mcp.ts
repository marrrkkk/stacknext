import type { Command } from 'commander'
import { requireRunningState } from '../session.js'

export interface McpOptions {
  collector?: string
  token?: string
}

/**
 * Starts the read-only MCP server on stdio. Diagnostics must go to stderr;
 * stdout is reserved for the protocol.
 */
export async function runMcp(
  options: McpOptions,
  cwd = process.cwd(),
): Promise<never> {
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
  const { startMcpServer } = await import('@nextscope/mcp')
  await startMcpServer({ baseUrl, token })
  // MCP stdio servers run until the client closes stdin.
  return new Promise<never>(() => {})
}

export function registerMcpCommand(program: Command, cwd: string): void {
  program
    .command('mcp')
    .description('Run the read-only MCP server over stdio')
    .option('--collector <url>', 'collector URL (defaults to .nextscope/run.json)')
    .option('--token <token>', 'collector bearer token (defaults to runtime state)')
    .action(async (options: McpOptions) => {
      await runMcp(options, cwd)
    })
}
