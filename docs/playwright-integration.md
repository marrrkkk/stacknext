# Playwright integration

`@stacknext/playwright` is an optional fixture package that connects Playwright
scenarios to the server traces they produced. It injects W3C trace context into
browser requests, waits for the corresponding collector traces, verifies the
parent relationship and submits the sample to the active capture run.

The package does not replace Playwright, capture screenshots or change test
assertions. Without an active `stacknext capture` run it is a no-op.

## Install

In the Next.js app:

```bash
pnpm add -D @stacknext/playwright @playwright/test
pnpm exec playwright install
```

The packages are currently workspace packages in the StackNext repository and
are not published to npm. In this repository, `@stacknext/playwright` is already
a dev dependency of `apps/example`.

The fixture requires `@playwright/test` 1.40 or newer and Node.js 20.9 or newer.
Use the same Playwright version for the app and the fixture.

## Configure Playwright

Correlation is verified per request, so captured runs must use one worker.
Disable optional artifacts; StackNext never reads them and they only add CI
noise.

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.STACKNEXT_APP_URL ?? 'http://127.0.0.1:4402',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
})
```

`baseURL` should be the origin the browser actually visits. The fixture injects
headers only for loopback URLs or for the origin in `baseURL`.

## Use the fixture and annotation

```ts
import { stackNextFixtures } from '@stacknext/playwright'

const { test, expect } = stackNextFixtures()

test.describe('Example runtime scenarios', () => {
  test(
    'renders the project overview',
    {
      annotation: {
        type: 'stacknext.scenario',
        description: 'example.overview',
      },
    },
    async ({ page }) => {
      await page.goto('/')
      await expect(
        page.getByRole('heading', { name: 'A small app with real telemetry' }),
      ).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
    },
  )

  test(
    'renders a project with its tasks',
    {
      annotation: {
        type: 'stacknext.scenario',
        description: 'example.project-detail',
      },
    },
    async ({ page }) => {
      await page.goto('/projects/1')
      await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible()
    },
  )

  test(
    'serves the N+1 query demo route',
    {
      annotation: {
        type: 'stacknext.scenario',
        description: 'example.n-plus-one',
      },
    },
    async ({ page }) => {
      await page.goto('/api/n-plus-one')
      await expect(page.locator('body')).toContainText('n-plus-one')
    },
  )
})
```

Use the `test` exported by `stackNextFixtures()`, not a separately imported
`test`, or the auto fixture will not be installed. `stackNextFixtures()` also
exports the Playwright `expect`.

The annotation is the preferred identity source. It is inherited by the test
and appears in `TestInfo.annotations`. Use one annotation per test. The first
annotation whose type starts with `stacknext` supplies the description. If none
is present, Playwright's stable test id is used, then file/title/project.

Changing the annotation creates a new scenario with no baseline. Renaming the
title or moving the test does not change an annotation-based scenario id.

## Capture

With the app started through `stacknext dev`:

```bash
pnpm exec stacknext capture \
  --name "example baseline" \
  --quiet --json \
  -- pnpm exec playwright test --workers=1 --repeat-each=3 \
  > baseline-capture.json
