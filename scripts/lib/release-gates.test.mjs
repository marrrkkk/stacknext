import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT } from './release.mjs'

const workflow = readFileSync(
  path.join(ROOT, '.github/workflows/release.yml'),
  'utf8',
)
const publisher = readFileSync(
  path.join(ROOT, 'scripts/publish-release.mjs'),
  'utf8',
)

describe('production dependency audit', () => {
  it('is advisory in the Release workflow, never a hard gate', () => {
    expect(workflow).toContain('Production dependency audit (advisory)')
    expect(workflow).toContain('if ! pnpm audit --prod; then')
    expect(workflow).toContain('::warning::')
    expect(workflow).not.toContain('run: pnpm audit --prod')
  })

  it('is advisory in the publisher, never a hard gate', () => {
    expect(publisher).toContain("runAdvisory('pnpm', ['audit', '--prod'])")
    expect(publisher).not.toContain("['pnpm', ['audit', '--prod']]")
  })
})
