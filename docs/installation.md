# Installation

StackNext is installed into the Next.js application you want to inspect. It does
not require an account, a hosted service or an AI provider.

## Before you install

- Node.js **20.9 or newer**. See the [compatibility matrix](compatibility.md) for
  the versions used in release validation.
- Next.js **15 or 16** with the **App Router** and the **Node.js runtime**.
  Edge runtime and the Pages Router are not supported.
- npm, pnpm, yarn or bun. npm and pnpm are the validated installers.

Install inside the application directory, not in a parent folder.

## Install the CLI and instrumentation package

npm:

```bash
npm install --save-dev stacknext @stacknext/next
```

pnpm:

```bash
pnpm add -D stacknext @stacknext/next
```

yarn:

```bash
yarn add -D stacknext @stacknext/next
```

bun:

```bash
bun add -d stacknext @stacknext/next
```

`stacknext` contains the CLI, collector and dashboard. `@stacknext/next` is the
instrumentation and OpenTelemetry exporter loaded by your app. The collector,
dashboard, diagnostics, regression and MCP packages are installed automatically
as dependencies of the CLI.

Add these only when you use the integration:

| Package | Purpose |
| --- | --- |
| `@stacknext/drizzle` | Drizzle query logger. `drizzle-orm` is an optional peer. |
| `@stacknext/prisma` | Prisma query event adapter. `@prisma/client` is an optional peer. |
| `@stacknext/playwright` | Playwright fixtures for runtime regression capture. `@playwright/test` is an optional peer. |

## Initialize the project

```bash
npx stacknext init
```

With pnpm:

```bash
pnpm exec stacknext init
```

`init` performs these checks and writes only what is missing:

1. It finds `package.json`, the Next.js version and `app/` or `src/app/`.
2. It creates `stacknext.config.json` with private (`0600`) permissions.
3. It creates `instrumentation.ts` for a TypeScript project, or
   `instrumentation.js` for a JavaScript project.
4. It detects Drizzle and Prisma and prints the adapter setup.
5. It reports whether `@stacknext/next` is declared. Pass `--install` to let the
   detected package manager install it.

`init` is idempotent. Running it again leaves valid files unchanged.

### Existing instrumentation is never overwritten

If the project already has an `instrumentation` file, `init` leaves it
untouched. Add the hook yourself:

```ts
import {
  registerStackNext,
  onRequestError as stackNextOnRequestError,
} from '@stacknext/next'

export async function register() {
  // Keep the existing monitoring setup.
  await registerStackNext()
}

// Only when the file does not already export an error hook:
export const onRequestError = stackNextOnRequestError
```

If `onRequestError` already exists, call `stackNextOnRequestError(error,
request, context)` inside it. StackNext yields to an existing OpenTelemetry
tracer provider instead of replacing it.

The generated hook checks `NEXT_RUNTIME === 'nodejs'` and imports StackNext
dynamically. Edge compilation must not load the Node.js transport.

## Start the collector and app

```bash
npx stacknext dev
```

Or with pnpm:

```bash
pnpm exec stacknext dev
```

`dev` starts the loopback collector, writes `.stacknext/run.json` with mode
`0600`, and runs your app's own `dev` script with the collector URL and token in
its environment. The dashboard URL is printed at startup and is usually
`http://127.0.0.1:4400`. If that port is busy, StackNext tries the next ports in
the configured range.

Use the dashboard and make a request to your app. Use `--open` to open the
dashboard in the default browser.

## Verify the installation

With `stacknext dev` running in another terminal:

```bash
npx stacknext status
npx stacknext doctor
npx stacknext coverage
npx stacknext diagnose
```

`doctor` is the first stop when the dashboard is empty. `coverage` describes
only what the current retention window observed; it is not a health score.

## Configuration

`stacknext.config.json` is created by `init` and read by `stacknext dev`. The
defaults and each field are documented in
[getting started](getting-started.md#configuration).

Keep these privacy settings at `false`; StackNext rejects attempts to capture
request headers, bodies or SQL bind parameters:

```json
{
  "privacy": {
    "captureHeaders": false,
    "captureRequestBodies": false,
    "captureSqlParameters": false,
    "redactSensitiveData": true
  }
}
```

## Database integrations

### Drizzle

```ts
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createStackNextDrizzleLogger } from '@stacknext/drizzle'

export const db = drizzle(client, {
  logger: createStackNextDrizzleLogger({ databaseSystem: 'sqlite' }),
})
```

Bind parameters are counted but never read. Drizzle's logger API does not expose
query duration, so StackNext reports `null`, not zero.

### Prisma

```ts
import { PrismaClient } from '@prisma/client'
import { instrumentPrismaClient } from '@stacknext/prisma'

const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'query' }],
})

const stop = instrumentPrismaClient(prisma, {
  databaseSystem: 'postgresql',
})
// Optional: call stop() during shutdown.
```

Query text is redacted and `params` are never read.

## Upgrading

1. Stop `stacknext dev` with SIGINT or SIGTERM.
2. Install the new versions with the same package manager.
3. Run `stacknext init` again. It preserves user-owned files and validates the
   existing config.
4. Run `stacknext doctor`, then `stacknext dev`.
5. Review the [changelog](../CHANGELOG.md) for behavior changes.

Upgrading packages does not delete `.stacknext/runs`, `.stacknext/baselines` or
`.stacknext/comparisons`. Those records are versioned and kept until you remove
them explicitly.

## Workspaces and monorepos

Install StackNext in the Next.js application package, not at the workspace root,
so the CLI can find that app's `package.json`, `dev` script and Next.js version.
In a pnpm workspace:

```bash
pnpm --filter ./apps/my-app add -D stacknext @stacknext/next
pnpm --filter ./apps/my-app exec stacknext init
pnpm --filter ./apps/my-app exec stacknext dev
```

## Removing StackNext

See [uninstall](uninstall.md) for the safe cleanup flow. `stacknext uninstall`
removes only generated files and leaves user-authored instrumentation and
configuration in place unless you explicitly ask for it to be removed.
