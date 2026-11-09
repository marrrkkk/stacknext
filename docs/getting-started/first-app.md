---
title: Your first instrumented app
description: Add StackNext to an existing Next.js App Router app, including existing instrumentation and database adapters.
---

## Instrumentation file

For a new project, `stacknext init` generates `instrumentation.ts` (or `.js`)
with a Node-only dynamic import:

```ts
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const stacknext = await import('@stacknext/next')
  await stacknext.register()
}

export async function onRequestError(
  error: unknown,
  request: unknown,
  context: unknown,
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const stacknext = await import('@stacknext/next')
  stacknext.onRequestError(error, request, context)
}
```

The generated types are narrower than this sketch; use the file that `init`
writes rather than retyping it.

### Existing instrumentation

`init` never overwrites an existing `instrumentation.ts`. Add the imports and
call them inside the existing hooks:

```ts
import {
  registerStackNext,
  onRequestError as stackNextOnRequestError,
} from '@stacknext/next'

export async function register() {
  // Keep your existing monitoring setup.
  await registerStackNext()
}

// Only if you do not already export an error hook:
export const onRequestError = stackNextOnRequestError
```

If you already export `onRequestError`, forward errors inside that hook while
keeping its current behavior:

```ts
export async function onRequestError(
  error: unknown,
  request: unknown,
  context: unknown,
) {
  // Keep your existing error handling here.
  stackNextOnRequestError(error, request, context)
}
```

`registerStackNext()` yields to an already-registered OpenTelemetry provider
instead of replacing it. If another provider is active, StackNext may have no
exporter to attach to; `stacknext doctor` reports what it can observe.

## Database adapters

### Drizzle

Install the adapter in the app before adding the imports:

```bash
pnpm add @stacknext/drizzle
```

```ts
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createStackNextDrizzleLogger } from '@stacknext/drizzle'

export const db = drizzle(client, {
  logger: createStackNextDrizzleLogger({ databaseSystem: 'sqlite' }),
})
```

Bind parameters are counted but never sent. Drizzle's logger does not expose
duration, so queries have `durationMs: null`.

### Prisma

Install the adapter in the app before adding the imports:

```bash
pnpm add @stacknext/prisma
```

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

Call `stop()` during graceful shutdown. SQL text is redacted and `params` are
never read. Registration is idempotent for the same client.

## Custom spans and actions

```ts
import { withStackNextSpan, withStackNextSpanSync } from '@stacknext/next'

const project = await withStackNextSpan('project.load', () => loadProject(id))
const digest = withStackNextSpanSync('auth.hash', () => hash(input))
```

Wrap an exported action body with `withStackNextAction`. Successful Server
Actions are not inferred automatically; without the wrapper only failures that
reach Next.js's error hook appear. See [Server Actions](../server-actions).

## Verify

```bash
pnpm exec stacknext dev
```

While the dev process is running, use another terminal in the app directory:

```bash
pnpm exec stacknext status
pnpm exec stacknext coverage
```

If the app runs but no data appears, read
[troubleshooting](../troubleshooting). StackNext supports Next.js 15/16 App
Router on the Node.js runtime only.
