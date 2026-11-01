import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@nextscope/core/transport': `${root}packages/core/src/transport.ts`,
      '@nextscope/core': `${root}packages/core/src/index.ts`,
      '@nextscope/next': `${root}packages/next/src/index.ts`,
      '@nextscope/mcp': `${root}packages/mcp/src/index.ts`,
      '@nextscope/drizzle': `${root}packages/drizzle/src/index.ts`,
      '@nextscope/prisma': `${root}packages/prisma/src/index.ts`,
      nextscope: `${root}packages/cli/src/index.ts`,
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      reporter: ['text', 'html'],
    },
  },
})
