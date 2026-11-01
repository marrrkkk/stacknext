import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { projects, tasks } from '@/lib/schema'

export const dynamic = 'force-dynamic'

const priorityLabel = ['High', 'Medium', 'Low']

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<React.ReactElement> {
  const { id } = await params
  const projectId = Number(id)
  if (!Number.isInteger(projectId) || projectId <= 0) notFound()

  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) notFound()

  const items = db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(tasks.priority, tasks.id)
    .all()

  const done = items.filter((task) => task.status === 'done').length
  const progress = items.length === 0 ? 0 : Math.round((done / items.length) * 100)

  return (
    <>
      <div className="breadcrumb">
        <Link href="/">Projects</Link>
        <span>/</span>
        <span>{project.name}</span>
      </div>

      <section className="project-hero">
        <div>
          <p className="eyebrow">Project #{project.id}</p>
          <h1>{project.name}</h1>
          <p className="lede">{project.description}</p>
        </div>
        <div className="project-hero__meter">
          <span>{progress}%</span>
          <div className="progress">
            <span style={{ width: `${progress}%` }} />
          </div>
          <small>
            {done} of {items.length} tasks complete
          </small>
        </div>
      </section>

      <div className="panel">
        <div className="section-heading">
          <h2>Tasks</h2>
          <Link href={`/api/projects/${project.id}/tasks`}>View as JSON</Link>
        </div>
        <table className="task-table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {items.map((task) => (
              <tr key={task.id}>
                <td>{task.title}</td>
                <td>
                  <span className={`status status--${task.status}`}>{task.status}</span>
                </td>
                <td>{priorityLabel[task.priority - 1] ?? 'Medium'}</td>
                <td>{new Date(task.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
