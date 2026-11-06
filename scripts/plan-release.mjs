#!/usr/bin/env node
/**
 * Plans the next release from Conventional Commits since the last vX.Y.Z tag.
 *
 * Used by .github/workflows/release-pr.yml. Prints a human summary and can
 * write GitHub Actions outputs and a pull-request body. It never changes files.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareVersions, planRelease } from './lib/versioning.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : null
}

function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  }).trim()
}

function readCurrentVersion() {
  const manifest = JSON.parse(
    readFileSync(path.join(ROOT, 'packages', 'core', 'package.json'), 'utf8'),
  )
  return manifest.version
}

function latestTag() {
  const tags = git(['tag', '--merged', 'HEAD', '--list', 'v*', '--sort=-v:refname'])
    .split('\n')
    .filter(Boolean)
  return tags[0] ?? null
}

function commitsSince(tag) {
  const raw = git(['log', '--format=%H%x00%B%x00', `${tag}..HEAD`])
  const parts = raw.split('\x00')
  const commits = []
  for (let index = 0; index + 1 < parts.length; index += 2) {
    const sha = parts[index].trim()
    if (sha) commits.push({ sha, message: parts[index + 1].trim() })
  }
  return commits
}

function markdown({ currentVersion, fromTag, plan, pending }) {
  if (pending) {
    return [
      `## Release pending: ${currentVersion}`,
      '',
      `The repository is at ${currentVersion}, but the latest tag is ${fromTag}.`,
      'The Release workflow has not published and tagged this version yet.',
      'Approve or re-run the Release workflow instead of opening another release PR.',
      '',
    ].join('\n')
  }

  const lines = [
    `## Release ${plan.version}`,
    '',
    `- Bump: **${plan.bump}**`,
    `- Current version: ${currentVersion}`,
    `- Previous tag: ${fromTag}`,
    `- Commits since ${fromTag}: ${plan.commits.length}`,
    '',
    '### Commits',
    '',
  ]
  for (const commit of plan.commits) {
    const details = [commit.type ?? 'other']
    if (commit.breaking) details.push('breaking')
    if (commit.releaseAs) details.push(`Release-As ${commit.releaseAs}`)
    lines.push(`- \`${commit.sha.slice(0, 7)}\` ${commit.subject} (${details.join(', ')})`)
  }
  lines.push(
    '',
    '### Release checklist',
    '',
    '- Review the version and the CHANGELOG section moved out of Unreleased.',
    '- Merging this PR triggers the Release workflow and waits for npm environment approval.',
    `- Tag \`v${plan.version}\` and the GitHub release are created only after publishing succeeds.`,
    '',
  )
  return lines.join('\n')
}

function writeOutputs(file, entries) {
  if (!file) return
  const body = Object.entries(entries)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  appendFileSync(file, `${body}\n`)
}

try {
  const currentVersion = readCurrentVersion()
  const tag = latestTag()

  if (!tag) {
    console.log('No vX.Y.Z tag found. Use the manual Release workflow for the first publication.')
    writeOutputs(option('--github-output'), { release: 'false', version: currentVersion })
    process.exit(0)
  }

  const tagVersion = tag.replace(/^v/, '')
  const comparison = compareVersions(currentVersion, tagVersion)

  if (comparison < 0) {
    throw new Error(
      `Repository version ${currentVersion} is behind the latest tag ${tag}. ` +
        'Restore the version before planning a release.',
    )
  }

  if (comparison > 0) {
    const summary = markdown({ currentVersion, fromTag: tag, pending: true })
    const summaryFile = option('--summary')
    if (summaryFile) writeFileSync(summaryFile, summary)
    writeOutputs(option('--github-output'), {
      release: 'false',
      version: currentVersion,
      current: currentVersion,
      tag,
      reason: 'pending',
    })
    console.log(summary)
    process.exit(0)
  }

  const commits = commitsSince(tag)
  const plan = planRelease({ currentVersion, commits })
  const summary = markdown({ currentVersion, fromTag: tag, plan })

  const summaryFile = option('--summary')
  if (summaryFile) writeFileSync(summaryFile, summary)

  writeOutputs(option('--github-output'), {
    release: String(plan.release),
    version: plan.version,
    current: currentVersion,
    tag,
    bump: plan.bump,
    reason: plan.release ? 'commits' : 'no-releasable-commits',
  })

  if (!plan.release) {
    console.log('No feat, fix, perf, revert or breaking commits since', tag)
    console.log('No release PR will be opened.')
    process.exit(0)
  }

  console.log(`Planned ${plan.version} (${plan.bump}) from ${commits.length} commit(s) since ${tag}.`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
