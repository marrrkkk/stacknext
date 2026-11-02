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

The package is ESM-only and requires Node.js 20.9 or newer. `drizzle-orm` is an
optional peer dependency.

License: MIT.
