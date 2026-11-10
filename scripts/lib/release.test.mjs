import { describe, expect, it } from 'vitest'
import {
  registryDocumentHasVersion,
  registryDocumentUrl,
  registryHasVersion,
  registryVersionUrl,
  waitForRegistryVersion,
} from './release.mjs'

function response(status, body) {
  return { status, json: async () => body }
}

describe('registry URLs', () => {
  it('encodes scoped package names and adds a cache-busting nonce', () => {
    expect(registryVersionUrl('@stacknext/core', '1.2.3', 42)).toBe(
      'https://registry.npmjs.org/@stacknext%2fcore/1.2.3?t=42',
    )
    expect(registryDocumentUrl('@stacknext/dashboard', 42)).toBe(
      'https://registry.npmjs.org/@stacknext%2fdashboard?t=42',
    )
  })

  it('detects an exact version in a package document', () => {
    expect(registryDocumentHasVersion({ versions: { '1.2.3': {} } }, '1.2.3')).toBe(true)
    expect(registryDocumentHasVersion({ versions: { '1.2.3': {} } }, '1.2.4')).toBe(false)
    expect(registryDocumentHasVersion(null, '1.2.3')).toBe(false)
  })
})

describe('registry version checks', () => {
  it('accepts a version endpoint response', async () => {
    const calls = []
    const visible = await registryHasVersion('@stacknext/core', '1.2.3', {
      nonce: 42,
      fetch: async (url, options) => {
        calls.push({ url, options })
        return response(200, {})
      },
    })

    expect(visible).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://registry.npmjs.org/@stacknext%2fcore/1.2.3?t=42')
    expect(calls[0].options.headers).toEqual({ 'cache-control': 'no-cache' })
  })

  it('falls back to the package document when the version endpoint returns 404', async () => {
    const calls = []
    const visible = await registryHasVersion('@stacknext/dashboard', '0.11.0', {
      nonce: 7,
      fetch: async (url) => {
        calls.push(url)
        return url.includes('/0.11.0?')
          ? response(404, {})
          : response(200, { versions: { '0.11.0': {} } })
      },
    })

    expect(visible).toBe(true)
    expect(calls).toEqual([
      'https://registry.npmjs.org/@stacknext%2fdashboard/0.11.0?t=7',
      'https://registry.npmjs.org/@stacknext%2fdashboard?t=7',
    ])
  })

  it('reports a missing version when both registry views return 404', async () => {
    const visible = await registryHasVersion('@stacknext/dashboard', '0.11.0', {
      fetch: async () => response(404, {}),
    })
    expect(visible).toBe(false)
  })

  it('surfaces unexpected registry errors instead of treating them as missing', async () => {
    await expect(
      registryHasVersion('@stacknext/core', '1.2.3', {
        fetch: async () => response(503, {}),
      }),
    ).rejects.toThrow('HTTP 503')
  })
})

describe('registry propagation wait', () => {
  it('retries until the version appears', async () => {
    let calls = 0
    let now = 0
    const sleeps = []

    const visible = await waitForRegistryVersion(async () => ++calls >= 3, {
      waitMs: 10_000,
      intervalMs: 1_000,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms)
        now += ms
      },
    })

    expect(visible).toBe(true)
    expect(calls).toBe(3)
    expect(sleeps).toEqual([1_000, 1_000])
  })

  it('returns false after the deadline', async () => {
    let now = 0
    let calls = 0

    const visible = await waitForRegistryVersion(
      async () => {
        calls += 1
        return false
      },
      {
        waitMs: 1_000,
        intervalMs: 1_000,
        now: () => now,
        sleep: async (ms) => {
          now += ms
        },
      },
    )

    expect(visible).toBe(false)
    expect(calls).toBe(2)
  })

  it('rethrows the last registry error after the deadline', async () => {
    let now = 0
    let calls = 0

    await expect(
      waitForRegistryVersion(
        async () => {
          calls += 1
          throw new Error(`failure ${calls}`)
        },
        {
          waitMs: 1_000,
          intervalMs: 1_000,
          now: () => now,
          sleep: async (ms) => {
            now += ms
          },
        },
      ),
    ).rejects.toThrow('failure 2')
  })
})
