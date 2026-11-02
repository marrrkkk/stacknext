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
overwritten; call `registerStackNext()` from your own
`register()` hook instead. StackNext yields to an already-registered
OpenTelemetry provider rather than replacing it.

Optional helpers keep application work in the same trace:

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

Helpers are no-ops without an active OpenTelemetry provider. The package is
ESM-only, supports Next.js 15 and 16 on the Node.js runtime, and requires
Node.js 20.9 or newer.

License: MIT.
