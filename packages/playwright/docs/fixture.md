---
title: Fixture
description: How the auto stacknextCapture fixture identifies scenarios and submits samples.
---

# Fixture

Import `test` and `expect` from `@stacknext/playwright` instead of
`@playwright/test`. The `stacknextCapture` fixture is automatic; you do not add
it to the test signature.

## Capture lifecycle

1. `resolveCaptureConfig()` reads the capture environment.
2. If capture is inactive, the fixture is a no-op.
3. During the test, document/fetch/XHR requests to loopback or the configured
   `baseURL` origin receive a W3C `traceparent`.
4. After the test, the fixture waits for the collector to observe the traces.
5. It submits one sample with the Playwright status, duration, retry/repeat
   indices and verified trace references.

Skipped tests do not submit a sample. The fixture never replaces Playwright
assertions or changes the test result.

## Scenario identity

The preferred identity is an explicit annotation:

```ts
import { test, expect } from '@stacknext/playwright'

test('checkout completes', async ({ page }) => {
  test.info().annotations.push({
    type: 'stacknext.scenario',
    description: 'checkout-complete',
  })

  await page.goto('/checkout')
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible()
})
```

The fixture accepts any annotation whose type starts with `stacknext` and uses
its description. If none exists, identity falls back to the Playwright `testId`,
then file + title + project.

Keep the annotation stable. Changing it creates a new scenario with no matching
baseline.

## Capture environment

The fixture reads:

| Variable | Default | Meaning |
| --- | --- | --- |
| `STACKNEXT_TEST_RUN_ID` | required when active | Active `run-...` id. |
| `STACKNEXT_COLLECTOR_URL` | required when active | Loopback collector origin. |
| `STACKNEXT_TOKEN` | required when active | Collector bearer token. |
| `STACKNEXT_CAPTURE_SETTLE_MS` | 500 | Wait before the first probe. |
| `STACKNEXT_CAPTURE_TIMEOUT_MS` | 5000 | Probe deadline per sample. |

`stacknext capture` sets the required values. Do not set them by hand for a
normal captured run.

## Playwright configuration

- Use **one worker** for captured runs.
- Use at least three samples per scenario for a comparison
  (`--repeat-each=3`).
- Warm routes before capturing a baseline.
- Keep the test command short and deterministic.

## Exports

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:9b1d429fc146b7836cdccc75d58c560d2e60b18305797d98bcd9841b60c57664 -->

`stackNextFixtures()` is an exported function returning `{ test, expect }`. `resolveCaptureConfig()` returns a
`CaptureConfig` or `null`; it throws `CaptureTransportError` when capture is
active but the required values are invalid.

<!-- /coderabbit-ai-generated:v1 -->
