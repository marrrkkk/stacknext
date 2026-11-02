# @stacknext/playwright

Optional Playwright fixtures that correlate browser scenarios with verified
StackNext server traces.

```ts
import { stackNextFixtures } from '@stacknext/playwright'

const { test, expect } = stackNextFixtures()

test(
  'renders the overview',
  { annotation: { type: 'stacknext.scenario', description: 'app.overview' } },
  async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
  },
)
```

The fixture injects W3C trace context into loopback and `baseURL` requests and
is inert outside an active `stacknext capture` run. A sample is verified only
when the collector finds the injected trace and a server span parented to the
injected span id. There is no time-window fallback.

Captured runs must use one Playwright worker. The package is ESM-only, requires
Node.js 20.9 or newer, and has an optional `@playwright/test` peer dependency
(1.40 or newer).

License: MIT.
