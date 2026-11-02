import Link from 'next/link'
import {
  createTaskFormAction,
  notFoundAction,
  redirectAction,
  revalidateFormAction,
} from '@/lib/demo-actions'

export const dynamic = 'force-dynamic'

export default function ActionsDemoPage(): React.ReactElement {
  return (
    <>
      <p className="eyebrow">Instrumentation demo</p>
      <h1>Server Actions and custom spans</h1>
      <p className="lede">
        Successful Server Actions never reach Next.js onRequestError. Each action
        below is wrapped with <code>withStackNextAction()</code>, so success,
        failure and control flow appear in the same trace as the action request.
      </p>

      <section className="panel">
        <div className="section-heading">
          <h2>Successful action with FormData</h2>
          <span className="muted">returns a value</span>
        </div>
        <form action={createTaskFormAction} className="button-row">
          <input
            name="title"
            defaultValue="Ship instrumentation"
            aria-label="Task title"
            className="input"
          />
          <button className="button button--primary" type="submit">
            Run action
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Revalidation</h2>
          <span className="muted">revalidatePath('/actions-demo')</span>
        </div>
        <form action={revalidateFormAction}>
          <button className="button" type="submit">
            Revalidate this page
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Control flow</h2>
          <span className="muted">redirect and notFound are not errors</span>
        </div>
        <div className="button-row">
          <form action={redirectAction}>
            <button className="button" type="submit">
              Redirect home
            </button>
          </form>
          <form action={notFoundAction}>
            <button className="button button--danger" type="submit">
              Trigger notFound
            </button>
          </form>
        </div>
      </section>

      <section className="panel panel--muted">
        <p className="hint">
          Use the CLI to drive every scenario:{' '}
          <code>/api/actions-demo?case=success|failure|redirect|not-found|revalidate|concurrent</code>.
        </p>
        <p className="hint">
          Custom spans are exercised by <Link href="/api/custom-work">/api/custom-work</Link>.
        </p>
      </section>
    </>
  )
}
