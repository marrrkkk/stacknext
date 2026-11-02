# @stacknext/prisma

Prisma Client query instrumentation for [StackNext](https://github.com/marrrkkk/stacknext).

```ts
import { PrismaClient } from '@prisma/client'
import { instrumentPrismaClient } from '@stacknext/prisma'

const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'query' }],
})

const stop = instrumentPrismaClient(prisma, { databaseSystem: 'postgresql' })
```

Query text is redacted and bind parameters are never read. Registration is
idempotent for the same client and returns a cleanup function.

The package is ESM-only and requires Node.js 20.9 or newer. `@prisma/client` is
an optional peer dependency.

License: MIT.
