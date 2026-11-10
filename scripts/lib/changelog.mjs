/**
 * Extract one version section from CHANGELOG.md.
 *
 * Headings inside fenced code blocks are examples, not section boundaries.
 * Returns a short fallback when the section is missing or empty.
 */
export function extractReleaseNotes(changelog, version) {
  const lines = changelog.split(/\r?\n/)
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const heading = new RegExp(`^## \\[${escaped}\\](?:\\s|$)`)
  const start = lines.findIndex((line) => heading.test(line))
  if (start < 0) return `Release ${version}.`

  const body = []
  let fence = null
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1] ?? null
    if (marker) {
      if (fence === null) {
        fence = { character: marker[0], length: marker.length }
      } else if (marker[0] === fence.character && marker.length >= fence.length) {
        fence = null
      }
      body.push(line)
      continue
    }
    if (fence === null && /^## /.test(line)) break
    body.push(line)
  }

  const notes = body.join('\n').trim()
  return notes || `Release ${version}.`
}

const RELEASE_HEADING = /^## \[([^\]]+)\](?:\s+-\s+(\d{4}-\d{2}-\d{2}))?\s*$/
const GROUP_HEADING = /^### (.+?)\s*$/
const BULLET = /^- (.*)$/
const NESTED_BULLET = /^\s+[-*]\s+/
const FENCE = /^\s*(`{3,}|~{3,})/
const LINK = /^\[([^\]\n]+)\]\(([^)\s]+)\)/
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function fencedLines(changelog) {
  const lines = changelog.split(/\r?\n/)
  const result = []
  let fence = null
  for (const line of lines) {
    const marker = FENCE.exec(line)?.[1] ?? null
    if (fence) {
      if (marker && marker[0] === fence.character && marker.length >= fence.length) {
        fence = null
      }
      result.push({ line, fenced: true })
    } else if (marker) {
      fence = { character: marker[0], length: marker.length }
      result.push({ line, fenced: true })
    } else {
      result.push({ line, fenced: false })
    }
  }
  return result
}

function formatReleaseDate(date, version) {
  const [year, month, day] = date.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(
      `CHANGELOG.md release ${version} has an invalid date "${date}". Use YYYY-MM-DD.`,
    )
  }
  return `${MONTHS[month - 1]} ${day}, ${year}`
}

function releaseId(version) {
  const slug = version.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `v${slug}`
}

function mergeText(nodes) {
  const merged = []
  for (const node of nodes) {
    const previous = merged[merged.length - 1]
    if (node.type === 'text' && previous?.type === 'text') {
      previous.value += node.value
    } else {
      merged.push(node)
    }
  }
  return merged
}

function parseInline(text, context) {
  const nodes = []
  let buffer = ''
  let index = 0

  function flush() {
    if (buffer) {
      nodes.push({ type: 'text', value: buffer })
      buffer = ''
    }
  }

  while (index < text.length) {
    const character = text[index]

    if (character === '`') {
      let run = 1
      while (text[index + run] === '`') run += 1
      const marker = '`'.repeat(run)
      const end = text.indexOf(marker, index + run)
      if (end >= 0 && end > index + run) {
        flush()
        nodes.push({ type: 'code', value: text.slice(index + run, end) })
        index = end + run
        continue
      }
    }

    if (text.startsWith('**', index)) {
      const end = text.indexOf('**', index + 2)
      if (end > index + 2) {
        flush()
        nodes.push({
          type: 'strong',
          children: parseInline(text.slice(index + 2, end), context),
        })
        index = end + 2
        continue
      }
    }

    if (character === '[') {
      const match = LINK.exec(text.slice(index))
      if (match) {
        const href = match[2]
        if (!/^https?:\/\//.test(href)) {
          throw new Error(
            `${context} links to "${href}". CHANGELOG.md release links must use an absolute http(s) URL.`,
          )
        }
        flush()
        nodes.push({
          type: 'link',
          href,
          children: parseInline(match[1], context),
        })
        index += match[0].length
        continue
      }
      if (/^\[[^\]]*\]\(/.test(text.slice(index))) {
        throw new Error(
          `${context} contains an unsupported Markdown link. Use [label](https://...) without a title.`,
        )
      }
    }

    buffer += character
    index += 1
  }

  flush()
  return mergeText(nodes)
}

function toParagraphs(lines) {
  const paragraphs = []
  let current = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (current.length > 0) {
        paragraphs.push(current.join(' '))
        current = []
      }
      continue
    }
    current.push(trimmed)
  }
  if (current.length > 0) paragraphs.push(current.join(' '))
  return paragraphs
}

