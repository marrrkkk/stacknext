---
title: Requirements
description: Supported Node.js, Next.js, runtime, package manager and local port requirements.
---

## Application

| Requirement | Supported |
| --- | --- |
| Framework | Next.js 15 or 16, App Router only |
| Runtime | Node.js runtime. Edge runtime is not supported |
| Node.js | 20.9 or newer. Runtime validation used Node.js 24; CI uses Node.js 22 |
| Package manager | npm, pnpm, yarn or bun. The StackNext repository pins `pnpm@12.16.1` |
| Database adapters | Optional; Drizzle or Prisma |
| Playwright | Optional; required only for captured regression scenarios |

`stacknext init` rejects a missing `app/` or `src/app/` directory and a Next.js
major below 15. A newer major prints a warning because it is outside the tested
range.

## Local ports

The collector and dashboard use `http://127.0.0.1:4400` by default and try the
next 25 loopback ports when it is busy. The example app listens on
`http://127.0.0.1:4402`. No remote host is accepted.

## Browsers and clients

The dashboard is a static React application served by the CLI. Any modern
browser works. MCP support is independent of the language model: the server is
local stdio and read-only. See [supported agents](../ai-agents/supported-agents).

## Repository development

Working on StackNext itself additionally needs:

```bash
pnpm install
pnpm exec playwright install chromium
pnpm build
```

See [contributing](../contributing/environment) for the full development setup
and [compatibility](../compatibility) for the recorded test matrix.
