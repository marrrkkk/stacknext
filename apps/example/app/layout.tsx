import type { Metadata } from 'next'
import './globals.css'
import { AppShell } from '@/components/AppShell'
import { DASHBOARD_URL } from '@/lib/config'

export const metadata: Metadata = {
  title: 'StackNext Example — a small app with real telemetry',
  description:
    'A task tracker used to demonstrate StackNext request, trace, database, error and Playwright regression inspection.',
}

const themeScript = `
try {
  var stored = localStorage.getItem('stacknext-theme');
  document.documentElement.dataset.theme = stored === 'light' ? 'light' : 'dark';
} catch (error) {
  document.documentElement.dataset.theme = 'dark';
}
`

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppShell dashboardUrl={DASHBOARD_URL}>{children}</AppShell>
      </body>
    </html>
  )
}
