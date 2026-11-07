import { describe, expect, it } from 'vitest'
import { extractReleaseNotes } from './changelog.mjs'

describe('release notes extraction', () => {
  it('extracts one version section and stops at the next heading', () => {
    const changelog = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '## [1.2.3] - 2026-01-02',
      '',
      '### Added',
      '',
      '- A feature.',
      '',
      '## [1.2.2] - 2026-01-01',
      '',
      '- An older fix.',
    ].join('\n')

    expect(extractReleaseNotes(changelog, '1.2.3')).toBe(
      '### Added\n\n- A feature.',
    )
  })

  it('ignores headings inside fenced code blocks', () => {
    const changelog = [
      '## [1.2.3] - 2026-01-02',
      '',
      '### Added',
      '',
      '```md',
      '## Example',
      '~~~',
      'not a fence because it has the wrong character',
      '```',
      '',
      'After the example.',
      '',
      '## [1.2.2] - 2026-01-01',
      '',
      '- An older fix.',
    ].join('\n')

    const notes = extractReleaseNotes(changelog, '1.2.3')
    expect(notes).toContain('## Example')
    expect(notes).toContain('After the example.')
    expect(notes).not.toContain('An older fix.')
  })

  it('does not match a longer version with the same prefix', () => {
    const changelog = [
      '## [1.2.30] - 2026-01-03',
      '',
      '- A newer patch.',
      '',
      '## [1.2.3] - 2026-01-02',
      '',
      '- The requested patch.',
    ].join('\n')

    expect(extractReleaseNotes(changelog, '1.2.3')).toBe('- The requested patch.')
  })

  it('falls back when the section is missing or empty', () => {
    expect(extractReleaseNotes('# Changelog\n', '9.9.9')).toBe('Release 9.9.9.')
    expect(extractReleaseNotes('## [1.0.0]\n\n## [0.9.0]\n', '1.0.0')).toBe('Release 1.0.0.')
  })
})
