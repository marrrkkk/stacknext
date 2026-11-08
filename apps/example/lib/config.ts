/** Local dashboard origin. Override for a non-default port with an env var. */
export const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_STACKNEXT_DASHBOARD_URL ?? 'http://127.0.0.1:4400'

/** Command that starts the collector from the example app directory. */
export const DEV_COMMAND = 'pnpm exec stacknext dev --open'
