import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge, Card, PageHeader, Progress } from '@/components/ui'
import { Icon } from '@/components/Icon'
import { SubmitButton } from '@/components/SubmitButton'
import { advanceTaskAction, createTaskAction } from '@/lib/task-actions'
import { nextStatusLabel } from '@/lib/task-status'
import { getProject, listProjectTasks } from '@/lib/queries'
import type { TaskStatus } from '@/lib/schema'

export const dynamic = 'force-dynamic'

const PRIORITY_LABEL = ['High', 'Medium', 'Low']

const STATUS_TONE: Record<TaskStatus, 'good' | 'warn' | 'muted'> = {
  done: 'good',
  doing: 'warn',
  todo: 'muted',
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<React.ReactElement> {
  const { id } = await params
  const projectId = Number(id)
  if (!Number.isInteger(projectId) || projectId <= 0) notFound()

  const project = getProject(projectId)
  if (!project) notFound()

  const items = listProjectTasks(projectId)
  const done = items.filter((task) => task.status === 'done').length
  const progress = items.length === 0 ? 0 : Math.round((done / items.length) * 100)

  return (
    <>
      <PageHeader
        eyebrow={`Project #${project.id}`}
        title={project.name}
        description={project.description}
        actions={
          <Link
            className="button button--secondary button--small"
            href={`/api/projects/${project.id}/tasks`}
          >
            View JSON
            <Icon name="external" size={12} />
          </Link>
        }
      />

      <div className="stat-strip">
        <div className="stat">
          <div className="stat__label">
            <span className="stat__label-text">Progress</span>
          </div>
          <div className="stat__value">{progress}%</div>
          <Progress value={progress} label={`${project.name}: ${progress}% complete`} small />
        </div>
        <div className="stat">
          <div className="stat__label">
            <span className="stat__label-text">Tasks</span>
          </div>
          <div className="stat__value">{items.length}</div>
          <div className="stat__hint">In this project</div>
        </div>
        <div className="stat">
          <div className="stat__label">
            <span className="stat__label-text">In progress</span>
          </div>
          <div className="stat__value">{items.filter((task) => task.status === 'doing').length}</div>
          <div className="stat__hint">Next up</div>
        </div>
        <div className="stat">
          <div className="stat__label">
            <span className="stat__label-text">Open</span>
          </div>
          <div className="stat__value">{items.length - done}</div>
          <div className="stat__hint">Not completed</div>
        </div>
      </div>

      <div className="split">
        <Card title="Tasks" meta={`${items.length} total`} padded={false}>
          {items.length === 0 ? (
            <div className="empty">
              <h3 className="empty__title">No tasks yet</h3>
              <p className="empty__description">Add the first task with the form.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Created</th>
                    <th aria-label="Action" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((task) => (
                    <tr key={task.id}>
                      <td>
                        <span
                          className={
                            task.status === 'done'
                              ? 'task-title task-title--done'
                              : 'task-title'
                          }
                        >
                          {task.title}
                        </span>
                      </td>
                      <td>
                        <Badge tone={STATUS_TONE[task.status]}>{task.status}</Badge>
                      </td>
                      <td className="muted">{PRIORITY_LABEL[task.priority - 1] ?? 'Medium'}</td>
                      <td className="muted">{formatDate(task.createdAt)}</td>
                      <td>
                        <form action={advanceTaskAction}>
                          <input type="hidden" name="taskId" value={task.id} />
                          <SubmitButton
                            type="submit"
                            className="button button--ghost button--small"
                            title={`${nextStatusLabel(task.status)}: ${task.title}`}
                            pendingLabel="Updating…"
                          >
                            {nextStatusLabel(task.status)}
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="stack">
          <Card title="Add a task" subtitle="A real Server Action, wrapped for tracing.">
            <form action={createTaskAction} className="stack stack--tight">
              <input type="hidden" name="projectId" value={project.id} />
              <div className="field">
                <label className="field__label" htmlFor="task-title">
                  Task title
                </label>
                <input
                  id="task-title"
                  className="input"
                  name="title"
                  placeholder="e.g. Review the launch checklist"
                  maxLength={120}
                  required
                />
              </div>
              <div className="button-row">
                <SubmitButton
                  className="button button--primary button--small"
                  type="submit"
                  pendingLabel="Adding…"
                >
                  Add task
                </SubmitButton>
              </div>
              <p className="muted">
                The action records only bounded attributes such as the project id and title
                length. The title itself is not emitted.
              </p>
            </form>
          </Card>

          <Card title="Inspect this page">
            <div className="stack stack--tight">
              <p className="muted">
                Opening this page produces a request span and the project and task queries.
                The status buttons add an action span each time.
              </p>
              <div className="button-row">
                <Link className="button button--secondary button--small" href="/scenarios">
                  Try a scenario
                </Link>
                <Link className="button button--ghost button--small" href="/projects">
                  All projects
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
