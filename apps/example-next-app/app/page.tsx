import Link from 'next/link'
import { listProjects } from '@/lib/queries'
import { db } from '@/lib/db'
import { tasks } from '@/lib/schema'

export const dynamic = 'force-dynamic'

export default function HomePage(): React.ReactElement {
  const projects = listProjects()
  const recent = db.select().from(tasks).orderBy(tasks.createdAt).all().slice(-6).reverse()
  const total = projects.reduce((sum, project) => sum + project.total, 0)
  const done = projects.reduce((sum, project) => sum + project.done, 0)
  const progress = total === 0 ? 0 : Math.round((done / total) * 100)

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Demo workspace</p>
          <h1>Small app, real telemetry.</h1>
          <p className="lede">
            Tasklight is a tiny task tracker backed by Drizzle and SQLite. Every page render,
            query, slow request and failure on this app is available in your local StackNext
            dashboard.
          </p>
          <div className="button-row">
            <Link className="button button--primary" href="/api/projects">
              Hit the JSON API
            </Link>
            <Link className="button" href="/api/slow?delay=300">
              Generate a slow request
            </Link>
            <Link className="button button--danger" href="/api/error?token=demo-url-secret">
              Trigger an error
            </Link>
            <Link className="button" href="/actions-demo">
              Server Actions demo
            </Link>
            <Link className="button" href="/api/custom-work">
              Custom span demo
            </Link>
            <Link className="button" href="/api/n-plus-one">
              N+1 query demo
            </Link>
            <Link className="button" href="/api/slow-db">
              Slow DB span
            </Link>
            <Link className="button" href="/api/repeated-fetch">
              Repeated fetch demo
            </Link>
          </div>
        </div>
        <div className="hero-card">
          <div className="hero-card__label">Workspace progress</div>
          <div className="hero-card__value">{progress}%</div>
          <div className="progress" aria-label={`${progress}% of tasks complete`}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <dl className="hero-card__stats">
            <div>
              <dt>Projects</dt>
              <dd>{projects.length}</dd>
            </div>
            <div>
              <dt>Tasks</dt>
              <dd>{total}</dd>
            </div>
            <div>
              <dt>Open</dt>
              <dd>{total - done}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section>
        <div className="section-heading">
          <h2>Projects</h2>
          <span className="muted">Drizzle queries · server components</span>
        </div>
        <div className="project-grid">
          {projects.map((project) => (
            <Link key={project.id} className="project-card" href={`/projects/${project.id}`}>
              <div className="project-card__top">
                <h3>{project.name}</h3>
                <span className="count">{project.total} tasks</span>
              </div>
              <p>{project.description}</p>
              <div className="mini-progress">
                <span
                  style={{
                    width: `${project.total === 0 ? 0 : Math.round((project.done / project.total) * 100)}%`,
                  }}
                />
              </div>
              <div className="project-card__meta">
                <span>{project.todo} to do</span>
                <span>{project.doing} in progress</span>
                <span>{project.done} done</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="split">
        <div className="panel">
          <div className="section-heading">
            <h2>Recently created</h2>
            <span className="muted">from the tasks table</span>
          </div>
          <ul className="task-list">
            {recent.map((task) => (
              <li key={task.id}>
                <span className={`status status--${task.status}`}>{task.status}</span>
                <span className="task-list__title">{task.title}</span>
                <span className="task-list__project">
                  {projects.find((project) => project.id === task.projectId)?.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel panel--muted">
          <div className="section-heading">
            <h2>Try the inspector</h2>
          </div>
          <ol className="steps">
            <li>
              Open <code>http://127.0.0.1:4400</code>.
            </li>
            <li>Visit a project, hit a JSON endpoint or run a slow request.</li>
            <li>Watch traces, database queries and errors fill in live.</li>
            <li>
              Open <strong>Diagnostics</strong> or run <code>stacknext diagnose</code>.
            </li>
            <li>
              Ask an MCP client for <code>stacknext_list_diagnostics</code>.
            </li>
          </ol>
          <p className="hint">
            Query strings, cookies, request bodies and SQL parameters are never captured.
          </p>
        </div>
      </section>
    </>
  )
}
