---
title: Transport
description: The bounded, asynchronous loopback transport shared by instrumentation and database adapters.
---

# Transport

`@stacknext/core/transport` implements the process-wide queue that carries
telemetry from the application to the local collector. Instrumentation never
blocks a request on network I/O: spans, errors and queries are enqueued and
flushed on timers.

## Configuration from the environment

```ts
import {
  getStackNextTransport,
  isLoopbackUrl,
  transportOptionsFromEnv,
} from '@stacknext/core/transport'

const resolved = transportOptionsFromEnv()
if ('options' in resolved) {
  const transport = getStackNextTransport(resolved.options)
}
```

`transportOptionsFromEnv()` reads:

| Variable | Required | Meaning |
| --- | --- | --- |
| `STACKNEXT_COLLECTOR_URL` | Yes | Loopback collector origin, for example `http://127.0.0.1:4400`. |
| `STACKNEXT_TOKEN` | Yes | Bearer token, at least 16 characters. |
| `STACKNEXT_PROJECT_NAME` | No | Project name reported to the collector. |
| `STACKNEXT_SERVICE_NAME` | No | Service name used in span summaries. |
| `STACKNEXT_NEXT_VERSION` | No | Next.js version used for environment snapshots. |
| `STACKNEXT_DEBUG` | No | Set to `1` for transport debug logs. |

If both required variables are absent, the transport is disabled and
instrumentation is inert. That is intentional: the same production build can
run without a local collector. If only one is present, or the URL is not
loopback, configuration fails with a clear error instead of silently sending
data elsewhere.

`isLoopbackUrl()` accepts `http` or `https` URLs whose hostname is `127.0.0.1`,
`localhost`, `[::1]` or `::1`, and rejects embedded credentials.

## Options

```ts
interface StackNextTransportOptions {
  collectorUrl: string
  token: string
  serviceName?: string
  projectName?: string
  nextVersion?: string
  instanceId?: string
  maxQueueSize?: number
  batchSize?: number
  flushIntervalMs?: number
  requestTimeoutMs?: number
  heartbeatIntervalMs?: number
  debug?: boolean
}
```

The queue is bounded. Its default capacity is 5,000 events, the batch size is
250, the heartbeat interval is 10 seconds and one ingest request is capped at
1.5 MB. When the queue is full the oldest queued events are dropped; the
exporter reports drop counters through `diagnostics`.

## Shared instance

`getStackNextTransport(options?)` returns one transport per process and caches
it globally. The Next.js exporter and the Drizzle/Prisma adapters therefore
share one queue instead of creating competing buffers. Calling it without
options resolves the environment configuration.

A different collector URL, token or service name creates a new transport and
shuts down the previous one. Adapters should call
`getStackNextTransport()` without options so they attach to the active instance.

`resetGlobalTransportForTests()` detaches the global transport. It is a test
helper and does not export queued data.

## Ingest request

The transport sends `POST /__stacknext/v1/ingest` with:

```http
Authorization: Bearer <STACKNEXT_TOKEN>
Content-Type: application/json
```

The collector validates the envelope, redacts again and stores the data. Network
failures are retried on the next flush; a failed send never throws into the
application.

## Related

- [Schemas](schemas.md)
- [Redaction](redaction.md)
- [@stacknext/next instrumentation](../../next/docs/instrumentation.md)
