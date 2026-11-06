const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const CONVENTIONAL_PATTERN = /^([a-z][a-z0-9-]*)(?:\(([^)]*)\))?(!)?:\s+(.+)$/i
const RELEASE_AS_PATTERN = /^Release-As:\s*v?(\d+\.\d+\.\d+)\s*$/im

/** Parse an exact x.y.z version. Pre-release and build metadata are rejected. */
export function parseVersion(value) {
  const match = SEMVER_PATTERN.exec(value)
  if (!match) {
    throw new Error(`Invalid version "${value}". Expected an exact x.y.z version.`)
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

export function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`
}

export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] - b[key]
  }
  return 0
}

export function bumpVersion(version, bump) {
  const parsed = parseVersion(version)
  if (bump === 'major') {
    return formatVersion({ major: parsed.major + 1, minor: 0, patch: 0 })
  }
  if (bump === 'minor') {
    return formatVersion({ major: parsed.major, minor: parsed.minor + 1, patch: 0 })
  }
  if (bump === 'patch') {
    return formatVersion({ ...parsed, patch: parsed.patch + 1 })
  }
  throw new Error(`Unknown version bump "${bump}".`)
}

/**
 * Classify one commit message using Conventional Commits.
 *
 * Only feat, fix, perf and revert request a bump. Breaking changes request a
 * major bump; planRelease downgrades that to minor while the project is pre-1.0.
 * A `Release-As: x.y.z` footer overrides the computed version.
 */
export function analyzeCommit(message) {
  const lines = message.split(/\r?\n/)
  const subject = (lines[0] ?? '').trim()
  const match = CONVENTIONAL_PATTERN.exec(subject)
  const body = lines.slice(1).join('\n')
  const breaking = Boolean(match?.[3]) || /^BREAKING[ -]CHANGE:/m.test(body)
  const releaseAs = RELEASE_AS_PATTERN.exec(message)?.[1] ?? null
  const type = match?.[1]?.toLowerCase() ?? null

  let bump = 'none'
  if (breaking) bump = 'major'
  else if (type === 'feat') bump = 'minor'
  else if (type === 'fix' || type === 'perf' || type === 'revert') bump = 'patch'

  return { subject, type, breaking, releaseAs, bump }
}

/**
 * Compute the next release from the commits since the last published tag.
 *
 * `commits` is an array of `{ sha, message }`. Returns the same shape plus
 * `release`, `version` and the analyzed commits. An explicit Release-As footer
 * wins even when no commit normally requests a bump.
 */
export function planRelease({ currentVersion, commits }) {
  const analyzed = commits.map((commit) => ({
    ...commit,
    ...analyzeCommit(commit.message),
  }))

  // Commits are passed newest first, so the newest Release-As footer wins.
  const releaseAs = analyzed.find((commit) => commit.releaseAs)?.releaseAs ?? null
  let bump = 'none'
  for (const commit of analyzed) {
    if (commit.bump === 'major') bump = 'major'
    else if (commit.bump === 'minor' && bump !== 'major') bump = 'minor'
    else if (commit.bump === 'patch' && bump === 'none') bump = 'patch'
  }

  const current = parseVersion(currentVersion)
  // Breaking changes stay minor until 1.0.0. This keeps pre-1.0 releases
  // additive while still marking the change in the changelog.
  if (bump === 'major' && current.major === 0) bump = 'minor'

  if (!releaseAs && bump === 'none') {
    return { release: false, version: currentVersion, bump, commits: analyzed }
  }

  const version = releaseAs ?? bumpVersion(currentVersion, bump)
  if (compareVersions(version, currentVersion) <= 0) {
    throw new Error(
      `Release version ${version} must be greater than the current version ${currentVersion}.`,
    )
  }

  return { release: true, version, bump: releaseAs ? 'custom' : bump, commits: analyzed }
}
