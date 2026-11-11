# @stacknext/next

Next.js App Router instrumentation and OpenTelemetry exporter for
[StackNext](https://github.com/marrrkkk/stacknext).

```bash
npm install --save-dev @stacknext/cli @stacknext/next
npx stacknext init
npx stacknext dev
```

`stacknext init` creates `instrumentation.ts` (or `instrumentation.js` for a
JavaScript project) only when none exists. Existing instrumentation is never
overwritten; call `registerStackNext()` from your own `register()` hook instead.
StackNext yields to an already-registered OpenTelemetry provider rather than
replacing it.

## What it does

- registers a `NodeTracerProvider` with a `BatchSpanProcessor` and the StackNext
  exporter;
- installs a composite W3C propagator so an injected `traceparent` becomes the
  server trace root;
- forwards `onRequestError` through redaction and normalization;
- exports documented Next.js spans without patching internals;
- provides optional manual span and Server Action helpers.

`register()` is inert when `STACKNEXT_COLLECTOR_URL` and `STACKNEXT_TOKEN` are
absent. The package runs only on the Node.js runtime; the Edge export is inert
so Edge bundling stays safe.

## Manual helpers

```ts
import {
  withStackNextSpan,
  withStackNextSpanSync,
  withStackNextAction,
} from '@stacknext/next'

const project = await withStackNextSpan('project.load', () => loadProject(id))
const digest = withStackNextSpanSync('auth.hash', () => hash(input))
const result = await withStackNextAction('action/save-project', () => save(form))
```

Helpers are no-ops without an active OpenTelemetry provider. They preserve
return values and errors, sanitize attributes and do not create a second SDK.

## Documentation

- [Package overview](docs/index.md)
- [Installation](docs/installation.md)
- [Instrumentation](docs/instrumentation.md)
- [Configuration](docs/configuration.md)
- [Custom spans](docs/custom-spans.md)
- [Troubleshooting](docs/troubleshooting.md)

The `docs/` directory ships in the npm archive. Public guides live on the
[documentation site](https://stack-next.mintlify.site).

## AI agents

Agents should read the installed `docs/installation.md` and
`docs/instrumentation.md` before changing an app's `instrumentation.ts`. Never
overwrite an existing file; add the StackNext hook to the existing registration.
See the public
[Next.js integration guide](https://stack-next.mintlify.site/integrations/nextjs).

## Development

```bash
pnpm --filter @stacknext/next build
pnpm --filter @stacknext/next typecheck
pnpm test
```

The package is ESM-only, supports Next.js 15 and 16 on the Node.js runtime, and
requires Node.js 20.9 or newer.

License: MIT.
