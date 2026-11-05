import { describe, expect, it } from 'vitest'
import {
  formatBinarySize,
  formatExactBytes,
  formatExactDuration,
  formatHumanDuration,
} from '../src/format.js'

describe('formatHumanDuration', () => {
  it('uses compact units without losing the order of magnitude', () => {
    expect(formatHumanDuration(500)).toBe('500 ms')
    expect(formatHumanDuration(15_000)).toBe('15s')
    expect(formatHumanDuration(124_000)).toBe('2m 4s')
    expect(formatHumanDuration(600_000)).toBe('10 min')
    expect(formatHumanDuration(900_000)).toBe('15 min')
    expect(formatHumanDuration(3_600_000)).toBe('1h')
    expect(formatHumanDuration(7_500_000)).toBe('2h 5m')
  })

  it('handles missing and negative values', () => {
    expect(formatHumanDuration(null)).toBe('—')
    expect(formatHumanDuration(Number.NaN)).toBe('—')
    expect(formatHumanDuration(-1)).toBe('0 ms')
  })
})

describe('formatBinarySize', () => {
  it('prints binary units without a trailing .0', () => {
    expect(formatBinarySize(0)).toBe('0 B')
    expect(formatBinarySize(512)).toBe('512 B')
    expect(formatBinarySize(1_024)).toBe('1 KiB')
    expect(formatBinarySize(1_536)).toBe('1.5 KiB')
    expect(formatBinarySize(67_108_864)).toBe('64 MiB')
    expect(formatBinarySize(2_147_483_648)).toBe('2 GiB')
  })

  it('handles missing values', () => {
    expect(formatBinarySize(null)).toBe('—')
  })
})

describe('exact value helpers', () => {
  it('keeps the exact duration behind a friendly label', () => {
    expect(formatExactDuration(124_000)).toBe('124,000 ms')
    expect(formatExactDuration(0)).toBe('0 ms')
    expect(formatExactDuration(null)).toBe('Not captured')
  })

  it('keeps the exact byte count behind a friendly label', () => {
    expect(formatExactBytes(67_108_864)).toBe('67,108,864 bytes')
    expect(formatExactBytes(0)).toBe('0 bytes')
    expect(formatExactBytes(undefined)).toBe('Not captured')
  })
})
