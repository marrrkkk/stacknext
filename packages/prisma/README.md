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

Prisma must be configured to emit query events. Without the `log` event
configuration, the adapter receives nothing.

## Options

`instrumentPrismaClient(client, options?)` accepts:

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `databaseSystem` | string | `'prisma'` | Reported as `db.system.name`. |
| `transport` | `Pick<StackNextTransport, 'enqueueDatabaseQuery'>` | global transport | Override for tests or custom setups. |
| `onError` | `(error: unknown) => void` | none | Called when the sink throws. |

## What is recorded

Redacted SQL, inferred operation, `durationMs` when Prisma supplies a finite,
non-negative duration, active trace/span ids, `databaseSystem`,
`source: 'prisma'`, `success: true`, `db.duration.measured` and a bounded
`db.prisma.target` when present. Query parameters are never read.

## Documentation

- [Package overview](docs/index.md)
- [Configuration](docs/configuration.md)
- [Troubleshooting](docs/troubleshooting.md)

The `docs/` directory ships in the npm archive. Public guides live on the
[documentation site](https://github.com/marrrkkk/stacknext/tree/main/apps/docs).

## AI agents

Agents should read the installed package docs before changing the adapter.
Prisma durations are measured only when the client supplies them; do not infer
a duration from a timestamp or compare it with unmeasured Drizzle queries.

## Development

```bash
pnpm --filter @stacknext/prisma build
pnpm --filter @stacknext/prisma typecheck
pnpm test
```

The package is ESM-only and requires Node.js 20.9 or newer. `@prisma/client` is
an optional peer dependency (`>=5.0.0`).

License: MIT.
