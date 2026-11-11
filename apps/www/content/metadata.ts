import type { Metadata } from 'next'

export const SITE_NAME = 'StackNext'

export const HOME_TITLE = 'StackNext: local debugging for Next.js'

export const SITE_DESCRIPTION =
  'Open-source Next.js debugging: trace requests through OpenTelemetry spans, Drizzle and Prisma queries, errors and diagnostics, all on your machine.'

/**
 * Optional deployed origin. Without it, canonical URLs, sitemap entries and
 * absolute social-image tags are omitted rather than pointing at an invented
 * domain. The trailing slash is stripped so paths concatenate predictably.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
  ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')
  : null

export function pageMetadata({
  title,
  description,
  path,
  socialTitle,
}: {
  title: Metadata['title']
  description: string
  path: string
  socialTitle?: string
}): Metadata {
  const resolvedSocialTitle =
    socialTitle ?? (typeof title === 'string' ? `${title} · ${SITE_NAME}` : SITE_NAME)

  // Absolute paths keep the canonical and sitemap spellings identical on
  // every route.
  const absolutePath = SITE_URL ? `${SITE_URL}${path}` : null

  // Gated on the same origin: without it, no social image tags are emitted
  // rather than resolving them against a default or invented host. Card keys
  // mirror the route path without the leading slash, so nested routes map to
  // slash-separated keys (for example /guides/install -> /og/guides/install).
  const socialImagePath = path === '/' ? '/og/home' : `/og${path}`
  const socialImage = SITE_URL
    ? {
        url: `${SITE_URL}${socialImagePath}`,
        width: 1200,
        height: 630,
        alt: resolvedSocialTitle,
      }
    : null

  return {
    title,
    description,
    ...(absolutePath ? { alternates: { canonical: absolutePath } } : {}),
    openGraph: {
      title: resolvedSocialTitle,
      description,
      type: 'website',
      siteName: SITE_NAME,
      locale: 'en_US',
      ...(absolutePath ? { url: absolutePath } : {}),
      ...(socialImage ? { images: [socialImage] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: resolvedSocialTitle,
      description,
      ...(socialImage ? { images: [socialImage] } : {}),
    },
  }
}
