---
title: "@stacknext/drizzle"
description: Drizzle ORM query logging adapter for StackNext, without bind-parameter capture.
---

# @stacknext/drizzle

`@stacknext/drizzle` is a Drizzle `Logger` adapter. It sends redacted SQL events
to the active StackNext transport so queries appear in request timelines and
diagnostics.

## Who should read this

Applications using Drizzle. This is a **public, optional integration package**.
It is not required unless the project uses Drizzle.

## Installation

```bash
pnpm add @stacknext/drizzle
```

`drizzle-orm >=0.30.0` is an optional peer dependency. The adapter does not
import Drizzle at runtime; it accepts any object matching
`{ logQuery(query, params) }`.

## Usage

```ts
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createStackNextDrizzleLogger } from '@stacknext/drizzle'

export const db = drizzle(client, {
  logger: createStackNextDrizzleLogger({ databaseSystem: 'sqlite' }),
})
```

## API

### `createStackNextDrizzleLogger(options?)`

Returns a `DrizzleLoggerLike` with `logQuery(query, params)`.

`StackNextDrizzleLoggerOptions`:

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `databaseSystem` | string | `'sql'` | Value reported as `db.system.name`. |
| `transport` | `Pick<StackNextTransport, 'enqueueDatabaseQuery'>` | global transport | Override for tests or custom setups. |
| `onError` | `(error: unknown) => void` | none | Called when the telemetry sink throws. |

The instrumentation never throws into Drizzle. If no transport is active, the
logger is a no-op.

## What is recorded

- redacted SQL text (capped at 20,000 characters);
- inferred operation (`select`, `insert`, `update`, `delete`, `with`, and so
  on);
- active trace/span ids when a valid OTel context exists;
- `databaseSystem`, `success: true`, `source: 'drizzle'`;
- `db.query.parameter_count` (the count only);
- `db.duration.measured: false`.

## Duration is null

Drizzle's `Logger` interface does not expose query duration. StackNext stores
`durationMs: null` and marks it unmeasured. It is never converted to zero.

Do not compare Drizzle durations with Prisma durations or rank them as if they
were fast.

## Privacy

`params` is used only for `Array.isArray(params) ? params.length : 0`. The
values are never read, logged or transmitted. SQL text passes through
`redactSql`.

## Documentation map

- [Configuration](configuration.md)
- [Troubleshooting](troubleshooting.md)

## Related packages

- `@stacknext/core` owns the transport and redaction.
- `@stacknext/cli` runs the collector.
