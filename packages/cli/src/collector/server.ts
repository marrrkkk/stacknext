import { createReadStream } from 'node:fs'
import { access, readFile, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import path from 'node:path'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import {
  TelemetryStore,
  ingestEnvelopeSchema,
  type ApiErrorResponse,
  type ConnectionInfo,
  type ErrorListResponse,
  type ErrorDetailResponse,
  type ExportResponse,
  type HealthResponse,
  type NextScopeConfig,
  type NextScopeIngestEnvelope,
  type NextScopeInstance,
  type OverviewResponse,
  type PageResult,
  type RequestFilters,
  type DatabaseFilters,
  type ErrorFilters,
  type DatabaseQueryListItem,
  type TraceListResult,
  type NextScopeExporterDiagnostics,
} from '@nextscope/core'

const VERSION = '0.1.0'
const MAX_BODY_BYTES = 2 * 1024 * 1024
const SESSION_COOKIE = 'nextscope_session'
const SESSION_TTL_MS = 24 * 60 * 60 * 1_000
const CONNECTION_STALE_MS = 20_000
const CONNECTION_RETENTION_MS = 10 * 60 * 1_000
const MAX_SSE_CLIENTS = 50
const SSE_HEARTBEAT_MS = 15_000
const MAX_SESSIONS = 100

export interface StartCollectorOptions {
  port: number
  token: string
  projectName: string
  config: NextScopeConfig
  dashboardDir: string | null
  version?: string
  host?: string
  log?: (message: string) => void
  autoPort?: boolean
  sseHeartbeatMs?: number
}

export interface CollectorHandle {
  port: number
  url: string
  token: string
  store: TelemetryStore
  health: () => HealthResponse
  close: () => Promise<void>
}

interface ConnectionRecord {
  info: Omit<ConnectionInfo, 'connected'>
  lastSeen: number
}

interface SseClient {
  res: ServerResponse
}

interface ParsedCookies {
  [key: string]: string
}

function securityHeaders(): Record<string, string> {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'cross-origin-resource-policy': 'same-origin',
  }
}

function dashboardCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  if (response.headersSent) return
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    ...securityHeaders(),
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    ...extraHeaders,
  })
  response.end(body)
}

function sendError(
  response: ServerResponse,
  status: number,
  message: string,
  issues?: string[],
): void {
  const payload: ApiErrorResponse = issues ? { error: message, issues } : { error: message }
  sendJson(response, status, payload)
}

function parseCookies(header: string | undefined): ParsedCookies {
  if (!header) return {}
  const cookies: ParsedCookies = {}
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    const key = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (key) cookies[key] = decodeURIComponent(value)
  }
  return cookies
}

function hashToken(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function tokensEqual(candidate: string, expected: string): boolean {
  const left = hashToken(candidate)
  const right = hashToken(expected)
  return timingSafeEqual(left, right)
}

function hostAllowed(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false
  let hostname: string
  try {
    hostname = new URL(`http://${hostHeader}`).hostname
  } catch {
    return false
  }
  return (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '[::1]' ||
    hostname === '::1'
  )
}

function originAllowed(origin: string, port: number): boolean {
  try {
    const url = new URL(origin)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      (url.hostname === '127.0.0.1' ||
        url.hostname === 'localhost' ||
        url.hostname === '[::1]' ||
        url.hostname === '::1') &&
      (url.port === '' || url.port === String(port))
    )
  } catch {
    return false
  }
}

function queryNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function queryBoolean(value: string | null): boolean | undefined {
  if (value === null) return undefined
  return value === '1' || value === 'true'
}

