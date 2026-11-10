---
title: Server Actions
description: Record Server Action work explicitly with withStackNextAction.
---

Next.js Server Actions are POST requests that run an exported `'use server'`
function. StackNext can record them explicitly with `withStackNextAction()`,
but it does not infer every action from Next.js internals.

## Why a separate helper is needed

Next.js calls `onRequestError` for failures, not for successful actions. A
successful action that updates a row, revalidates a page and returns a value does
not produce an error event, so it would be invisible if StackNext relied only on
the error hook. The documented Next.js telemetry does not expose a stable
per-action name that StackNext can use without patching internals.

`withStackNextAction()` creates an explicit span with:

- the same active trace as the request;
- a stable name you choose;
- `stacknext.manual: true`;
- `stacknext.span.kind: "action"`.

The trace explorer classifies it as **app/custom**, and coverage reports it
under `custom.server-actions`. Failures captured by `onRequestError` remain
separate error records; a wrapped failure can therefore appear as both a failed
action span and a correlated error.

## Basic usage

```ts
'use server'

import { withStackNextAction } from '@stacknext/next'

export async function createTask(formData: FormData) {
  return withStackNextAction(
    'action/create-task',
    { attributes: { 'app.action': 'create-task' } },
    async (span) => {
      const title = formData.get('title')
      span.setAttribute('app.has_title', typeof title === 'string')
      span.setAttribute('app.title_length', typeof title === 'string' ? title.length : 0)

      const task = await db.insert(tasks).values({ title }).returning()
      revalidatePath('/tasks')
      return { ok: true, taskId: task[0].id }
    },
  )
}
```

The return value is returned unchanged. Attributes set inside the callback and
through the options object are sanitized by the exporter in the app process and
again by the collector.

Only pass derived, non-sensitive values. Do not send the `FormData` object,
field values, cookies, headers, file contents or raw request bodies as
attributes. StackNext never captures request bodies, and the action helper does
not change that.

## Failures

Thrown errors are recorded on the action span and rethrown unchanged:

```ts
export async function deleteTask(id: string) {
  return withStackNextAction('action/delete-task', async () => {
    const deleted = await deleteTaskById(id)
    if (!deleted) throw new Error('task not found')
    revalidatePath('/tasks')
    return { ok: true }
  })
}
```

The caller still sees the original error. Next.js may also call
`onRequestError`, producing a correlated error entry. Check the trace to see the
action span, the error and any failed query together.

## Redirects, `notFound()` and HTTP fallbacks

`redirect()`, `notFound()` and the App Router's HTTP fallback mechanism work by
throwing special control-flow objects. They are normal outcomes, not failures.
`withStackNextAction` rethrows them and does not mark the span as an error:

```ts
import { redirect } from 'next/navigation'
import { withStackNextAction } from '@stacknext/next'

export async function saveAndReturn(formData: FormData) {
  return withStackNextAction('action/save-and-return', async () => {
    await save(formData)
    revalidatePath('/settings')
    redirect('/settings?saved=1')
  })
}
```

Keep the redirect inside the callback. If you call it after the helper returns,
the action span has already ended and cannot represent the redirect path.

`notFound()` is handled the same way:

```ts
export async function openTask(id: string) {
  return withStackNextAction('action/open-task', async () => {
    const task = await findTask(id)
    if (!task) notFound()
    revalidatePath(`/tasks/${id}`)
    return task
  })
}
```

## Revalidation

`revalidatePath()` and `revalidateTag()` are ordinary calls and return normally.
Put them inside the action callback so their work stays within the action span:

```ts
export async function renameProject(id: string, formData: FormData) {
  return withStackNextAction('action/rename-project', async () => {
    await updateProjectName(id, String(formData.get('name') ?? ''))
    revalidatePath(`/projects/${id}`)
    revalidateTag('projects')
    return { ok: true }
  })
}
```

Revalidation itself is not a separate StackNext span. The action span covers the
application work you wrap; Next.js render spans appear separately if the action
triggers a render in the same request or a later navigation.

## Concurrency

Each call uses OpenTelemetry's active context, so concurrent actions do not share
a parent accidentally:

```ts
const results = await Promise.all(
  [0, 1, 2].map((index) =>
    withStackNextAction(`action/refresh-${index}`, () => refresh(index)),
  ),
)
```

The repository's tests exercise concurrent action calls and assert that each
span has the correct parent and trace id. There is no module-level "current
action" variable.

## What is not automatic

- **No automatic action naming.** Only exported actions you wrap have a named
  action span.
- **No argument or form capture.** Argument values, `FormData` entries, files
  and return values are not recorded automatically.
- **No browser/client tracing.** The span records server-side execution. The
  browser submission and client transition are outside StackNext.
- **No Edge support.** The helper is part of the Node.js runtime integration.
- **No guarantee that every failure is correlated.** Failures normally reach
  `onRequestError`; if an error escapes outside Next.js's error path, it may be
  missing or rely on route/time fallback correlation.

## Verification

The example app demonstrates the supported cases:

```bash
curl 'http://127.0.0.1:4402/api/actions-demo?case=success'
curl 'http://127.0.0.1:4402/api/actions-demo?case=failure'
curl 'http://127.0.0.1:4402/api/actions-demo?case=redirect'
curl 'http://127.0.0.1:4402/api/actions-demo?case=not-found'
curl 'http://127.0.0.1:4402/api/actions-demo?case=revalidate'
curl 'http://127.0.0.1:4402/api/actions-demo?case=concurrent'
```

Open the generated requests in the dashboard and check the trace timeline for the
action span. You can also run `stacknext coverage` and look for
`custom.server-actions`.

The success, failure, redirect, not-found, revalidation and concurrency cases
are covered by the end-to-end suite against a real Next.js app. See
[limitations](limitations.md) for the boundaries that remain.
