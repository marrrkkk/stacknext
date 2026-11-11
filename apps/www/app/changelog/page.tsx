import type { Metadata } from 'next'
import { ContentPage } from '@/components/content-page'
import {
  releaseBadgeClass,
  releaseDateClass,
  releaseGroupClass,
  releaseHeadClass,
  releaseTitleClass,
} from '@/components/styles'
import {
  CHANGELOG_RELEASES,
  type ChangelogInline,
  type ChangelogRelease,
} from '@/content/changelog.generated'
import { pageMetadata } from '@/content/metadata'
import { LINKS } from '@/content/site'

// Widen the generated literal tuple so shared rendering code can test for
// empty sections without TypeScript narrowing each length to one literal.
const RELEASES: readonly ChangelogRelease[] = CHANGELOG_RELEASES

export const metadata: Metadata = pageMetadata({
  title: 'Changelog',
  description:
    'Release notes for every published StackNext version, generated from the repository changelog.',
  path: '/changelog',
})

const LATEST_RELEASE = CHANGELOG_RELEASES[0]

const SECTIONS = [
  { id: 'releases', label: 'Release notes' },
  ...RELEASES.map((release) => ({
    id: release.id,
    label: `${release.version} · ${release.dateLabel}`,
  })),
  { id: 'subscribe', label: 'Stay current' },
]

function InlineText({
  nodes,
}: {
  nodes: readonly ChangelogInline[]
}): React.ReactElement {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === 'text') return node.value
        if (node.type === 'code') return <code key={index}>{node.value}</code>
        if (node.type === 'strong') {
          return (
            <strong key={index}>
              <InlineText nodes={node.children} />
            </strong>
          )
        }
        return (
          <a key={index} href={node.href} target="_blank" rel="noreferrer">
            <InlineText nodes={node.children} />
          </a>
        )
      })}
    </>
  )
}

export default function ChangelogPage(): React.ReactElement {
  return (
    <ContentPage
      eyebrow="Project / Changelog"
      title="Every release, in one place."
      lede="StackNext follows Semantic Versioning. This page is generated from the repository changelog, which remains the canonical record for every fix and documentation update."
      updated={LATEST_RELEASE.dateLabel}
      sections={SECTIONS}
      breadcrumb="Changelog"
      path="/changelog"
    >
      <section id="releases">
        <h2>Release notes</h2>
        <p>
          The latest published version is <strong>{LATEST_RELEASE.version}</strong>.
          Each section below is generated from the{' '}
          <a href={LINKS.changelogSource} target="_blank" rel="noreferrer">
            repository changelog
          </a>
          .
        </p>
      </section>

      {RELEASES.map((release, index) => (
        <section key={release.id} id={release.id}>
          <div className={releaseHeadClass}>
            <h2 className={releaseTitleClass}>{release.version}</h2>
            <span className={releaseDateClass}>{release.dateLabel}</span>
            {index === 0 && <span className={releaseBadgeClass}>Latest</span>}
          </div>
          {release.intro.map((paragraph, paragraphIndex) => (
            <p key={paragraphIndex}>
              <InlineText nodes={paragraph} />
            </p>
          ))}
          {release.intro.length === 0 && release.groups.length === 0 && (
            <p>No user-facing entries were recorded in the changelog for this release.</p>
          )}
          {release.groups.map((group) => (
            <div className={releaseGroupClass} key={group.title}>
              <h3>{group.title}</h3>
              <ul>
                {group.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <InlineText nodes={item} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      <section id="subscribe">
        <h2>Stay current</h2>
        <p>
          Watch the{' '}
          <a href={LINKS.github} target="_blank" rel="noreferrer">
            GitHub repository
          </a>{' '}
          for releases, or follow the{' '}
          <a href={LINKS.changelogSource} target="_blank" rel="noreferrer">
            full changelog
          </a>
          . The package version is also available from{' '}
          <code>stacknext --version</code>.
        </p>
      </section>
    </ContentPage>
  )
}
