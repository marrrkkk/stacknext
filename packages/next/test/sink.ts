import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { StackNextIngestEnvelope } from '@stacknext/core'

export interface IngestSink {
  url: string
  envelopes: StackNextIngestEnvelope[]
  waitForEnvelopes(count: number, timeoutMs?: number): Promise<void>
  close(): Promise<void>
}

/**
 * Minimal loopback ingest endpoint used to verify what the SDK actually puts on
 * the wire. It intentionally performs no normalization.
 */
export async function startIngestSink(): Promise<IngestSink> {
  const envelopes: StackNextIngestEnvelope[] = []
  const waiters: Array<() => void> = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as StackNextIngestEnvelope
        envelopes.push(parsed)
        for (const notify of waiters.splice(0)) notify()
      } catch {
        // Invalid payloads are not expected in SDK tests.
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"ok":true}')
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${address.port}`,
    envelopes,
    waitForEnvelopes(count, timeoutMs = 3_000) {
      if (envelopes.length >= count) return Promise.resolve()
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`timed out waiting for ${count} ingest envelopes`))
        }, timeoutMs)
        waiters.push(() => {
          if (envelopes.length >= count) {
            clearTimeout(timer)
            resolve()
          }
        })
      })
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()))
    },
  }
}
