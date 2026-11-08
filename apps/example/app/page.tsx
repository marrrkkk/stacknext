import Link from 'next/link'
import { Badge, Card, PageHeader, Progress, Stat, StatStrip } from '@/components/ui'
import { CopyButton } from '@/components/CopyButton'
import { ResetDemoButton } from '@/components/ResetDemoButton'
import { Icon } from '@/components/Icon'
import { DASHBOARD_URL, DEV_COMMAND } from '@/lib/config'
import { DEMO_GROUPS, type DemoRoute } from '@/lib/demo-routes'
import { listProjects, listRecentTasks, workspaceSummary } from '@/lib/queries'
import type { TaskStatus } from '@/lib/schema'

export const dynamic = 'force-dynamic'

const FEATURED_IDS = ['slow', 'n-plus-one', 'error', 'action-success']

const STATUS_TONE: Record<TaskStatus, 'good' | 'warn' | 'muted'> = {
  done: 'good',
  doing: 'warn',
  todo: 'muted',
}

const ALL_ROUTES = DEMO_GROUPS.flatMap((group) => group.routes)
const FEATURED = FEATURED_IDS.map((id) => ALL_ROUTES.find((route) => route.id === id)).filter(
  (route): route is DemoRoute => route !== undefined,
)

export default function HomePage(): React.ReactElement {
  const projects = listProjects()
  const summary = workspaceSummary(projects)
  const recent = listRecentTasks(5)
  const dashboardHost = new URL(DASHBOARD_URL).host

  return (
    <>
      <PageHeader
        eyebrow="StackNext example"
        title="A small app with real telemetry"
        description="A local task tracker backed by Drizzle and SQLite. Every render, query, action and failure here becomes a span in the StackNext dashboard — with no account, cloud service or outbound telemetry."
        actions={<ResetDemoButton />}
      />

      <StatStrip>
        <Stat label="Projects" value={summary.projects} hint="Seeded into local SQLite" />
        <Stat
          label="Tasks"
          value={summary.tasks}
          hint={`${summary.open} still open`}
          tone={summary.open > 0 ? 'warn' : 'good'}
        />
        <Stat
          label="Completion"
          value={`${summary.completion}%`}
          hint="Across all projects"
          tone="good"
        />
        <Stat
          label="Demo paths"
          value={ALL_ROUTES.length}
          hint="Request, database, error and action examples"
        />
      </StatStrip>

      <div className="split">
        <Card
          title="Start here"
          subtitle="Three steps from a fresh checkout to a populated dashboard."
        >
          <ol className="steps">
            <li>
              <strong>Start the local collector.</strong>
              <p>
                Run this from <code>apps/example</code>. It starts the dashboard on{' '}
                <code>{dashboardHost}</code> and instruments this app.
              </p>
              <div className="command">
                <code>{DEV_COMMAND}</code>
                <CopyButton value={DEV_COMMAND} label="Copy command" small />
              </div>
            </li>
            <li>
              <strong>Generate a sample.</strong>
              <p>
                Open <Link href="/scenarios">Demo scenarios</Link> and run the one-click
                traffic sample, or click any route in this app.
              </p>
            </li>
            <li>
              <strong>Investigate the evidence.</strong>
              <p>
                Use the dashboard for traces, database shapes, errors and deterministic
                diagnostics. The CLI and MCP server expose the same sample.
              </p>
              <div className="button-row">
                <a
                  className="button button--primary button--small"
                  href={DASHBOARD_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open dashboard
                  <Icon name="external" size={12} />
                </a>
                <Link className="button button--secondary button--small" href="/scenarios">
                  Browse scenarios
                </Link>
              </div>
            </li>
          </ol>
        </Card>

        <div className="stack">
          <Card title="What gets captured" subtitle="Privacy is enforced in two layers.">
            <div className="stack stack--tight">
              <div className="runner__summary">
                <Badge tone="accent">Spans</Badge>
                <span className="muted">Request, route, fetch and database timing</span>
              </div>
              <div className="runner__summary">
                <Badge tone="accent">Queries</Badge>
                <span className="muted">Normalized SQL, never bind parameters</span>
              </div>
              <div className="runner__summary">
                <Badge tone="accent">Errors</Badge>
                <span className="muted">Redacted messages and stacks</span>
              </div>
              <div className="runner__summary">
                <Badge tone="accent">Findings</Badge>
                <span className="muted">Deterministic rules over this sample</span>
              </div>
            </div>
          </Card>
          <div className="banner banner--accent">
            <Icon name="info" size={16} className="banner__icon" />
            <div className="banner__body">
              <div className="banner__title">Nothing leaves this machine</div>
              URL query values, cookies, request bodies and SQL parameters are dropped
              before data reaches the store.
            </div>
          </div>
        </div>
      </div>

      <section className="stack">
        <div className="page-head">
          <div className="page-head__main">
            <h2 className="page-head__title">Featured scenarios</h2>
            <p className="page-head__description">
              Each one is a working route. Run it, then follow the evidence into StackNext.
            </p>
          </div>
          <Link className="button button--ghost button--small" href="/scenarios">
            All scenarios
            <Icon name="arrow-right" size={12} />
          </Link>
        </div>
        <div className="grid grid--2">
          {FEATURED.map((route) => (
            <article className="card" key={route.id}>
              <header className="card__header">
                <div className="card__heading">
                  <div className="card__title-row">
                    <span className="method">{route.method}</span>
                    <h3 className="card__title">{route.title}</h3>
                  </div>
                  <p className="card__subtitle mono">{route.path}</p>
                </div>
              </header>
              <div className="card__body">
                <p className="scenario__description">{route.description}</p>
                <p className="scenario__evidence">
                  <Icon name="info" size={13} />
                  {route.evidence}
                </p>
                <div className="button-row" style={{ marginTop: 12 }}>
                  <a
                    className="button button--secondary button--small"
                    href={route.path}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Run
                    <Icon name="external" size={11} />
                  </a>
                  <Link
                    className="button button--ghost button--small"
                    href={`/scenarios#${route.id}`}
                  >
                    Details
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="stack">
        <div className="page-head">
          <div className="page-head__main">
            <h2 className="page-head__title">Projects</h2>
            <p className="page-head__description">
              Server-rendered from two Drizzle queries. Open a project to add tasks.
            </p>
          </div>
          <Link className="button button--ghost button--small" href="/projects">
            View all
            <Icon name="arrow-right" size={12} />
          </Link>
        </div>
        <div className="grid grid--3">
          {projects.map((project) => {
            const progress = project.total === 0 ? 0 : Math.round((project.done / project.total) * 100)
            return (
              <Link className="project-card" key={project.id} href={`/projects/${project.id}`}>
                <div className="project-card__top">
                  <h3 className="project-card__title">{project.name}</h3>
                  <Badge tone={progress === 100 ? 'good' : 'muted'}>{progress}%</Badge>
                </div>
                <p className="project-card__description">{project.description}</p>
                <Progress
                  value={progress}
                  label={`${project.name}: ${progress}% complete`}
                  small
                />
                <div className="project-card__meta">
                  <span>{project.total} tasks</span>
                  <span>{project.todo} to do</span>
                  <span>{project.doing} doing</span>
                  <span>{project.done} done</span>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <Card
        title="Recently created"
        meta={`${recent.length} of ${summary.tasks} tasks`}
        padded={false}
      >
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Project</th>
                <th>Status</th>
                <th className="numeric">Priority</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((task) => {
                const project = projects.find((entry) => entry.id === task.projectId)
                return (
                  <tr key={task.id}>
                    <td className="task-title">{task.title}</td>
                    <td className="muted">{project?.name ?? `#${task.projectId}`}</td>
                    <td>
                      <Badge tone={STATUS_TONE[task.status]}>{task.status}</Badge>
                    </td>
                    <td className="numeric muted">{task.priority}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
