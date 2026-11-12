// Next.js (MIT) v15.5.0 and v16.0.0 implementation fixture.
// packages/next/src/server/lib/start-server.ts sets this title; the dev CLI
// forks it with NEXT_PRIVATE_WORKER=1, inheriting NODE_ENV=development.
// Neither release writes a JSON lock record. Sources:
// https://github.com/vercel/next.js/blob/v15.5.0/packages/next/src/server/lib/start-server.ts
// https://github.com/vercel/next.js/blob/v16.0.0/packages/next/src/server/lib/start-server.ts
// https://github.com/vercel/next.js/blob/v16.0.0/packages/next/src/cli/next-dev.ts
process.title = `next-server (v${process.env.__NEXT_VERSION})`
// trace/report/to-json.ts keeps a development trace WriteStream open.
// https://github.com/vercel/next.js/blob/v16.0.0/packages/next/src/trace/report/to-json.ts
import fs from 'node:fs'
const distDir = process.env.__NEXT_VERSION === '16.0.0' ? '.next/dev' : '.next'
fs.mkdirSync(distDir, { recursive: true })
// Next 16.0.0's lock is empty, with no JSON pid/port record.
if (process.env.__NEXT_VERSION === '16.0.0') fs.writeFileSync(`${distDir}/lock`, '')
const stream = fs.createWriteStream(`${distDir}/trace`, { flags: 'a' })
stream.on('open', () => process.send({ ready: true }))
setInterval(() => {}, 1000)