```

`stacknext capture` sets the run environment. Running `playwright test`
directly without `capture` leaves the fixture idle.

For a test-owned app, configure Playwright `webServer`; the server inherits the
capture environment (`STACKNEXT_TEST_RUN_ID`, collector URL and token):

```ts
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:4402',
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: 'http://127.0.0.1:4402' },
})
```

Then `stacknext capture -- pnpm exec playwright test --workers=1` starts an
ephemeral collector and lets Playwright start the app. Do not point the app at
one collector while the fixture submits to another.

## How correlation works

For each sample, the auto fixture:

1. Creates a random W3C `traceparent` with a 32-hex trace id and 16-hex injected
   span id.
2. Intercepts document, fetch and XHR requests. It injects the header only for
   loopback HTTP(S) URLs or the `baseURL` origin. Script, stylesheet, image and
   other resource requests are left alone.
3. Allows the test to finish normally.
4. Waits for the collector to return every injected document trace, polling at
   150 ms after an initial settle delay.
5. Submits the browser result, duration, retry/repeat index and up to 20 trace
   references to `POST /api/test-runs/:id/samples`.

The collector then:

1. Looks up each trace in the current bounded store.
2. Checks the trace id.
3. Checks that at least one server span names the injected span id as its
   parent.
4. Converts only verified traces into stored evidence.
5. Marks the sample `incomplete` if any submitted trace is missing or fails the
   parent check.

A matching trace id alone is not accepted. There is no time-window guess, no
"nearest request" fallback and no synthetic sample. A trace with no server span
parented to the injected span is incomplete, not verified.

A document request made by the test is always submitted, even when its trace is
missing, so missing document telemetry makes the sample incomplete. Optional
fetch and XHR traces are included only when the collector finds them.

## Environment variables

`stacknext capture` sets the first five variables for its child process. You
normally do not set them yourself.

| Variable | Default | Purpose |
| --- | --- | --- |
| `STACKNEXT_TEST_RUN_ID` | none | Activates capture. Must match `run-<16 hex>`. |
| `STACKNEXT_COLLECTOR_URL` | none | Loopback collector origin. |
| `STACKNEXT_TOKEN` | none | Collector bearer token. |
| `STACKNEXT_CAPTURE` | unset by fixture | Marker set by `capture`; useful in Playwright config. |
| `STACKNEXT_PROJECT_NAME` | none | Informational project name for the child. |
| `STACKNEXT_CAPTURE_SETTLE_MS` | `500` | Initial wait before probing traces. |
| `STACKNEXT_CAPTURE_TIMEOUT_MS` | `5000` | Maximum wait for document traces. |

The collector URL must be `http://127.0.0.1`, `http://localhost` or the IPv6
loopback form. HTTPS and non-loopback URLs are rejected.

## What a sample stores

A sample contains:

- scenario identity (id, source, title, file, project, tags);
- Playwright status, expected status, retry and repeat index;
- sample duration and capture time;
- correlation status and reasons;
- up to 20 verified traces with stable keys, durations and bounded spans,
  queries and errors;
- deduplicated diagnostic finding references.

It does not contain browser storage, request/response bodies, headers, cookies,
URL query values, SQL bind parameters, screenshots, video or Playwright trace
archives.

## Retries and sample counts

Playwright retries are recorded (`retry`, `repeatEachIndex`, status), but the
comparison only uses verified samples. A flaky test that only passes on retry
still leaves failed samples in the run and can make the comparison
inconclusive.

Recommended:

- deterministic scenarios with explicit waits on visible UI;
- `retries: 0` for captured runs;
- `--repeat-each=3` or more;
- `--workers=1`;
- warm routes before capturing a baseline;
- no shared mutable state between tests.

## Troubleshooting incomplete samples

| Symptom | Likely cause | Check |
| --- | --- | --- |
| `no-request-trace-recorded` | The test made no document/fetch/XHR request to the app, or the fixture was not installed. | Use the fixture `test`; navigate to the app. |
| `trace-not-found` | The collector never received the trace, or retention dropped it. | Confirm the app uses the same collector URL/token; check `/api/health` drops. |
| `injected-parent-not-found` | The app or proxy stripped `traceparent`, StackNext is not registered, or another OTel provider owns the trace root. | Run `stacknext doctor`; confirm `instrumentation.ts`; check for a competing APM. |
| `no-verified-traces` | The trace exists but no server span uses the injected parent. | Inspect the trace in the dashboard and the Next.js/StackNext version. |
| Timeout waiting for traces | The server trace arrived after the capture timeout. | Increase `STACKNEXT_CAPTURE_TIMEOUT_MS`; check dev-server startup latency. |
| Incomplete only on first run | The route was cold or the app was still compiling. | Warm routes and wait for the dev server before testing. |
| Non-loopback URL not injected | The app uses a non-loopback origin that is not `baseURL`. | Use a loopback `baseURL` or the app's actual origin. |

Parallel workers are not supported for captured runs. Two concurrent requests
can share timing characteristics, but correlation is per injected trace; the
current capture protocol has only been verified with one worker. Keep
`workers: 1` until parallel correlation is explicitly documented as supported.

## Security and privacy

- The fixture talks only to a loopback collector over HTTP.
- The bearer token is read from the environment and is never written into a
  test result, sample or comparison.
- Injected `traceparent` values are random and contain no user or machine
  identifiers.
- Scenario and trace keys are normalized and sanitized before storage.
- The fixture is optional and runs no network code when capture is inactive.

See [privacy](privacy.md) and [regression testing](regression-testing.md).
