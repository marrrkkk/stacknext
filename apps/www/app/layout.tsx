import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { GeistPixel } from 'geist/font/pixel/variable'
import { HOME_TITLE, SITE_DESCRIPTION, SITE_NAME } from '@/content/metadata'
import './globals.css'

// Set NEXT_PUBLIC_SITE_URL to the deployed origin to resolve absolute canonical
// and social image URLs. Without it, pages omit those tags rather than pointing
// at an invented domain.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: {
    default: HOME_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'Next.js',
    'App Router',
    'OpenTelemetry',
    'Drizzle',
    'Prisma',
    'Playwright',
    'MCP',
    'local-first',
    'debugging',
  ],
  authors: [{ name: 'StackNext contributors' }],
  creator: 'StackNext contributors',
  publisher: 'StackNext contributors',
  manifest: '/brand/site.webmanifest',
  icons: {
    icon: [
      { url: '/brand/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/brand/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/favicon-48.png', sizes: '48x48', type: 'image/png' },
    ],
    apple: [{ url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${GeistPixel.variable}`}>
      <body>{children}</body>
    </html>
  )
}
