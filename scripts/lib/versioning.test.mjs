import { describe, expect, it } from 'vitest'
import {
  analyzeCommit,
  bumpVersion,
  compareVersions,
  parseVersion,
  planRelease,
  selectLatestTag,
} from './versioning.mjs'

function commit(message, sha = '0'.repeat(40)) {
  return { sha, message }
}

describe('version parsing and bumping', () => {
  it('parses exact versions and rejects ranges', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 })
    expect(() => parseVersion('v1.2.3')).toThrow()
    expect(() => parseVersion('1.2')).toThrow()
    expect(() => parseVersion('1.2.3-beta.1')).toThrow()
  })

  it('bumps each component and resets lower components', () => {
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0')
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0')
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4')
    expect(() => bumpVersion('1.2.3', 'none')).toThrow()
  })

  it('compares versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareVersions('0.6.1', '0.6.1')).toBe(0)
    expect(compareVersions('0.6.0', '0.6.1')).toBeLessThan(0)
  })

  it('selects the newest stable tag and ignores other refs', () => {
    expect(selectLatestTag(['v0.6.1', 'v0.10.0', 'v0.9.0'])).toBe('v0.10.0')
    expect(selectLatestTag(['v0.7.0-rc.1', 'vnext', 'v1.0', 'v0.6.1'])).toBe('v0.6.1')
    expect(selectLatestTag([])).toBeNull()
    expect(selectLatestTag(['v0.7.0-beta.1'])).toBeNull()
  })
})

describe('conventional commit analysis', () => {
  it('maps feat to minor and fix, perf and revert to patch', () => {
    expect(analyzeCommit('feat(cli): add snapshots').bump).toBe('minor')
    expect(analyzeCommit('fix: avoid a race').bump).toBe('patch')
    expect(analyzeCommit('perf: cache spans').bump).toBe('patch')
    expect(analyzeCommit('revert: undo a change').bump).toBe('patch')
  })

  it('does not bump documentation, chore or test commits', () => {
    expect(analyzeCommit('docs: refresh the guide').bump).toBe('none')
    expect(analyzeCommit('chore: update dependencies').bump).toBe('none')
    expect(analyzeCommit('test: add coverage').bump).toBe('none')
    expect(analyzeCommit('Merge pull request #4 from example').bump).toBe('none')
  })

  it('detects breaking changes from the header and footer', () => {
    expect(analyzeCommit('feat!: replace the wire format').breaking).toBe(true)
    expect(
      analyzeCommit('feat: replace the wire format\n\nBREAKING CHANGE: old payloads are rejected')
        .breaking,
    ).toBe(true)
  })

  it('reads a Release-As footer', () => {
    const result = analyzeCommit('chore: bump\n\nRelease-As: 0.9.0')
    expect(result.releaseAs).toBe('0.9.0')
    expect(result.bump).toBe('none')
  })
})

describe('release planning', () => {
  it('uses the highest requested bump', () => {
    const plan = planRelease({
      currentVersion: '0.6.1',
      commits: [commit('fix: patch'), commit('feat: feature')],
    })
    expect(plan.release).toBe(true)
    expect(plan.version).toBe('0.7.0')
    expect(plan.bump).toBe('minor')
  })

  it('keeps breaking changes minor before 1.0 and major after', () => {
    const before = planRelease({
      currentVersion: '0.6.1',
      commits: [commit('feat!: break the wire format')],
    })
    expect(before.version).toBe('0.7.0')
    expect(before.bump).toBe('minor')

    const after = planRelease({
      currentVersion: '1.2.3',
      commits: [commit('feat!: break the wire format')],
    })
    expect(after.version).toBe('2.0.0')
    expect(after.bump).toBe('major')
  })

  it('does not release for docs and chore commits', () => {
    const plan = planRelease({
      currentVersion: '0.6.1',
      commits: [commit('docs: update'), commit('chore: tidy')],
    })
    expect(plan.release).toBe(false)
    expect(plan.version).toBe('0.6.1')
    expect(plan.bump).toBe('none')
  })

  it('lets a Release-As footer override the computed bump', () => {
    const plan = planRelease({
      currentVersion: '0.6.1',
      commits: [commit('feat: feature'), commit('chore: bump\n\nRelease-As: 0.9.0')],
    })
    expect(plan.release).toBe(true)
    expect(plan.version).toBe('0.9.0')
    expect(plan.bump).toBe('custom')
  })

  it('rejects a Release-As version that is not newer', () => {
    expect(() =>
      planRelease({
        currentVersion: '0.6.1',
        commits: [commit('chore: bump\n\nRelease-As: 0.6.1')],
      }),
    ).toThrow(/must be greater/)
  })
})
