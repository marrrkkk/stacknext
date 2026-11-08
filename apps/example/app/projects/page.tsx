import Link from 'next/link'
import { Badge, PageHeader, Progress } from '@/components/ui'
import { Icon } from '@/components/Icon'
import { listProjects, workspaceSummary } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export default function ProjectsPage(): React.ReactElement {
  const projects = listProjects()
  const summary = workspaceSummary(projects)

  return (
    <>
      <PageHeader
        eyebrow="Demo data"
        title="Projects"
        description={`${summary.projects} seeded projects and ${summary.tasks} tasks. Each project page is a Server Component that reads Drizzle directly, so every visit adds request, span and query evidence to the collector.`}
      />

      <div className="grid grid--3">
        {projects.map((project) => {
          const progress =
            project.total === 0 ? 0 : Math.round((project.done / project.total) * 100)
          return (
            <Link className="project-card" key={project.id} href={`/projects/${project.id}`}>
              <div className="project-card__top">
                <h2 className="project-card__title">{project.name}</h2>
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

      <div className="banner">
        <Icon name="info" size={16} className="banner__icon" />
        <div className="banner__body">
          <div className="banner__title">Add a project task</div>
          Open any project and submit the add-task form. It runs through a wrapped Server
          Action, then revalidates the overview and project page.
        </div>
      </div>
    </>
  )
}
