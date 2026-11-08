'use server'

import { revalidatePath } from 'next/cache'
import { notFound, redirect } from 'next/navigation'
import { withStackNextAction, withStackNextSpan } from '@stacknext/next'

/**
 * Demo Server Actions for the example app. Successful actions do not call
 * Next.js onRequestError, so every export is wrapped with withStackNextAction to
 * make both success and failure visible in the same trace as the request.
 */
export async function createDemoTaskAction(formData: FormData): Promise<{
  ok: true
  title: string
  characters: number
}> {
  return withStackNextAction(
    'action/create-task',
    {
      attributes: {
        'app.action': 'create-task',
        // Deliberately sensitive: the helper must redact this before export.
        authorization: 'Bearer action-attribute-secret',
      },
    },
    async (span) => {
      const title = String(formData.get('title') ?? '').trim()
      span.setAttribute('app.form.fields', Array.from(formData.keys()).length)
      span.setAttribute('app.title.characters', title.length)
      const normalized = await withStackNextSpan('action/create-task.normalize', async () =>
        title.toUpperCase(),
      )
      return { ok: true, title: normalized, characters: normalized.length }
    },
  )
}

export async function failingAction(): Promise<never> {
  return withStackNextAction('action/failing', async () => {
    throw new Error(
      'Demo Server Action failure token=super-secret-demo-token and password=hunter2',
    )
  })
}

export async function redirectAction(): Promise<never> {
  return withStackNextAction('action/redirect', async () => {
    redirect('/?from=action')
  })
}

export async function notFoundAction(): Promise<never> {
  return withStackNextAction('action/not-found', async () => {
    notFound()
  })
}

export async function revalidateAction(): Promise<{ revalidated: true }> {
  return withStackNextAction('action/revalidate', async () => {
    revalidatePath('/actions-demo')
    return { revalidated: true }
  })
}

export async function concurrentAction(index: number): Promise<string> {
  return withStackNextAction(
    `action/concurrent-${index}`,
    { attributes: { 'app.action.index': index } },
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 10 + index * 5))
      return `action-${index}`
    },
  )
}

/**
 * Form actions must return void. These wrappers keep the value-returning
 * exports usable from API routes while forms still exercise the same wrapped
 * action span.
 */
export async function createDemoTaskFormAction(formData: FormData): Promise<void> {
  await createDemoTaskAction(formData)
}

export async function revalidateFormAction(): Promise<void> {
  await revalidateAction()
}
