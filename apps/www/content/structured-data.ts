import { FAQS, LINKS } from './site'
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from './metadata'

export type JsonLdObject = Record<string, unknown>

export interface BreadcrumbItem {
  name: string
  path: string
}

/**
 * Site-wide graph: the organization, the website and the free open-source
 * application. Absolute URLs are only emitted when NEXT_PUBLIC_SITE_URL is
 * configured, so a local build never invents a canonical host.
 */
export function siteJsonLd(): JsonLdObject {
  const organization = {
    '@type': 'Organization',
    name: SITE_NAME,
    ...(SITE_URL ? { '@id': `${SITE_URL}/#organization`, url: SITE_URL } : {}),
    sameAs: [LINKS.github, LINKS.npm],
  }

  const website = {
    '@type': 'WebSite',
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    inLanguage: 'en',
    ...(SITE_URL ? { '@id': `${SITE_URL}/#website`, url: `${SITE_URL}/` } : {}),
    publisher: SITE_URL
      ? { '@id': `${SITE_URL}/#organization` }
      : { '@type': 'Organization', name: SITE_NAME },
  }

  const software = {
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    applicationCategory: 'DeveloperApplication',
    applicationSubCategory: 'Next.js debugging and observability',
    operatingSystem: 'macOS, Linux, Windows',
    softwareRequirements: 'Node.js 20.9 or newer, Next.js 15 or 16 App Router',
    isAccessibleForFree: true,
    license: 'https://opensource.org/license/mit',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    author: SITE_URL
      ? { '@id': `${SITE_URL}/#organization` }
      : { '@type': 'Organization', name: SITE_NAME },
    sameAs: [LINKS.github, LINKS.npm],
    ...(SITE_URL ? { url: `${SITE_URL}/` } : {}),
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [organization, website, software],
  }
}

/**
 * Mirrors the visible FAQ accordion on the landing page. Google restricts FAQ
 * rich results to authoritative government and health sites, so this type is
 * kept for accurate description and AI parsers, not as a rich-result promise.
 */
export function faqJsonLd(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }
}

/** Returns null without a configured origin, because breadcrumb items need absolute URLs. */
export function breadcrumbJsonLd(items: readonly BreadcrumbItem[]): JsonLdObject | null {
  const siteUrl = SITE_URL
  if (!siteUrl) return null

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${siteUrl}${item.path}`,
    })),
  }
}
