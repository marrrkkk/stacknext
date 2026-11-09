---
title: "@stacknext/playwright"
description: Optional Playwright fixtures that correlate browser scenarios with StackNext server telemetry.
---

# @stacknext/playwright

`@stacknext/playwright` provides a drop-in Playwright `test` fixture. During
`stacknext capture`, it injects W3C trace context into browser requests, probes
the collector for the resulting server trace and submits verified samples for
the scenario.

## Who should read this

Teams using runtime regression testing. This is an **optional public
integration package**; projects that do not capture Playwright runs do not need
it.

## Installation

```bash
pnpm add -D @stacknext/playwright @playwright/test
```

`@playwright/test >=1.40.0 <2` is an optional peer dependency. The package is
inert outside an active capture run.

## Basic setup

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  workers: 1,
})
```

```ts
// e2e/checkout.spec.ts
import { test, expect } from '@stacknext/playwright'

test('checkout completes', async ({ page }) => {
  await page.goto('/checkout')
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible()
})
```

Run it through the CLI so the capture environment exists:

```bash
stacknext capture --name baseline -- \
  pnpm exec playwright test --workers=1 --repeat-each=3
```

Running `playwright test` directly does not capture or compare anything.

## Exports

| Export | Purpose |
| --- | --- |
| `test` | Playwright test with the auto `stacknextCapture` fixture. |
| `expect` | Re-exported Playwright expect. |
| `stackNextFixtures` | Fixture type export. |
| `resolveCaptureConfig` | Reads and validates capture environment variables. |
| `CaptureTransportError` | Capture configuration/transport error. |
| `createTraceparent` | Creates a W3C trace context pair. |

## Documentation map

- [Fixture](fixture.md) — annotations, identity and capture lifecycle.
- [Correlation](correlation.md) — injection, probing and verified samples.
- [Troubleshooting](troubleshooting.md) — missing samples and incomplete runs.

## Related packages

- `@stacknext/regression` owns scenario identity and sample schemas.
- `@stacknext/cli` starts the collector and writes run records.
- `@stacknext/next` receives the injected trace on the server.
