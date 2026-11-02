import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@stacknext/core/transport': `${root}packages/core/src/transport.ts`,
      '@stacknext/core/config-file': `${root}packages/core/src/config-file.ts`,
      '@stacknext/core': `${root}packages/core/src/index.ts`,
      '@stacknext/diagnostics': `${root}packages/diagnostics/src/index.ts`,
      '@stacknext/regression': `${root}packages/regression/src/index.ts`,
      '@stacknext/playwright': `${root}packages/playwright/src/index.ts`,
      '@stacknext/next': `${root}packages/next/src/index.ts`,
      '@stacknext/mcp': `${root}packages/mcp/src/index.ts`,
      '@stacknext/drizzle': `${root}packages/drizzle/src/index.ts`,
      '@stacknext/prisma': `${root}packages/prisma/src/index.ts`,
      '@stacknext/cli': `${root}packages/cli/src/index.ts`,
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
