# Custom instrumentation

Next.js emits request, route and render spans, but it does not know which part
of your application is slow or important. `@stacknext/next` provides two helpers
for adding application spans to the same request trace:

```ts
import { withStackNextSpan, withStackNextSpanSync } from '@stacknext/next'

await withStackNextSpan('catalog.refresh', async () => {
  await refreshCatalog()
})

const digest = withStackNextSpanSync('auth.hash', () => hashPassword(input))
```

Both helpers are optional. They use the OpenTelemetry API and the provider
registered by `registerStackNext()`; they do not create a second SDK, exporter
or collector connection. If StackNext is inert (no token or collector URL), the
helpers are effectively no-ops through the OpenTelemetry no-op provider.

## Signatures

```ts
withStackNextSpan<T>(
  name: string,
  fn: (span: Span) => T | Promise<T>,
  options?: StackNextManualSpanOptions,
): Promise<T>

withStackNextSpan<T>(
  name: string,
  options: StackNextManualSpanOptions,
  fn: (span: Span) => T | Promise<T>,
): Promise<T>

withStackNextSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  options?: StackNextManualSpanOptions,
): T

withStackNextSpanSync<T>(
  name: string,
  options: StackNextManualSpanOptions,
  fn: (span: Span) => T,
): T
```

The async helper always awaits the callback and returns its value. The sync
helper preserves synchronous return values and exceptions exactly.

### Options

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `attributes` | `Record<string, unknown>` | `undefined` | Attributes passed through the normal sanitizer. |
| `kind` | OpenTelemetry `SpanKind` | `SpanKind.INTERNAL` | Use `SpanKind.CLIENT` for a database/HTTP client, `PRODUCER`/`CONSUMER` for queue work. |
| `recordException` | `boolean` | `true` | Record thrown errors as span exceptions and set the span status to error. Redirect/not-found control flow is never marked as an error. |

## What the helpers guarantee

- **Same trace.** The span is started with `startActiveSpan`, so it becomes the
  active OpenTelemetry context. Nested StackNext or OpenTelemetry spans parent
  correctly. If you call a helper outside any request context, it starts a new
  trace root.
- **Return values are preserved.** The callbacks may return a value, a promise
  or nothing. The helpers return or resolve with the same result.
- **Errors are preserved.** The original error is recorded on the span and
  rethrown unchanged. Callers can still use `try`/`catch` and error identity is
  not replaced.
- **Control flow is preserved.** App Router `redirect()`, `notFound()` and
  HTTP fallback errors use thrown digest objects. `withStackNextSpan` rethrows
  them without marking the span as failed. This is important for Server Actions.
- **Concurrency is isolated.** The active span comes from OpenTelemetry context,
  not a module-level variable. Concurrent requests and concurrent calls within
  one request do not cross-parent.
- **Attributes are sanitized centrally.** The exporter applies the same
  `sanitizeAttributes` used for Next.js spans: sensitive keys become
  `[redacted]`, URL values lose query strings and fragments, and unsupported
  value types are dropped. This runs before the collector's second redaction
  pass.
- **No blocking network I/O.** Span creation and ending are local. The existing
  bounded transport batches export in the background.
- **Explicit markers.** Helpers add `stacknext.manual: true` and
  `stacknext.span.kind: "custom"` (or `"action"`). The trace explorer uses these
  markers to classify app spans, and coverage counts them. The markers are set
  after caller attributes, so they cannot be spoofed accidentally.

## Examples

### Measure a route handler

```ts
import { withStackNextSpan } from '@stacknext/next'

export async function GET(): Promise<Response> {
  const projects = await withStackNextSpan(
    'projects.list',
    { attributes: { 'app.feature': 'projects', 'app.result_limit': 50 } },
    async () => listProjects(),
  )
  return Response.json({ projects })
}
```

### Measure a synchronous library call

```ts
import { SpanKind } from '@opentelemetry/api'
import { withStackNextSpanSync } from '@stacknext/next'

const digest = withStackNextSpanSync(
  'auth.hash-password',
  {
    kind: SpanKind.INTERNAL,
    attributes: { 'crypto.algorithm': 'scrypt' },
  },
  () => hashPassword(password),
)
```

### Measure a database driver

```ts
import { SpanKind } from '@opentelemetry/api'
import { withStackNextSpan } from '@stacknext/next'

const rows = await withStackNextSpan(
  'orders.query',
  {
    kind: SpanKind.CLIENT,
    attributes: {
      'db.system': 'postgresql',
      'db.operation': 'select',
    },
  },
  () => client.query('select * from orders where id = $1', [id]),
)
```

Do not put SQL bind parameters, connection strings, full URLs or request bodies
in attributes. StackNext is not a replacement for secure application logging.

### Measure a Server Component

```tsx
import { withStackNextSpan } from '@stacknext/next'

export default async function ProjectPage({ params }: Props) {
  const project = await withStackNextSpan(
    'project.load',
    { attributes: { 'app.project_route': '/projects/[id]' } },
    () => loadProject(params.id),
  )

  return <Project project={project} />
}
```

This measures the work you wrap. It does not make Next.js trace every Server
Component automatically, and it does not change caching or rendering behavior.

## Attributes and privacy

The helpers accept arbitrary attribute-shaped data, but not every value is
retained. The sanitizer handles the same rules as the rest of StackNext:

- header/cookie/authorization/password/token/secret-shaped keys are replaced;
- URL-like strings lose query strings and fragments;
- strings pass through text redaction and length caps;
- nested objects and unsupported types are dropped rather than serialized
  blindly.

Redaction is pattern-based. Prefer booleans, counts, enum values and route
templates over user data. Never pass form fields, request bodies, cookies,
authorization headers or raw SQL parameters.

## Operation boundaries

- **Do not wrap an entire request.** Next.js already creates the request root.
  Wrapping everything creates an overlapping parent and makes the timeline
  harder to read.
- **Do not sum overlapping spans.** A parent span already contains its children.
  Use the waterfall to compare work, not total time by adding durations.
- **Keep names stable and low-cardinality.** Use `catalog.refresh`, not
  `catalog.refresh?sku=...` or a user id. Names are redacted, but cardinality
  still hurts the explorer and retention window.
- **Use `withStackNextSpanSync` only for synchronous work.** Passing an async
  callback to the sync helper returns a promise without awaiting it, so the span
  can end before the work finishes.
- **Use the action helper for Server Actions.** `withStackNextAction` sets the
  action marker used by coverage and the trace explorer. See
  [Server Actions](server-actions.md).

## Coverage and the trace explorer

Custom spans appear in the request/trace waterfall as **app/custom** spans.
Coverage reports `custom.spans` as `observed` when at least one marked custom
span is in the sample, and `custom.server-actions` when action spans are present.
The two markers are separate: a generic custom span does not claim to be a
Server Action.

Manual spans are optional. If the evidence shows `custom.spans: unknown`, that
only means the sample contains no marked custom spans; it does not mean the
application is uninstrumented or unhealthy.
