import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/content/metadata'

export default function robots(): MetadataRoute.Robots {
  const rules = {
    userAgent: '*',
    allow: '/',
  }

  // Every route is public, so nothing is disallowed. The sitemap and host
  // directives need an absolute origin; omit them for a local build.
  if (!SITE_URL) return { rules }

  return {
    rules,
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
