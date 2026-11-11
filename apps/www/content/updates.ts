/**
 * Single source of truth for page update dates. The sitemap and the visible
 * "Last updated" label both read from here so they cannot drift apart. Bump
 * the relevant constant when a page's content changes.
 */
export const HOME_UPDATED = '2026-11-11'
export const POLICY_UPDATED = '2026-11-10'

export function formatUpdatedDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return isoDate

  return parsed.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
