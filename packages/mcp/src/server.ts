import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { NEXTSCOPE_SDK_VERSION } from '@nextscope/core'
import { NextScopeApiClient } from './client.js'

const traceIdSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/i, 'traceId must be 32 hexadecimal characters')

const limitSchema = z.number().int().min(1).max(200).optional()
const offsetSchema = z.number().int().min(0).optional()
const minDurationSchema = z.number().min(0).max(600_000).optional()

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

function textResult(data: unknown): {
  content: Array<{ type: 'text'; text: string }>
} {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  }
}

function errorResult(error: unknown): {
  isError: true
  content: Array<{ type: 'text'; text: string }>
} {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: error instanceof Error ? error.message : String(error),
      },
    ],
  }
}

async function safely(
  fn: () => Promise<unknown>,
): Promise<ReturnType<typeof textResult> | ReturnType<typeof errorResult>> {
  try {
    return textResult(await fn())
  } catch (error) {
    return errorResult(error)
  }
}

/**
 * Builds the read-only MCP server. Kept separate from stdio setup so tests can
 * connect an in-memory transport.
 */
export function createNextScopeMcpServer(
  client: NextScopeApiClient,
): McpServer {
  const server = new McpServer({
    name: 'nextscope',
    version: NEXTSCOPE_SDK_VERSION,
  })

  server.registerTool(
    'get_project_summary',
    {
      title: 'Get project summary',
      description:
        'Returns the NextScope project name, connection state, request/error/database counts, latency summary and recent errors. Start here.',
      inputSchema: {},
      annotations: readOnly,
    },
    () => safely(() => client.overview()),
  )

  server.registerTool(
    'list_requests',
    {
      title: 'List requests',
      description:
        'Lists recent HTTP requests with duration, status class, error count, database query count and trace id. Supports text search, method, status class, slow-only and minimum duration filters.',
      inputSchema: {
        limit: limitSchema,
        offset: offsetSchema,
        q: z.string().max(200).optional(),
        method: z.string().max(32).optional(),
        status: z.enum(['2xx', '3xx', '4xx', '5xx', 'none']).optional(),
        slow: z.boolean().optional(),
        minDurationMs: minDurationSchema,
        sort: z.enum(['recent', 'oldest', 'slowest']).optional(),
      },
      annotations: readOnly,
    },
    (args) =>
      safely(() =>
        client.listRequests({
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
          ...(args.offset !== undefined ? { offset: args.offset } : {}),
          ...(args.q !== undefined ? { q: args.q } : {}),
          ...(args.method !== undefined ? { method: args.method } : {}),
          ...(args.status !== undefined ? { status: args.status } : {}),
          ...(args.slow !== undefined ? { slow: args.slow } : {}),
          ...(args.minDurationMs !== undefined
            ? { minDuration: args.minDurationMs }
            : {}),
          ...(args.sort !== undefined ? { sort: args.sort } : {}),
        }),
      ),
  )

  server.registerTool(
    'get_request',
    {
      title: 'Get request',
      description:
        'Returns one request trace by trace id, including the request summary, every span in the timeline, correlated errors and database queries.',
      inputSchema: {
        traceId: traceIdSchema,
      },
      annotations: readOnly,
    },
    (args) => safely(() => client.getRequest(args.traceId)),
  )

  server.registerTool(
    'list_traces',
    {
      title: 'List traces',
      description:
        'Lists traces with root span, duration, span counts and error counts, newest first unless sorted otherwise.',
      inputSchema: {
        limit: limitSchema,
        offset: offsetSchema,
        q: z.string().max(200).optional(),
        sort: z.enum(['recent', 'oldest', 'slowest']).optional(),
      },
      annotations: readOnly,
    },
    (args) =>
      safely(() =>
        client.listTraces({
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
          ...(args.offset !== undefined ? { offset: args.offset } : {}),
          ...(args.q !== undefined ? { q: args.q } : {}),
          ...(args.sort !== undefined ? { sort: args.sort } : {}),
        }),
      ),
  )

  server.registerTool(
    'get_trace',
    {
      title: 'Get trace',
      description:
        'Returns the full span tree for a trace id, including correlated errors and database queries.',
      inputSchema: {
        traceId: traceIdSchema,
      },
      annotations: readOnly,
    },
    (args) => safely(() => client.getTrace(args.traceId)),
  )

  server.registerTool(
    'list_errors',
    {
      title: 'List errors',
      description:
        'Lists captured server errors with fingerprint groups, route, error name, message and trace correlation.',
      inputSchema: {
        limit: limitSchema,
        offset: offsetSchema,
        q: z.string().max(200).optional(),
        route: z.string().max(2_000).optional(),
        name: z.string().max(200).optional(),
      },
      annotations: readOnly,
    },
    (args) =>
      safely(() =>
        client.listErrors({
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
          ...(args.offset !== undefined ? { offset: args.offset } : {}),
          ...(args.q !== undefined ? { q: args.q } : {}),
          ...(args.route !== undefined ? { route: args.route } : {}),
          ...(args.name !== undefined ? { name: args.name } : {}),
        }),
      ),
  )

  server.registerTool(
    'get_error',
    {
      title: 'Get error',
      description:
        'Returns one error with its redacted stack and the correlated request trace, if available.',
      inputSchema: {
        errorId: z.string().min(1).max(128),
      },
      annotations: readOnly,
    },
    (args) => safely(() => client.getError(args.errorId)),
  )

  server.registerTool(
    'list_database_queries',
    {
      title: 'List database queries',
      description:
        'Lists redacted SQL queries with duration (null when the adapter cannot measure it), success state and trace correlation.',
      inputSchema: {
        limit: limitSchema,
        offset: offsetSchema,
        q: z.string().max(200).optional(),
        minDurationMs: minDurationSchema,
        traceId: traceIdSchema.optional(),
        databaseSystem: z.string().max(100).optional(),
      },
      annotations: readOnly,
    },
    (args) =>
      safely(() =>
        client.listDatabaseQueries({
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
          ...(args.offset !== undefined ? { offset: args.offset } : {}),
          ...(args.q !== undefined ? { q: args.q } : {}),
          ...(args.minDurationMs !== undefined
            ? { minDuration: args.minDurationMs }
            : {}),
          ...(args.traceId !== undefined ? { traceId: args.traceId } : {}),
          ...(args.databaseSystem !== undefined
            ? { databaseSystem: args.databaseSystem }
            : {}),
        }),
      ),
  )

  server.registerTool(
    'find_slow_requests',
    {
      title: 'Find slow requests',
      description:
        'Finds the slowest requests above a duration threshold (default 500 ms), sorted slowest first. Useful for performance investigations.',
      inputSchema: {
        minDurationMs: minDurationSchema,
        limit: limitSchema,
      },
      annotations: readOnly,
    },
    (args) =>
      safely(() =>
        client.findSlowRequests({
          ...(args.minDurationMs !== undefined
            ? { minDurationMs: args.minDurationMs }
            : {}),
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
        }),
      ),
  )

  return server
}

export interface StartMcpServerOptions {
  baseUrl: string
  token: string
  version?: string
}

/**
 * Connects a read-only NextScope MCP server to stdin/stdout. Nothing except
 * MCP protocol messages may be written to stdout.
 */
export async function startMcpServer(
  options: StartMcpServerOptions,
): Promise<McpServer> {
  const client = new NextScopeApiClient({
    baseUrl: options.baseUrl,
    token: options.token,
  })
  const server = createNextScopeMcpServer(client)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  return server
}
