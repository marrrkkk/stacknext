import { describe, expect, it } from 'vitest'
import type { ConnectionInfo } from '@stacknext/core'
import { captureStatus } from '../src/captureStatus.js'

function connection(instanceId: string, provider?: 'external' | 'stacknext', connected = true): ConnectionInfo {
  return { instanceId, serviceName: 'same-service', sdkVersion: 'test', lastSeen: 0, connected, provider }
}

describe('capture status per instance', () => {
  it('distinguishes mixed instances of the same service and ignores disconnected instances', () => {
    const status = captureStatus([
      connection('external-instance', 'external'),
      connection('active-instance'),
      connection('disconnected-instance', 'external', false),
    ])
    expect(status.partial).toBe(true)
    expect(status.affected).toBe('same-service (external-instance)')
    expect(status.connected).toHaveLength(2)
  })

  it('identifies fully inactive capture and names every affected instance', () => {
    const status = captureStatus([connection('one', 'external'), connection('two', 'external')])
    expect(status.partial).toBe(false)
    expect(status.inactive).toHaveLength(2)
    expect(status.affected).toBe('same-service (one), same-service (two)')
  })

  it('does not warn for active or absent connections', () => {
    expect(captureStatus([connection('active', 'stacknext')]).inactive).toEqual([])
    expect(captureStatus([]).inactive).toEqual([])
  })
})
