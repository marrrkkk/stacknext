---
title: Installation
description: Install @stacknext/next safely without replacing existing instrumentation or monitoring.
---

# Installation

## Requirements

- Node.js `>=20.9.0`.
- Next.js 15 or 16 with the App Router.
- The Node.js runtime. Edge instrumentation is not supported.
- A local StackNext collector started by `stacknext dev`.

## Install

```bash
npm install --save-dev @stacknext/cli @stacknext/next
```

or:

```bash
pnpm add -D @stacknext/cli @stacknext/next
```

Install inside the Next.js application package, not at a monorepo root.

## Create the hook

```bash
npx stacknext init
```

If the project has no `instrumentation.ts`/`.js`, `init` writes one that:

1. runs only when `NEXT_RUNTIME === 'nodejs'`;
2. dynamically imports `@stacknext/next` so Edge bundling does not load Node-only
   modules;
3. calls `register()` and `onRequestError`.

The generated file is idempotent and recognized by `stacknext uninstall`.

## Preserve existing instrumentation

Never overwrite an existing hook that another monitoring tool owns. Add
StackNext inside it:

```ts
import {
  registerStackNext,
  onRequestError as stackNextOnRequestError,
} from '@stacknext/next'

export async function register() {
  await startExistingMonitoring()
  await registerStackNext()
}

// Only if the file does not already export an error hook.
export const onRequestError = stackNextOnRequestError
```

If `onRequestError` already exists, call
`stackNextOnRequestError(error, request, context)` inside it.

StackNext checks for an already-registered OpenTelemetry provider and leaves it
untouched. It does not create a second SDK when another APM is active.

## Environment

`stacknext dev` supplies:

| Variable | Purpose |
| --- | --- |
| `STACKNEXT_COLLECTOR_URL` | Loopback collector origin. |
| `STACKNEXT_TOKEN` | Bearer token for ingest. |
| `STACKNEXT_PROJECT_NAME` | Project name reported with telemetry. |
| `STACKNEXT_NEXT_VERSION` | Next.js version for environment checks. |
| `STACKNEXT_CAPTURE_FETCH` | `0` drops Next.js fetch spans. |
| `STACKNEXT_CAPTURE_ERRORS` | `0` disables the error hook. |
| `STACKNEXT_DEBUG` | `1` enables debug logs. |

Do not commit these values. The token lives in `.stacknext/run.json` with mode
`0600` and is generated per run.

## Verify

With `stacknext dev` running:

```bash
npx stacknext doctor
npx stacknext status
```

Then make one request and confirm `requests` and `spans` increase. If the
dashboard is empty, see [Troubleshooting](troubleshooting.md).
