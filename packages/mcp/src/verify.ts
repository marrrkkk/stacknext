import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { STACKNEXT_SDK_VERSION } from '@stacknext/core'
import { StackNextApiClient, StackNextApiError } from './client.js'
import { createStackNextMcpServer } from './server.js'

export interface McpCheckResult {
  ok: boolean
  server?: { name: string; version: string }
  toolCount?: number
  promptCount?: number
  connection?: string
  requests?: number
  errors?: number
  databaseQueries?: number
  error?: string
}

function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map((entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      'text' in entry &&
      typeof entry.text === 'string'
        ? entry.text
        : '',
    )
    .join('\n')
}

function numberField(value: unknown, key: string): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const entry = (value as Record<string, unknown>)[key]
  return typeof entry === 'number' && Number.isFinite(entry) ? entry : undefined
}

function stringField(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const entry = (value as Record<string, unknown>)[key]
  return typeof entry === 'string' ? entry : undefined
}

/**
 * Verifies the built MCP server over an in-memory transport without an LLM or
 * client. It lists the tools and prompts and calls get_project_summary against
 * the live collector.
 */
export async function verifyMcpServer(options: {
  baseUrl: string
  token: string
  timeoutMs?: number
}): Promise<McpCheckResult> {
  let server: ReturnType<typeof createStackNextMcpServer> | undefined
  let client: Client | undefined
  try {
    const api = new StackNextApiClient({
      baseUrl: options.baseUrl,
      token: options.token,
      ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
    })
    server = createStackNextMcpServer(api)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    client = new Client({
      name: 'stacknext-mcp-check',
      version: STACKNEXT_SDK_VERSION,
    })
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    const [tools, prompts, result] = await Promise.all([
      client.listTools(),
      client.listPrompts(),
      client.callTool({ name: 'get_project_summary', arguments: {} }),
    ])
    const version = client.getServerVersion()
    if (result.isError) {
      return {
        ok: false,
        ...(version ? { server: { name: version.name, version: version.version } } : {}),
        toolCount: tools.tools.length,
        promptCount: prompts.prompts.length,
        error: textOf(result.content) || 'get_project_summary returned an error',
      }
    }
    const structured = result.structuredContent
    const summary =
      typeof structured === 'object' && structured !== null
        ? (structured as Record<string, unknown>).summary
        : undefined
    const meta =
      typeof structured === 'object' && structured !== null
        ? (structured as Record<string, unknown>).meta
        : undefined
    const connection =
      typeof meta === 'object' && meta !== null
        ? stringField(
            (meta as Record<string, unknown>).connection,
            'instrumentation',
          )
        : undefined
    return {
      ok: true,
      ...(version ? { server: { name: version.name, version: version.version } } : {}),
      toolCount: tools.tools.length,
      promptCount: prompts.prompts.length,
      ...(connection ? { connection } : {}),
      ...(numberField(summary, 'totalRequests') !== undefined
        ? { requests: numberField(summary, 'totalRequests') }
        : {}),
      ...(numberField(summary, 'errorCount') !== undefined
        ? { errors: numberField(summary, 'errorCount') }
        : {}),
      ...(numberField(summary, 'databaseQueryCount') !== undefined
        ? { databaseQueries: numberField(summary, 'databaseQueryCount') }
        : {}),
    }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof StackNextApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error),
    }
  } finally {
    await client?.close().catch(() => undefined)
    await server?.close().catch(() => undefined)
  }
}
