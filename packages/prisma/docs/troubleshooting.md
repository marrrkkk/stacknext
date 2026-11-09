---
title: Troubleshooting
description: Diagnose missing Prisma query events, duplicate listeners and unmeasured durations.
---

# Troubleshooting

## No Prisma queries appear

1. Confirm `PrismaClient` is created with
   `log: [{ emit: 'event', level: 'query' }]`.
2. Confirm `instrumentPrismaClient(prisma, ...)` is called on that same client.
3. Confirm the app runs under `stacknext dev`.
4. Exercise a query, then check `stacknext coverage`.
5. Run `stacknext doctor` for adapter and config warnings.

## The listener is not attached

The adapter requires `client.$on('query', callback)`. A mock, a wrapper or a
different client type may not satisfy the structural contract. Use the real
Prisma Client.

## I called the adapter twice

It is idempotent for the same client. The second call returns a no-op cleanup
and does not attach another listener.

## Duration is null

The event duration was missing or not a finite number. StackNext never
fabricates a duration. Check the Prisma event payload and version.

## Queries are not linked to a request

Trace/span ids are recorded only when a valid OTel context is active. Queries
from scripts, workers or background jobs may have no request root.

## Params are missing

By design. `event.params` is never read, logged or transmitted. The redacted SQL
text is the only query body StackNext stores.

## Verify

```bash
stacknext status --json
stacknext coverage --json
stacknext diagnose --category database
```
