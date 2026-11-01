import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NextScopeApiClient } from '../src/client.js'
import { createNextScopeMcpServer } from '../src/server.js'

const TOKEN = 'm'.repeat(32)
const TRACE_ID = 'a'.repeat(32)

interface MockCollector {
  url: string
  requests: string[]
  close(): Promise<void>
}

async function startMockCollector(): Promise<MockCollector> {
  const requests: string[] = []
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`)
    if (request.headers.authorization !== `Bearer ${TOKEN}`) {
      response.writeHead(401, { 'content-type': 'application/json' })
      response.end('{"error":"Unauthorized"}')
      return
    }
    if (request.method !== 'GET') {
      response.writeHead(405)
      response.end()
      return
    }
    const send = (payload: unknown): void => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(payload))
    }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/api/summary') {
      send({
        health: {
          projectName: 'mcp-demo',
          connected: true,
          counts: { requests: 1, failedRequests: 0, slowRequests: 1, spans: 3, errors: 0, databaseQueries: 1 },
          connections: [],
        },
        summary: {
          totalRequests: 1,
          failedRequests: 0,
          slowRequests: 1,
          avgDurationMs: 120,
          p95DurationMs: 120,
          spanCount: 3,
          errorCount: 0,
          databaseQueryCount: 1,
          fetchCount: 0,
          slowestRequests: [],
          recentErrors: [],
          firstEventTime: 1,
          lastEventTime: 2,
        },
      })
      return
    }
    if (url.pathname === '/api/requests') {
      send({
        items: [
          {
            id: TRACE_ID,
            traceId: TRACE_ID,
            name: 'GET /api/users',
            method: 'GET',
            route: '/api/users',
            statusCode: 200,
            statusClass: '2xx',
            durationMs: 120,
            timestamp: 1,
            endTime: 121,
            spanCount: 3,
            errorCount: 0,
            databaseQueryCount: 1,
            fetchCount: 0,
            failed: false,
            slow: true,
            serviceName: 'mcp-demo',
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      })
      return
    }
    if (url.pathname === `/api/requests/${TRACE_ID}`) {
      send({
        traceId: TRACE_ID,
        request: null,
        spans: [],
        errors: [],
        databaseQueries: [],
        startTime: 1,
        endTime: 121,
        durationMs: 120,
        missingParentSpanIds: [],
      })
      return
    }
    if (url.pathname === '/api/errors') {
      send({ items: [], total: 0, limit: 20, offset: 0, groups: [] })
      return
    }
    if (url.pathname === '/api/database') {
      send({
        items: [
          {
            id: 'query-1',
            timestamp: 1,
            durationMs: 4,
            sql: 'select * from "users"',
            databaseSystem: 'sqlite',
            success: true,
            source: 'drizzle',
            attributes: {},
            receivedAt: 2,
            resolvedTraceId: TRACE_ID,
            route: '/api/users',
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      })
      return
    }
    if (url.pathname === '/api/traces') {
      send({ items: [], total: 0, limit: 20, offset: 0 })
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end('{"error":"Not found"}')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = result.content as Array<{ type: string; text?: string }>
  return content.map((entry) => entry.text ?? '').join('\n')
}

describe('read-only MCP server', () => {
  let collector: MockCollector
  let client: Client
  let serverClose: () => Promise<void>

  beforeEach(async () => {
    collector = await startMockCollector()
    const api = new NextScopeApiClient({ baseUrl: collector.url, token: TOKEN })
    const server = createNextScopeMcpServer(api)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    client = new Client({ name: 'test-client', version: '1.0.0' })
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    serverClose = () => server.close()
  })

  afterEach(async () => {
    await client.close()
    await serverClose()
    await collector.close()
  })

  it('exposes only read-only investigation tools', async () => {
    const { tools } = await client.listTools()
    const names = tools.map((tool) => tool.name).sort()
    expect(names).toEqual([
      'find_slow_requests',
      'get_error',
      'get_project_summary',
      'get_request',
      'get_trace',
      'list_database_queries',
      'list_errors',
      'list_requests',
      'list_traces',
    ])
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true)
      expect(tool.annotations?.destructiveHint).toBe(false)
    }
  })

  it('serves project, request, trace and database data', async () => {
    const summary = await client.callTool({ name: 'get_project_summary', arguments: {} })
    expect(textOf(summary)).toContain('mcp-demo')

    const requests = await client.callTool({
      name: 'list_requests',
      arguments: { limit: 5, sort: 'slowest' },
    })
    expect(textOf(requests)).toContain('GET /api/users')

    const slow = await client.callTool({
      name: 'find_slow_requests',
      arguments: { minDurationMs: 100 },
    })
    expect(textOf(slow)).toContain(String(TRACE_ID))
    expect(collector.requests).toContain(
      'GET /api/requests?limit=20&minDuration=100&sort=slowest',
    )

    const request = await client.callTool({
      name: 'get_request',
      arguments: { traceId: TRACE_ID },
    })
    expect(textOf(request)).toContain(TRACE_ID)

    const database = await client.callTool({
      name: 'list_database_queries',
      arguments: {},
    })
    expect(textOf(database)).toContain('select * from')
    expect(textOf(database)).toContain('users')
  })

  it('returns tool errors without crashing the server', async () => {
    const missing = await client.callTool({
      name: 'get_request',
      arguments: { traceId: 'b'.repeat(32) },
    })
    expect(missing.isError).toBe(true)
    expect(textOf(missing)).toBe('Not found')

    const summary = await client.callTool({ name: 'get_project_summary', arguments: {} })
    expect(summary.isError).not.toBe(true)
  })

  it('never issues mutating HTTP requests', () => {
    expect(collector.requests.every((entry) => entry.startsWith('GET '))).toBe(true)
  })
})
