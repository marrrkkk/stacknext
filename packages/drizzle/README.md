# @stacknext/drizzle

Drizzle ORM query logging adapter for [StackNext](https://github.com/marrrkkk/stacknext).

```ts
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createStackNextDrizzleLogger } from '@stacknext/drizzle'

export const db = drizzle(client, {
  logger: createStackNextDrizzleLogger({ databaseSystem: 'sqlite' }),
})
```

Query text is redacted. Bind parameters are counted but never read or
transmitted. Drizzle's logger API does not expose query duration, so StackNext
reports `null` rather than zero.

## Options

`createStackNextDrizzleLogger(options?)` accepts:

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `databaseSystem` | string | `'sql'` | Value reported as `db.system.name`. |
| `transport` | `Pick<StackNextTransport, 'enqueueDatabaseQuery'>` | global transport | Override for tests or custom setups. |
| `onError` | `(error: unknown) => void` | none | Called when the telemetry sink throws. |

If no StackNext transport is active, the logger is a no-op. Telemetry failures
are caught; an `onError` callback must not throw.

## What is recorded

Redacted SQL, inferred operation, active trace/span ids, `databaseSystem`,
`success: true`, `source: 'drizzle'`, `db.query.parameter_count` and
`db.duration.measured: false`. Bind-parameter values are never read.

## Documentation

- [Package overview](docs/index.md)
- [Configuration](docs/configuration.md)
- [Troubleshooting](docs/troubleshooting.md)

The `docs/` directory ships in the npm archive. Public guides live on the
[documentation site](https://stack-next.mintlify.site).

## AI agents

Agents should treat Drizzle durations as unmeasured, not zero, and must not rank
them against measured Prisma durations. Read the installed package docs before
changing the adapter or explaining a query timeline.

## Development

```bash
pnpm --filter @stacknext/drizzle build
pnpm --filter @stacknext/drizzle typecheck
pnpm test
```

The package is ESM-only and requires Node.js 20.9 or newer. `drizzle-orm` is an
optional peer dependency (`>=0.30.0`).

License: MIT.