function filtersFromSearch(searchParams: URLSearchParams): RequestFilters {
  const sort = searchParams.get('sort')
  return {
    ...(queryNumber(searchParams.get('limit')) !== undefined
      ? { limit: queryNumber(searchParams.get('limit')) }
      : {}),
    ...(queryNumber(searchParams.get('offset')) !== undefined
      ? { offset: queryNumber(searchParams.get('offset')) }
      : {}),
    ...(searchParams.get('q') ? { q: searchParams.get('q') ?? undefined } : {}),
    ...(searchParams.get('method') ? { method: searchParams.get('method') ?? undefined } : {}),
    ...(searchParams.get('status') ? { status: searchParams.get('status') ?? undefined } : {}),
    ...(queryBoolean(searchParams.get('slow')) !== undefined
      ? { slow: queryBoolean(searchParams.get('slow')) }
      : {}),
    ...(queryNumber(searchParams.get('minDuration')) !== undefined
      ? { minDuration: queryNumber(searchParams.get('minDuration')) }
      : {}),
    ...(sort === 'recent' || sort === 'oldest' || sort === 'slowest' ? { sort } : {}),
  }
}

function databaseFiltersFromSearch(searchParams: URLSearchParams): DatabaseFilters {
  return {
    ...(queryNumber(searchParams.get('limit')) !== undefined
      ? { limit: queryNumber(searchParams.get('limit')) }
      : {}),
    ...(queryNumber(searchParams.get('offset')) !== undefined
      ? { offset: queryNumber(searchParams.get('offset')) }
      : {}),
    ...(searchParams.get('q') ? { q: searchParams.get('q') ?? undefined } : {}),
    ...(queryNumber(searchParams.get('minDuration')) !== undefined
      ? { minDuration: queryNumber(searchParams.get('minDuration')) }
      : {}),
    ...(searchParams.get('traceId') ? { traceId: searchParams.get('traceId') ?? undefined } : {}),
    ...(searchParams.get('databaseSystem')
      ? { databaseSystem: searchParams.get('databaseSystem') ?? undefined }
      : {}),
  }
}

function errorFiltersFromSearch(searchParams: URLSearchParams): ErrorFilters {
  return {
    ...(queryNumber(searchParams.get('limit')) !== undefined
      ? { limit: queryNumber(searchParams.get('limit')) }
      : {}),
    ...(queryNumber(searchParams.get('offset')) !== undefined
      ? { offset: queryNumber(searchParams.get('offset')) }
      : {}),
    ...(searchParams.get('q') ? { q: searchParams.get('q') ?? undefined } : {}),
    ...(searchParams.get('route') ? { route: searchParams.get('route') ?? undefined } : {}),
    ...(searchParams.get('name') ? { name: searchParams.get('name') ?? undefined } : {}),
  }
}

async function readBody(
  request: IncomingMessage,
  limit: number,
): Promise<{ ok: true; body: string } | { ok: false; tooLarge: boolean }> {
  const contentLength = Number(request.headers['content-length'] ?? '0')
  if (Number.isFinite(contentLength) && contentLength > limit) {
    request.resume()
    return { ok: false, tooLarge: true }
  }
  const chunks: Buffer[] = []
  let total = 0
  let tooLarge = false
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > limit) {
      tooLarge = true
      continue
    }
    chunks.push(buffer)
  }
  if (tooLarge) return { ok: false, tooLarge: true }
  return { ok: true, body: Buffer.concat(chunks).toString('utf8') }
}

function contentTypeFor(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.ico':
      return 'image/x-icon'
    case '.webp':
      return 'image/webp'
    case '.woff2':
      return 'font/woff2'
    case '.txt':
      return 'text/plain; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

export async function resolveDashboardDir(): Promise<string> {
  const candidates: string[] = []
  if (process.env.NEXTSCOPE_DASHBOARD_DIR) {
    candidates.push(path.resolve(process.env.NEXTSCOPE_DASHBOARD_DIR))
  }
  try {
    const require = createRequire(import.meta.url)
    const packageJsonPath = require.resolve('@nextscope/dashboard/package.json')
    candidates.push(path.join(path.dirname(packageJsonPath), 'dist'))
  } catch {
    // Workspace fallback below.
  }
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  candidates.push(path.resolve(moduleDir, '../../../dashboard/dist'))
  candidates.push(path.resolve(moduleDir, '../../dashboard/dist'))
  candidates.push(path.resolve(process.cwd(), 'packages/dashboard/dist'))
  for (const candidate of candidates) {
    try {
      await access(path.join(candidate, 'index.html'))
      return candidate
    } catch {
      // Keep searching.
    }
  }
  throw new Error(
    'Dashboard build not found. Run "pnpm build" (or "pnpm --filter @nextscope/dashboard build") before starting NextScope.',
  )
}

function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException): void => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = (): void => {
      server.off('error', onError)
      const address = server.address()
      if (typeof address === 'object' && address !== null) resolve(address.port)
      else reject(new Error('Collector did not bind a TCP port'))
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}

