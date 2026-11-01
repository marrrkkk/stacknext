import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tasklight — NextScope example',
  description:
    'A small task tracker used to demonstrate NextScope request, trace, error and database inspection.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="site-header">
            <Link className="brand" href="/">
              <span className="brand__mark" aria-hidden="true" />
              <span>
                <span className="brand__name">Tasklight</span>
                <span className="brand__sub">NextScope example</span>
              </span>
            </Link>
            <nav className="site-nav" aria-label="Demo routes">
              <Link href="/">Projects</Link>
              <Link href="/api/projects">API</Link>
              <Link href="/api/slow?delay=300">Slow route</Link>
              <Link href="/api/error?token=demo-url-secret">Throwing route</Link>
            </nav>
          </header>
          <main className="site-main">{children}</main>
          <footer className="site-footer">
            <span>
              Open <code>http://127.0.0.1:4400</code> to inspect these requests in NextScope.
            </span>
            <span>Node.js runtime · Drizzle + SQLite · local only</span>
          </footer>
        </div>
      </body>
    </html>
  )
}
