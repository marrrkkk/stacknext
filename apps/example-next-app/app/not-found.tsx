import Link from 'next/link'

export default function NotFound(): React.ReactElement {
  return (
    <div className="not-found">
      <p className="eyebrow">404</p>
      <h1>That project does not exist</h1>
      <p className="lede">The demo only has three seeded projects.</p>
      <Link className="button button--primary" href="/">
        Back to projects
      </Link>
    </div>
  )
}
