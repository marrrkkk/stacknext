---
title: Database integrations
description: Choose and configure the Drizzle or Prisma adapter without capturing SQL bind parameters.
---

StackNext accepts query events from optional adapter packages. Both adapters
send SQL text after redaction and never send bind parameters.

| ORM | Package | Duration | Registration |
| --- | --- | --- | --- |
| Drizzle | `@stacknext/drizzle` | `null` (unmeasured) | Pass the logger to `drizzle()` |
| Prisma | `@stacknext/prisma` | Measured when Prisma provides it | Call `instrumentPrismaClient(client)` |

## Which package

Use `@stacknext/drizzle` when the app creates a Drizzle client and can supply a
`Logger`. Use `@stacknext/prisma` when the app uses Prisma query events.

Neither package is required for core telemetry, and neither is installed
transitively by `@stacknext/next`. Add only the adapter the app uses.

## Drizzle

```ts
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createStackNextDrizzleLogger } from '@stacknext/drizzle'

export const db = drizzle(client, {
  logger: createStackNextDrizzleLogger({ databaseSystem: 'sqlite' }),
})
```

Drizzle's logger does not expose duration. Queries appear with
`durationMs: null`; do not rank or average them as if they were fast.

## Prisma

```ts
import { PrismaClient } from '@prisma/client'
import { instrumentPrismaClient } from '@stacknext/prisma'

const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'query' }],
})

const stop = instrumentPrismaClient(prisma, {
  databaseSystem: 'postgresql',
})
```

The event-based `query` log level is required. `instrumentPrismaClient` is
idempotent for the same client and returns a stop function.

## Verification and limits

Make a request that queries the database, then check the **Database** page or:

```bash
pnpm exec stacknext coverage
```

`not-observed` means the current sample has no query evidence, not necessarily
that the adapter is broken. Query text is redacted; `$1`, `?` and literal
parameters are not captured. StackNext does not run SQL, `EXPLAIN` or index
analysis.

## Related

- [Drizzle package reference](../packages/drizzle/index)
- [Prisma package reference](../packages/prisma/index)
- [Configuration](../getting-started/configuration)
