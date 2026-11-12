import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { runMcp } from '../src/commands/mcp.js'

afterEach(() => vi.restoreAllMocks())

it('reports missing runtime state as check JSON and exit code 1', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'stacknext-mcp-check-'))
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    expect(await runMcp({ check: true }, dir)).toBe(1)
    expect(JSON.parse(log.mock.calls[0]![0])).toEqual({
      ok: false,
      error: expect.stringContaining('StackNext is not running'),
    })
    await expect(runMcp({}, dir)).rejects.toThrow('StackNext is not running')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

it('reports token validation failures as check JSON', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const options = { collector: 'http://127.0.0.1:4400', token: 'short' }
  expect(await runMcp({ ...options, check: true })).toBe(1)
  expect(JSON.parse(log.mock.calls[0]![0])).toEqual({
    ok: false,
    error: 'A collector token of at least 16 characters is required',
  })
  await expect(runMcp(options)).rejects.toThrow('at least 16 characters')
})