export async function startCollector(options: StartCollectorOptions): Promise<CollectorHandle> {
  const host = options.host ?? '127.0.0.1'
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('NextScope collector may only bind to a loopback address')
  }
  if (options.token.length < 16) {
    throw new Error('Collector token must be at least 16 characters')
  }
  const log = options.log ?? (() => undefined)
  const store = new TelemetryStore({
    maxSpans: options.config.collector.maxSpans,
    retentionMs: options.config.collector.retentionMs,
  })
  const startedAt = Date.now()
  const sessions = new Map<string, number>()
  const connections = new Map<string, ConnectionRecord>()
  const sseClients = new Set<SseClient>()
  const serverStats = {
    rejectedRequests: 0,
    droppedPayload: 0,
    droppedMalformed: 0,
  }
  let sequence = 0
  let port = options.port
  let dashboardUrl = `http://${host}:${port}`

  const getConnections = (now: number): ConnectionInfo[] => {
    const output: ConnectionInfo[] = []
    for (const [instanceId, record] of connections) {
      if (now - record.lastSeen > CONNECTION_RETENTION_MS) {
        connections.delete(instanceId)
        continue
      }
      output.push({
        ...record.info,
        connected: now - record.lastSeen <= CONNECTION_STALE_MS,
      })
    }
    return output.sort((a, b) => b.lastSeen - a.lastSeen)
  }

  const getHealth = (): HealthResponse => {
    const now = Date.now()
    const summary = store.summary(options.config.slowRequestMs)
    const storeStats = store.getStats()
    const connectionList = getConnections(now)
    const diagnostics = connectionList
      .map((connection) => connection.diagnostics)
      .filter((entry): entry is NextScopeExporterDiagnostics => entry !== undefined)
    const lastError =
      diagnostics
        .map((entry) => entry.lastError)
        .filter((entry): entry is string => Boolean(entry))
        .sort()
        .at(-1) ?? null
    return {
      status: 'ok',
      name: 'nextscope',
      version: options.version ?? VERSION,
      projectName: options.projectName,
      dashboardUrl,
      startedAt,
      uptimeMs: now - startedAt,
      time: now,
      connected: connectionList.some((connection) => connection.connected),
      connections: connectionList,
      counts: {
        requests: summary.totalRequests,
        failedRequests: summary.failedRequests,
        slowRequests: summary.slowRequests,
        spans: summary.spanCount,
        errors: summary.errorCount,
        databaseQueries: summary.databaseQueryCount,
      },
      store: storeStats,
      server: {
        ...serverStats,
        sseClients: sseClients.size,
      },
      exporter: {
        droppedSpans: diagnostics.reduce((sum, entry) => sum + entry.droppedSpans, 0),
        droppedEvents: diagnostics.reduce((sum, entry) => sum + entry.droppedEvents, 0),
        lastError,
      },
      config: options.config,
    }
  }

  const recordConnection = (
    instance: NextScopeInstance,
    diagnostics: NextScopeExporterDiagnostics | undefined,
    now: number,
  ): void => {
    const existing = connections.get(instance.instanceId)
    connections.set(instance.instanceId, {
      info: {
        instanceId: instance.instanceId,
        serviceName: instance.serviceName,
        ...(instance.projectName ?? options.projectName
          ? { projectName: instance.projectName ?? options.projectName }
          : {}),
        ...(instance.nextVersion ? { nextVersion: instance.nextVersion } : {}),
        sdkVersion: instance.sdkVersion,
        lastSeen: now,
        ...(diagnostics ? { diagnostics } : existing?.info.diagnostics
          ? { diagnostics: existing.info.diagnostics }
          : {}),
      },
      lastSeen: now,
    })
    if (connections.size > 20) {
      const oldest = [...connections.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen)[0]
      if (oldest) connections.delete(oldest[0])
    }
  }

  const broadcast = (event: string, payload: unknown): void => {
    const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
    for (const client of sseClients) {
      try {
        client.res.write(message)
      } catch {
        sseClients.delete(client)
      }
    }
  }

  const heartbeatInterval = setInterval(() => {
    for (const client of sseClients) {
      try {
        client.res.write(': heartbeat\n\n')
      } catch {
        sseClients.delete(client)
      }
    }
  }, options.sseHeartbeatMs ?? SSE_HEARTBEAT_MS)
  heartbeatInterval.unref()

  const sessionForRequest = (request: IncomingMessage, response: ServerResponse): string => {
    const cookies = parseCookies(request.headers.cookie)
    const existing = cookies[SESSION_COOKIE]
    const now = Date.now()
    if (existing && sessions.has(existing)) {
      const createdAt = sessions.get(existing) ?? 0
      if (now - createdAt <= SESSION_TTL_MS) return existing
      sessions.delete(existing)
    }
    const session = randomBytes(32).toString('base64url')
    sessions.set(session, now)
    if (sessions.size > MAX_SESSIONS) {
      const oldest = [...sessions.entries()].sort((a, b) => a[1] - b[1])[0]
      if (oldest) sessions.delete(oldest[0])
    }
    response.setHeader(
      'set-cookie',
      `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
    )
    return session
  }

  const hasSession = (request: IncomingMessage): boolean => {
    const cookies = parseCookies(request.headers.cookie)
    const session = cookies[SESSION_COOKIE]
    if (!session) return false
    const createdAt = sessions.get(session)
    return createdAt !== undefined && Date.now() - createdAt <= SESSION_TTL_MS
  }

  const isReadAuthorized = (request: IncomingMessage): boolean => {
    const authorization = request.headers.authorization
    if (authorization?.startsWith('Bearer ')) {
      return tokensEqual(authorization.slice('Bearer '.length), options.token)
    }
    return hasSession(request)
  }

  const isIngestAuthorized = (request: IncomingMessage): boolean => {
    const authorization = request.headers.authorization
    if (!authorization?.startsWith('Bearer ')) return false
    return tokensEqual(authorization.slice('Bearer '.length), options.token)
  }

  const serveIndex = async (response: ServerResponse, cookies: boolean): Promise<void> => {
    if (!options.dashboardDir) {
      const html =
        '<!doctype html><html><head><meta charset="utf-8"><title>NextScope</title></head><body style="font-family:system-ui;background:#0b0d10;color:#e6e8eb;padding:3rem"><h1>Dashboard build not found</h1><p>Run <code>pnpm build</code>, then restart <code>nextscope dev</code>.</p></body></html>'
      response.writeHead(503, {
        ...securityHeaders(),
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': dashboardCsp(),
      })
      response.end(html)
      return
    }
    const file = path.join(options.dashboardDir, 'index.html')
    const html = await readFile(file)
    if (cookies) {
      // Set-Cookie is attached by sessionForRequest before this function runs.
      response.setHeader('set-cookie', response.getHeader('set-cookie') ?? [])
    }
    response.writeHead(200, {
      ...securityHeaders(),
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': dashboardCsp(),
      'content-length': html.length,
    })
    response.end(html)
  }

  const serveStatic = async (
    pathname: string,
    request: IncomingMessage,
    response: ServerResponse,
    setSession: boolean,
  ): Promise<boolean> => {
    if (!options.dashboardDir) return false
    if (pathname === '/' || !path.extname(pathname)) {
      if (setSession) sessionForRequest(request, response)
      await serveIndex(response, true)
      return true
    }
    const decoded = decodeURIComponent(pathname)
    const relative = decoded.replace(/^\/+/, '')
    const resolved = path.resolve(options.dashboardDir, relative)
    const root = path.resolve(options.dashboardDir)
    if (!resolved.startsWith(`${root}${path.sep}`)) {
      sendError(response, 403, 'Forbidden')
      return true
    }
    try {
      const info = await stat(resolved)
      if (!info.isFile()) return false
      const headers: Record<string, string | number> = {
        ...securityHeaders(),
        'content-type': contentTypeFor(resolved),
        'content-length': info.size,
        'cache-control': relative.startsWith('assets/')
          ? 'public, max-age=31536000, immutable'
          : 'no-store',
      }
      response.writeHead(200, headers)
      if (request.method === 'HEAD') {
        response.end()
        return true
      }
      const stream = createReadStream(resolved)
      stream.on('error', () => {
        if (!response.headersSent) sendError(response, 500, 'Could not read asset')
        else response.destroy()
      })
      stream.pipe(response)
      return true
    } catch {
      return false
    }
  }

  const handleIngest = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    if (!isIngestAuthorized(request)) {
      serverStats.rejectedRequests += 1
      sendError(response, 401, 'Unauthorized')
      return
    }
    const contentType = String(request.headers['content-type'] ?? '')
    if (!contentType.toLowerCase().includes('application/json')) {
      serverStats.rejectedRequests += 1
      sendError(response, 415, 'Content-Type must be application/json')
      return
    }
    const body = await readBody(request, MAX_BODY_BYTES)
    if (!body.ok) {
      serverStats.rejectedRequests += 1
      serverStats.droppedPayload += 1
      sendError(response, 413, `Payload exceeds ${MAX_BODY_BYTES} bytes`)
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(body.body)
    } catch {
      serverStats.rejectedRequests += 1
      serverStats.droppedMalformed += 1
      sendError(response, 400, 'Malformed JSON payload')
      return
    }
    const result = ingestEnvelopeSchema.safeParse(parsed)
    if (!result.success) {
      serverStats.rejectedRequests += 1
      serverStats.droppedMalformed += 1
      sendError(
        response,
        422,
        'Telemetry payload failed validation',
        result.error.issues.map((issue) => issue.path.join('.') || '(root)'),
      )
      return
    }
    const envelope = result.data as NextScopeIngestEnvelope
    const now = Date.now()
    store.ingest(envelope, now)
    recordConnection(envelope.instance, envelope.diagnostics, now)
    const accepted = {
      spans: envelope.spans.length,
      errors: envelope.errors.length,
      databaseQueries: envelope.databaseQueries.length,
    }
    if (accepted.spans + accepted.errors + accepted.databaseQueries > 0) {
      sequence += 1
      broadcast('telemetry', {
        type: 'telemetry',
        sequence,
        accepted,
        time: now,
      })
    }
    sendJson(
      response,
      202,
      { ok: true, accepted, serverTime: now },
      { 'x-nextscope-sequence': String(sequence) },
    )
  }

  const handleSse = (request: IncomingMessage, response: ServerResponse): void => {
    if (sseClients.size >= MAX_SSE_CLIENTS) {
      sendError(response, 429, 'Too many live dashboard connections')
      return
    }
    response.writeHead(200, {
      ...securityHeaders(),
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    response.write(
      `event: ready\ndata: ${JSON.stringify({ type: 'ready', sequence, time: Date.now() })}\n\n`,
    )
    const client: SseClient = { res: response }
    sseClients.add(client)
    request.on('close', () => {
      sseClients.delete(client)
    })
  }

  const handleApi = async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<void> => {
    const pathname = url.pathname
    if (pathname === '/api/ping') {
      sendJson(response, 200, {
        ok: true,
        name: 'nextscope',
        version: options.version ?? VERSION,
      })
      return
    }
    if (pathname === '/api/stream') {
      if (!isReadAuthorized(request)) {
        sendError(response, 401, 'Unauthorized')
        return
      }
      handleSse(request, response)
      return
    }
    if (!isReadAuthorized(request)) {
      serverStats.rejectedRequests += 1
      sendError(response, 401, 'Unauthorized')
      return
    }

    if (pathname === '/api/health') {
      sendJson(response, 200, getHealth())
      return
    }
    if (pathname === '/api/summary') {
      const payload: OverviewResponse = {
        health: getHealth(),
        summary: store.summary(options.config.slowRequestMs),
      }
      sendJson(response, 200, payload)
      return
    }
    if (pathname === '/api/config') {
      sendJson(response, 200, {
        config: options.config,
        projectName: options.projectName,
        version: options.version ?? VERSION,
        limitations: [
          'Next.js built-in spans are limited to the operations Next.js exposes through OpenTelemetry.',
          'Server Components are not individually traced; route render spans are captured instead.',
          'Server Actions are not automatically identified by name.',
          'Drizzle Logger does not expose query duration; durations are null for Drizzle queries.',
          'Edge Runtime and production deployments are not supported in v0.1.',
        ],
      })
      return
    }
    if (pathname === '/api/requests') {
      sendJson(
        response,
        200,
        store.listRequests(filtersFromSearch(url.searchParams), options.config.slowRequestMs),
      )
      return
    }
    if (pathname.startsWith('/api/requests/')) {
      const traceId = pathname.slice('/api/requests/'.length)
      if (!/^[0-9a-f]{32}$/i.test(traceId)) {
        sendError(response, 400, 'Invalid trace id')
        return
      }
      const detail = store.getRequest(traceId, options.config.slowRequestMs)
      if (!detail) {
        sendError(response, 404, 'Request not found')
        return
      }
      sendJson(response, 200, detail)
      return
    }
    if (pathname === '/api/traces') {
      const result: TraceListResult = store.listTraces(
        filtersFromSearch(url.searchParams),
        options.config.slowRequestMs,
      )
      sendJson(response, 200, result)
      return
    }
    if (pathname.startsWith('/api/traces/')) {
      const traceId = pathname.slice('/api/traces/'.length)
      if (!/^[0-9a-f]{32}$/i.test(traceId)) {
        sendError(response, 400, 'Invalid trace id')
        return
      }
      const detail = store.getTrace(traceId, options.config.slowRequestMs)
      if (!detail) {
        sendError(response, 404, 'Trace not found')
        return
      }
      sendJson(response, 200, detail)
      return
    }
    if (pathname === '/api/errors') {
      const result = store.listErrors(errorFiltersFromSearch(url.searchParams))
      const payload: ErrorListResponse = {
        items: result.items,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        groups: result.groups,
      }
      sendJson(response, 200, payload)
      return
    }
    if (pathname.startsWith('/api/errors/')) {
      const id = decodeURIComponent(pathname.slice('/api/errors/'.length))
      if (!id || id.length > 128) {
        sendError(response, 400, 'Invalid error id')
        return
      }
      const detail = store.getError(id, options.config.slowRequestMs)
      if (!detail) {
        sendError(response, 404, 'Error not found')
        return
      }
      const payload: ErrorDetailResponse = detail
      sendJson(response, 200, payload)
      return
    }
    if (pathname === '/api/database') {
      const result: PageResult<DatabaseQueryListItem> = store.listDatabaseQueries(
        databaseFiltersFromSearch(url.searchParams),
      )
      sendJson(response, 200, result)
      return
    }
    if (pathname === '/api/export') {
      const data = store.exportAll()
      const payload: ExportResponse = {
        format: 'nextscope-export',
        version: 1,
        exportedAt: Date.now(),
        projectName: options.projectName,
        collectorVersion: options.version ?? VERSION,
        config: options.config,
        spans: data.spans,
        errors: data.errors,
        databaseQueries: data.databaseQueries,
        stats: {
          requests: store.summary(options.config.slowRequestMs).totalRequests,
          errors: data.errors.length,
          databaseQueries: data.databaseQueries.length,
          spans: data.spans.length,
        },
        limitations: [
          'Bodies, headers, cookies and SQL bind parameters are not stored.',
          'Drizzle Logger does not expose query duration.',
          'Edge Runtime is not supported in v0.1.',
        ],
      }
      sendJson(response, 200, payload, {
        'content-disposition': `attachment; filename="nextscope-${options.projectName.replace(/[^a-z0-9_-]+/gi, '-')}-${Date.now()}.json"`,
      })
      return
    }
    sendError(response, 404, 'Not found')
  }

  const requestHandler = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    response.setHeader('x-nextscope', options.version ?? VERSION)
    if (!hostAllowed(request.headers.host)) {
      serverStats.rejectedRequests += 1
      sendError(response, 403, 'Invalid Host header')
      return
    }
    const origin = request.headers.origin
    if (origin && !originAllowed(origin, port)) {
      serverStats.rejectedRequests += 1
      sendError(response, 403, 'Cross-origin requests are not allowed')
      return
    }
    if (request.headers['sec-fetch-site'] === 'cross-site') {
      serverStats.rejectedRequests += 1
      sendError(response, 403, 'Cross-site requests are not allowed')
      return
    }
    const url = new URL(request.url ?? '/', `http://${host}:${port}`)
    try {
      if (url.pathname === '/__nextscope/v1/ingest') {
        if (request.method !== 'POST') {
          response.setHeader('allow', 'POST')
          sendError(response, 405, 'Method not allowed')
          return
        }
        await handleIngest(request, response)
        return
      }
      if (url.pathname.startsWith('/api/')) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.setHeader('allow', 'GET, HEAD')
          sendError(response, 405, 'Method not allowed')
          return
        }
        await handleApi(request, response, url)
        if (request.method === 'HEAD') request.resume()
        return
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('allow', 'GET, HEAD')
        sendError(response, 405, 'Method not allowed')
        return
      }
      const served = await serveStatic(url.pathname, request, response, true)
      if (!served) {
        if (url.pathname.includes('.')) {
          sendError(response, 404, 'Asset not found')
        } else {
          sessionForRequest(request, response)
          await serveIndex(response, true)
        }
      }
    } catch (error) {
      log(
        `collector request failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      if (!response.headersSent) {
        sendError(response, 500, 'Internal collector error')
      } else {
        response.destroy()
      }
    }
  }

  const server = createServer((request, response) => {
    void requestHandler(request, response)
  })
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  server.keepAliveTimeout = 5_000

  const maxPortAttempts = options.autoPort === false ? 1 : 25
  let lastError: unknown = null
  let actualPort: number | null = null
  for (let attempt = 0; attempt < maxPortAttempts; attempt += 1) {
    try {
      actualPort = await listen(server, port, host)
      break
    } catch (error) {
      lastError = error
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
      if (port === 0) throw error
      port += 1
    }
  }
  if (actualPort === null) {
    throw new Error(
      `Could not find an available dashboard port near ${options.port}: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    )
  }
  port = actualPort
  dashboardUrl = `http://${host === '127.0.0.1' ? '127.0.0.1' : host}:${port}`

  let closing = false
  const close = async (): Promise<void> => {
    if (closing) return
    closing = true
    clearInterval(heartbeatInterval)
    for (const client of sseClients) {
      try {
        client.res.write(
          `event: shutdown\ndata: ${JSON.stringify({ type: 'shutdown', time: Date.now() })}\n\n`,
        )
        client.res.end()
      } catch {
        // Ignore clients that already disconnected.
      }
    }
    sseClients.clear()
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        server.closeAllConnections()
        resolve()
      }, 2_000)
      timeout.unref()
      server.close(() => {
        clearTimeout(timeout)
        resolve()
      })
      server.closeIdleConnections()
    })
    store.clear()
    sessions.clear()
    connections.clear()
  }

  return {
    port,
    url: dashboardUrl,
    token: options.token,
    store,
    health: getHealth,
    close,
  }
}
