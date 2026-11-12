import type { ConnectionInfo } from '@stacknext/core'

/** Provider mode describes one connected instance, never the whole collector. */
export function captureStatus(connections: ConnectionInfo[]) {
  const connected = connections.filter((connection) => connection.connected)
  const inactive = connected.filter((connection) => connection.provider === 'external')
  return {
    connected,
    inactive,
    partial: inactive.length > 0 && inactive.length < connected.length,
    affected: inactive.map((connection) => `${connection.serviceName} (${connection.instanceId})`).join(', '),
  }
}