function parseReleaseSection({ version, date, lines }) {
  const introLines = []
  const groups = []
  let group = null

  for (const line of lines) {
    if (FENCE.test(line)) {
      throw new Error(
        `CHANGELOG.md release ${version} contains a fenced code block, which the website changelog does not support. Use inline code instead.`,
      )
    }

    const groupMatch = GROUP_HEADING.exec(line)
    if (groupMatch) {
      group = { title: groupMatch[1], items: [] }
      groups.push(group)
      continue
    }

    if (group) {
      const bullet = BULLET.exec(line)
      if (bullet) {
        group.items.push([bullet[1].trim()])
        continue
      }

      if (NESTED_BULLET.test(line)) {
        throw new Error(
          `CHANGELOG.md release ${version} contains a nested list item under "${group.title}". The website changelog supports one level of bullets.`,
        )
      }

      if (!line.trim()) continue

      if (group.items.length === 0) {
        throw new Error(
          `CHANGELOG.md release ${version} has text under "${group.title}" before its first bullet.`,
        )
      }

      if (!/^\s+/.test(line)) {
        throw new Error(
          `CHANGELOG.md release ${version} has an unindented line under "${group.title}". Indent wrapped bullet lines or start a new bullet.`,
        )
      }

      group.items[group.items.length - 1].push(line.trim())
      continue
    }

    if (BULLET.test(line)) {
      throw new Error(
        `CHANGELOG.md release ${version} has a bullet before the first "###" group.`,
      )
    }

    introLines.push(line)
  }

  const seenGroups = new Set()
  for (const current of groups) {
    if (current.items.length === 0) {
      throw new Error(
        `CHANGELOG.md release ${version} has an empty "${current.title}" group.`,
      )
    }
    if (seenGroups.has(current.title)) {
      throw new Error(
        `CHANGELOG.md release ${version} repeats the "${current.title}" group.`,
      )
    }
    seenGroups.add(current.title)
  }

  return {
    id: releaseId(version),
    version,
    date,
    dateLabel: formatReleaseDate(date, version),
    intro: toParagraphs(introLines).map((paragraph) =>
      parseInline(paragraph, `CHANGELOG.md release ${version} intro`),
    ),
    groups: groups.map((current) => ({
      title: current.title,
      items: current.items.map((item) =>
        parseInline(
          item.join(' '),
          `CHANGELOG.md release ${version} "${current.title}" item`,
        ),
      ),
    })),
  }
}

/**
 * Parse released sections from CHANGELOG.md for the website.
 *
 * The `[Unreleased]` section is intentionally excluded: the website shows
 * published versions only. Release notes support paragraphs, `###` groups,
 * bullets with indented continuations, inline code, bold text and absolute
 * links. Unsupported release structure fails generation instead of being
 * guessed at.
 */
export function parseChangelogReleases(changelog) {
  const sections = []
  let current = null

  for (const { line, fenced } of fencedLines(changelog)) {
    if (fenced) {
      if (current) current.lines.push(line)
      continue
    }

    const match = RELEASE_HEADING.exec(line)
    if (match) {
      const [, version, date] = match
      if (version === 'Unreleased') {
        current = null
        continue
      }
      if (!VERSION.test(version)) {
        throw new Error(
          `CHANGELOG.md contains an invalid release version "${version}".`,
        )
      }
      if (!date) {
        throw new Error(
          `CHANGELOG.md release ${version} needs a date. Use "## [${version}] - YYYY-MM-DD".`,
        )
      }
      if (sections.some((section) => section.version === version)) {
        throw new Error(`CHANGELOG.md repeats release ${version}.`)
      }
      current = { version, date, lines: [] }
      sections.push(current)
      continue
    }

    if (/^##\s/.test(line)) {
      throw new Error(
        `Unsupported heading in CHANGELOG.md: "${line.trim()}". Release sections must use "## [version] - YYYY-MM-DD".`,
      )
    }

    if (current) current.lines.push(line)
  }

  if (sections.length === 0) {
    throw new Error('CHANGELOG.md does not contain any released versions.')
  }

  return sections.map(parseReleaseSection)
}

const TYPES = `export interface ChangelogInlineText {
  readonly type: 'text'
  readonly value: string
}

export interface ChangelogInlineCode {
  readonly type: 'code'
  readonly value: string
}

export interface ChangelogInlineStrong {
  readonly type: 'strong'
  readonly children: readonly ChangelogInline[]
}

export interface ChangelogInlineLink {
  readonly type: 'link'
  readonly href: string
  readonly children: readonly ChangelogInline[]
}

export type ChangelogInline =
  | ChangelogInlineText
  | ChangelogInlineCode
  | ChangelogInlineStrong
  | ChangelogInlineLink

export type ChangelogParagraph = readonly ChangelogInline[]

export interface ChangelogGroup {
  readonly title: string
  readonly items: readonly ChangelogParagraph[]
}

export interface ChangelogRelease {
  readonly id: string
  readonly version: string
  readonly date: string
  readonly dateLabel: string
  readonly intro: readonly ChangelogParagraph[]
  readonly groups: readonly ChangelogGroup[]
}`

const BANNER = [
  '/**',
  ' * Generated by scripts/sync-changelog.mjs from CHANGELOG.md.',
  ' * Do not edit this file. Run `pnpm changelog:sync` instead.',
  ' */',
].join('\n')

export function renderChangelogModule(releases) {
  return `${BANNER}\n\n${TYPES}\n\nexport const CHANGELOG_RELEASES = ${JSON.stringify(
    releases,
    null,
    2,
  )} as const satisfies readonly ChangelogRelease[]\n`
}
