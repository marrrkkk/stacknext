import type { MetadataRoute } from 'next'
import { CHANGELOG_RELEASES } from '@/content/changelog.generated'
import { SITE_URL } from '@/content/metadata'

// Keep these dates in step with the "Last updated" label rendered on each page.
const HOME_UPDATED = '2026-11-11'
const POLICY_UPDATED = '2026-11-10'

export default function sitemap(): MetadataRoute.Sitemap {
  // Without a configured origin there is no canonical URL to publish. Return
  // an empty sitemap instead of inventing a domain.
  if (!SITE_URL) return []

  const changelogUpdated = CHANGELOG_RELEASES[0]?.date ?? POLICY_UPDATED

  return [
    {
      // Match the canonical Next.js emits for `/` (no trailing slash).
      url: SITE_URL,
      lastModified: HOME_UPDATED,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/changelog`,
      lastModified: changelogUpdated,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/limitations`,
      lastModified: POLICY_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: POLICY_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/license`,
      lastModified: POLICY_UPDATED,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
  ]
}
