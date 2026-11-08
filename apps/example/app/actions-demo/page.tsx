import { Badge, Card, PageHeader } from '@/components/ui'
import { CopyButton } from '@/components/CopyButton'
import { Icon } from '@/components/Icon'
import {
  createDemoTaskFormAction,
  failingAction,
  notFoundAction,
  redirectAction,
  revalidateFormAction,
} from '@/lib/demo-actions'

export const dynamic = 'force-dynamic'

const API_CASES = ['success', 'failure', 'redirect', 'not-found', 'revalidate', 'concurrent']

export default function ActionsDemoPage(): React.ReactElement {
  return (
    <>
      <PageHeader
        eyebrow="Instrumentation lab"
        title="Server Actions and custom spans"
        description="Successful Server Actions never reach Next.js onRequestError. Each action here is wrapped with withStackNextAction(), so success, failure and control flow appear in the same trace as the action request."
        actions={<Badge tone="accent">Wrapped actions</Badge>}
      />

      <div className="grid grid--2">
        <Card
          title="Successful action with FormData"
          subtitle="Returns a normalized value and records bounded attributes."
        >
          <form action={createDemoTaskFormAction} className="stack stack--tight">
            <div className="field">
              <label className="field__label" htmlFor="action-title">
                Task title
              </label>
              <input
                id="action-title"
                className="input"
                name="title"
                defaultValue="Ship instrumentation"
                maxLength={120}
              />
            </div>
            <div className="button-row">
              <button className="button button--primary button--small" type="submit">
                Run action
              </button>
            </div>
          </form>
          <p className="scenario__evidence">
            <Icon name="info" size={13} />
            Look for action/create-task and its nested normalize span in Traces.
          </p>
        </Card>

        <Card
          title="Revalidation"
          subtitle="revalidatePath('/actions-demo') inside a wrapped action."
        >
          <form action={revalidateFormAction}>
            <button className="button button--secondary button--small" type="submit">
              Revalidate this page
            </button>
          </form>
          <p className="scenario__evidence">
            <Icon name="info" size={13} />
            The action span completes normally; no error is recorded.
          </p>
        </Card>

        <Card
          title="Control flow"
          subtitle="redirect() and notFound() are not failures."
        >
          <div className="button-row">
            <form action={redirectAction}>
              <button className="button button--secondary button--small" type="submit">
                Redirect home
              </button>
            </form>
            <form action={notFoundAction}>
              <button className="button button--danger button--small" type="submit">
                Trigger notFound
              </button>
            </form>
          </div>
          <p className="scenario__evidence">
            <Icon name="info" size={13} />
            Both actions still produce spans, but neither is classified as an error.
          </p>
        </Card>

        <Card
          title="Failing action"
          subtitle="The message contains fake secrets that must be redacted."
        >
          <form action={failingAction}>
            <button className="button button--danger button--small" type="submit">
              Run failing action
            </button>
          </form>
          <p className="scenario__evidence">
            <Icon name="errors" size={13} />
            Errors shows [redacted] in place of the token and password values.
          </p>
        </Card>
      </div>

      <Card
        title="Drive the same actions over HTTP"
        subtitle="Useful for scripts, the e2e suite and MCP investigations."
      >
        <div className="stack stack--tight">
          {API_CASES.map((name) => {
            const command = `curl -s "http://127.0.0.1:4402/api/actions-demo?case=${name}"`
            return (
              <div className="command" key={name}>
                <code>{command}</code>
                <CopyButton value={command} label={`Copy ${name} command`} small />
              </div>
            )
          })}
        </div>
        <p className="scenario__evidence">
          <Icon name="info" size={13} />
          The failure case returns HTTP 500 by design. The concurrent case runs three
          wrapped actions in parallel.
        </p>
      </Card>
    </>
  )
}
