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

## Capture workflow

```bash
stacknext capture --name baseline -- \
  pnpm exec playwright test --workers=1 --repeat-each=3
stacknext baseline save <run-id> --name baseline
stacknext compare <baseline-id> <candidate-run-id>
```

Captured runs must use one Playwright worker. Use the explicit
`stacknext.scenario` annotation for stable identity. Running `playwright test`
directly does not capture or compare anything.

## Exports

| Export | Purpose |
| --- | --- |
| `test` | Playwright test with the auto `stacknextCapture` fixture. |
| `expect` | Re-exported Playwright expect. |
| `stackNextFixtures` | Returns `{ test, expect }`. |
| `resolveCaptureConfig` | Reads and validates capture environment variables. |
| `CaptureTransportError` | Capture configuration/transport error. |
| `createTraceparent` | Creates a W3C trace context pair. |

## Documentation

- [Package overview](docs/index.md)
- [Fixture](docs/fixture.md)
- [Correlation](docs/correlation.md)
- [Troubleshooting](docs/troubleshooting.md)

The `docs/` directory ships in the npm archive. Public guides live on the
[documentation site](https://github.com/marrrkkk/stacknext/tree/main/apps/docs).

## AI agents

Agents should not treat a captured run as a performance benchmark or a
statistical test. Read `docs/correlation.md` before explaining verification, and
keep ambiguous samples `inconclusive`.

## Development

```bash
pnpm --filter @stacknext/playwright build
pnpm --filter @stacknext/playwright typecheck
pnpm test
```

The package is ESM-only, requires Node.js 20.9 or newer, and has an optional
`@playwright/test` peer dependency (`>=1.40.0 <2`).

License: MIT.
