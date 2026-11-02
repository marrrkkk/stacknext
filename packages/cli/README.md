# stacknext

Local-first runtime debugging, diagnostics and Playwright regression testing for
Next.js App Router apps and AI coding agents.

StackNext collects OpenTelemetry spans plus Drizzle/Prisma query events and
Next.js errors over loopback, stores them in a bounded in-memory sample, and
exposes a dashboard, CLI and read-only MCP server. It also derives deterministic
diagnostic findings and compares Playwright-linked runtime captures against
saved baselines. No cloud account, hosted backend, AI API key or telemetry
upload.

## Quick start

```bash
npm install --save-dev stacknext @stacknext/next
npx stacknext init
npx stacknext doctor
npx stacknext dev
```

`init` detects Next.js 15/16 with the App Router, writes
`stacknext.config.json`, and creates `instrumentation.ts` (or
`instrumentation.js` for a JavaScript project) only when none exists. Existing
instrumentation is preserved and a manual hook is printed.
`dev` starts the loopback collector and the app's own `dev` script.

Add `@stacknext/drizzle`, `@stacknext/prisma`, or `@stacknext/playwright` only
when you use those integrations.

## Requirements

- Node.js 20.9 or newer
- Next.js 15 or 16, App Router, Node.js runtime
- Playwright 1.40+ for runtime regression capture

Next.js Edge runtime and the Pages Router are not supported. The package is
ESM-only. See the [project README](https://github.com/marrrkkk/stacknext#readme),
[getting started](https://github.com/marrrkkk/stacknext/blob/main/docs/getting-started.md)
and [compatibility matrix](https://github.com/marrrkkk/stacknext/blob/main/docs/compatibility.md).

License: MIT.
