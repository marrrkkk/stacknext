import { Badge, Card, PageHeader } from '@/components/ui'
import { CopyButton } from '@/components/CopyButton'
import { Icon } from '@/components/Icon'
import { ScenarioRunner } from '@/components/ScenarioRunner'
import { DASHBOARD_URL } from '@/lib/config'
import { DEMO_GROUPS, type DemoCategory } from '@/lib/demo-routes'

export const dynamic = 'force-dynamic'

const INSPECT_PATH: Record<DemoCategory, string> = {
  requests: '/traces',
  database: '/database',
  errors: '/errors',
  spans: '/traces',
}

const INSPECT_LABEL: Record<DemoCategory, string> = {
  requests: 'Open traces',
  database: 'Open database',
  errors: 'Open errors',
  spans: 'Open traces',
}

export default function ScenariosPage(): React.ReactElement {
  return (
    <>
      <PageHeader
        eyebrow="Evidence map"
        title="Demo scenarios"
        description="Every route below is real, runs locally and produces a different kind of StackNext evidence. Run one at a time, or generate a complete sample in a single click."
      />

      <Card
        title="Generate a sample"
        subtitle="Sequential requests so the traces stay easy to read."
      >
        <ScenarioRunner dashboardUrl={DASHBOARD_URL} />
      </Card>

      <div className="banner banner--warn">
        <Icon name="errors" size={16} className="banner__icon" />
        <div className="banner__body">
          <div className="banner__title">The error routes fail on purpose</div>
          They use fake secrets (<code>super-secret-demo-token</code>,{' '}
          <code>hunter2</code>, <code>demo-url-secret</code>) so you can confirm that error
          messages, URL queries and attributes are redacted before storage.
        </div>
      </div>

      {DEMO_GROUPS.map((group) => (
        <section className="stack" key={group.id} aria-labelledby={`${group.id}-heading`}>
          <div className="page-head">
            <div className="page-head__main">
              <h2 className="page-head__title" id={`${group.id}-heading`}>
                {group.label}
              </h2>
              <p className="page-head__description">{group.description}</p>
            </div>
            <Badge tone="muted">{group.routes.length} routes</Badge>
          </div>

          <div className="scenario-list">
            {group.routes.map((route) => (
              <article className="scenario" id={route.id} key={route.id}>
                <div className="scenario__main">
                  <div className="scenario__title-row">
                    <span className="method">{route.method}</span>
                    <h3 className="scenario__title">{route.title}</h3>
                    {route.inTrafficRun && <Badge tone="accent">In sample</Badge>}
                  </div>
                  <p className="scenario__path">{route.path}</p>
                  <p className="scenario__description">{route.description}</p>
                  <p className="scenario__evidence">
                    <Icon name="info" size={13} />
                    {route.evidence}
                  </p>
                  <div className="scenario__curl">
                    <code>curl -s http://127.0.0.1:4402{route.path}</code>
                    <CopyButton
                      value={`curl -s http://127.0.0.1:4402${route.path}`}
                      label="Copy curl"
                      small
                    />
                  </div>
                </div>
                <div className="scenario__actions">
                  <a
                    className="scenario__link"
                    href={route.path}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Run route
                    <Icon name="external" size={11} />
                  </a>
                  <a
                    className="scenario__link"
                    href={`${DASHBOARD_URL}${route.inspectPath ?? INSPECT_PATH[route.category]}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {route.inspectLabel ?? INSPECT_LABEL[route.category]}
                    <Icon name="arrow-right" size={11} />
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <Card title="Useful commands" subtitle="The same sample through the CLI.">
        <div className="stack stack--tight">
          {[
            'pnpm exec stacknext diagnose',
            'pnpm exec stacknext coverage',
            'pnpm exec stacknext snapshot save --label "example sample"',
            'pnpm exec stacknext capture --name "example baseline" -- pnpm exec playwright test --workers=1 --repeat-each=3',
          ].map((command) => (
            <div className="command" key={command}>
              <code>{command}</code>
              <CopyButton value={command} label="Copy command" small />
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
