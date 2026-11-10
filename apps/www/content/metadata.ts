import type { Metadata } from 'next'

export const SITE_NAME = 'StackNext'

export const HOME_TITLE = 'StackNext: local debugging for Next.js'

export const SITE_DESCRIPTION =
  'Open-source debugging center for Next.js App Router apps. Follow requests through OpenTelemetry spans, database queries, errors and diagnostics on your machine.'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL

const SOCIAL_IMAGE = {
  url: '/og.png',
  width: 1200,
  height: 630,
  alt: 'StackNext overview dashboard for Next.js',
}

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

  return {
    title,
    description,
    ...(siteUrl ? { alternates: { canonical: path } } : {}),
    openGraph: {
      title: resolvedSocialTitle,
      description,
      type: 'website',
      siteName: SITE_NAME,
      ...(siteUrl ? { url: path, images: [SOCIAL_IMAGE] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: resolvedSocialTitle,
      description,
      ...(siteUrl ? { images: ['/og.png'] } : {}),
    },
  }
}
