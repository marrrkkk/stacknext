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

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:330156cdeba17c62fdd7205ba9dfb6a1e4eeadd469e4d3cbdc5b72304a6c1817 -->

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4402' },
})
```

<!-- /coderabbit-ai-generated:v1 -->

```ts
// e2e/checkout.spec.ts
import { test, expect } from '@stacknext/playwright'

test('checkout completes', async ({ page }) => {
  await page.goto('/checkout')
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible()
})
```

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:7abbb61d09c1a8f57748d7bf54218ee490f41f98fa4dc39ad4aef8304527a5f6 -->

Set `use.baseURL` to your running app’s actual origin (the example app uses
`http://127.0.0.1:4402`). Run it through the CLI so the capture environment exists:

<!-- /coderabbit-ai-generated:v1 -->

```bash
stacknext capture --name baseline -- \
  pnpm exec playwright test --workers=1 --repeat-each=3
```

Running `playwright test` directly does not capture or compare anything.

## Exports

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:b5db70b760e7288ddbd50c6826a786bb63e51a6bb4cfbf97d44192f11f505f50 -->

| Export | Purpose |
| --- | --- |
| `test` | Playwright test with the auto `stacknextCapture` fixture. |
| `expect` | Re-exported Playwright expect. |
| `stackNextFixtures` | Exported function returning `{ test, expect }`. |
| `resolveCaptureConfig` | Reads and validates capture environment variables. |
| `CaptureTransportError` | Capture configuration/transport error. |
| `createTraceparent` | Creates a W3C trace context pair. |

<!-- /coderabbit-ai-generated:v1 -->

## Documentation map

- [Fixture](fixture.md) — annotations, identity and capture lifecycle.
- [Correlation](correlation.md) — injection, probing and verified samples.
- [Troubleshooting](troubleshooting.md) — missing samples and incomplete runs.

## Related packages

- `@stacknext/regression` owns scenario identity and sample schemas.
- `@stacknext/cli` starts the collector and writes run records.
- `@stacknext/next` receives the injected trace on the server.
