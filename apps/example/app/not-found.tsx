import Link from 'next/link'
import { Icon } from '@/components/Icon'

export default function NotFound(): React.ReactElement {
  return (
    <div className="not-found">
      <p className="eyebrow">404</p>
      <h1 className="page-head__title">That page does not exist</h1>
      <p className="page-head__description">
        The example only has three seeded projects. Try project 1, 2 or 3, or head back to the
        overview.
      </p>
      <div className="button-row">
        <Link className="button button--primary button--small" href="/projects">
          Back to projects
        </Link>
        <Link className="button button--secondary button--small" href="/">
          Open overview
          <Icon name="arrow-right" size={12} />
        </Link>
      </div>
    </div>
  )
}
