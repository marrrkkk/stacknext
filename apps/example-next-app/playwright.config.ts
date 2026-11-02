import { defineConfig } from '@playwright/test'

const baseURL = process.env.STACKNEXT_APP_URL ?? 'http://127.0.0.1:4402'

// Telemetry capture is only active when `stacknext capture` supplies a run id
// and collector credentials. Running `playwright test` directly stays a normal,
// collector-free browser test.
if (process.env.STACKNEXT_CAPTURE === '1') {
  process.env.STACKNEXT_CAPTURE_TIMEOUT_MS ??= '15000'
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: 'list',
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
})
