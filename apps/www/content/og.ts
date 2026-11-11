import { SITE_DESCRIPTION } from './metadata'

export interface OgCard {
  readonly label: string
  readonly title: string
  readonly description: string
}

/**
 * Copy for each generated social card. Add an entry here for every public
 * route; `pageMetadata()` derives the image path from the route path.
 */
export const OG_CARDS = {
  home: {
    label: 'OVERVIEW',
    title: 'Debug Next.js requests on your machine.',
    description: SITE_DESCRIPTION,
  },
  privacy: {
    label: 'PRIVACY',
    title: 'Your data stays on your machine.',
    description:
      'Loopback-only collection, two redaction passes and local files. What StackNext captures, and what it never captures.',
  },
  license: {
    label: 'LICENSE',
    title: 'MIT licensed.',
    description:
      'Use, modify and ship StackNext in commercial or private products. Keep the notice; the software comes without warranty.',
  },
  limitations: {
    label: 'LIMITATIONS',
    title: 'What StackNext does not do.',
    description:
      'The intentional boundaries of telemetry, diagnostics, regression evidence, snapshots and coding-agent support.',
  },
  changelog: {
    label: 'CHANGELOG',
    title: 'Every release, in one place.',
    description:
      'Release notes for every published StackNext version, generated from the repository changelog.',
  },
} as const satisfies Record<string, OgCard>
