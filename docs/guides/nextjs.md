---
title: Next.js integration
description: How StackNext registers with Next.js and which framework behavior it relies on.
---

StackNext uses the documented Next.js `instrumentation.ts` hook. It does not
patch Next.js internals and does not read `NEXT_PRIVATE_*` variables.

## Registration path

1. `stacknext dev` starts the collector and the project's `dev` script.
2. Next.js loads `instrumentation.ts` and calls `register()`.
3. `registerStackNext()` checks for an existing OpenTelemetry provider.
4. StackNext attaches a span processor and exporter when it owns the provider.
5. Documented Next.js spans are normalized and sent to the loopback collector.
6. `onRequestError` sends redacted request errors.

The generated instrumentation checks `NEXT_RUNTIME === 'nodejs'` and imports
`@stacknext/next` dynamically so Edge bundles do not pull Node-only modules.
Edge instrumentation is not supported even though the import is guarded.

## What is captured

- Documented `next.*` request, route, render, fetch, action and proxy spans.
- HTTP attributes and parent ids preserved from Next.js.
- Drizzle/Prisma query events when an adapter is registered.
- Errors passed to the Next.js error hook.
- Custom spans and wrapped actions from `@stacknext/next`.

Unknown span types remain as verbose evidence. They are not mapped to guessed
semantics. See the version-matched
[`@stacknext/next` docs](../packages/next/index).

## Supported versions

Next.js 15 and 16 with the App Router on the Node.js runtime. See
[compatibility](../compatibility) for the recorded matrix and known gaps.

## Existing OpenTelemetry setup

`registerStackNext()` yields to an already-registered provider. Keep your
existing exporter and call StackNext from the existing `register()` hook. If
your provider owns the pipeline, StackNext cannot add a second SDK; verify what
the collector receives with `stacknext status`.

## Related

- [Installation](../installation)
- [Instrumentation coverage](../instrumentation-coverage)
- [Custom instrumentation](../custom-instrumentation)
- [Server Actions](../server-actions)
- [Next.js package reference](../packages/next/index)
