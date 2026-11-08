/** Local dashboard origin. Override for a non-default port with an env var. */
function dashboardUrl(value: string | undefined): string {
  try {
    const url = new URL(value ?? '')
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href
  } catch {
    // Invalid overrides fall back to the local dashboard.
  }
  return 'http://127.0.0.1:4400'
}

export const DASHBOARD_URL = dashboardUrl(process.env.NEXT_PUBLIC_STACKNEXT_DASHBOARD_URL)

/** Command that starts the collector from the example app directory. */
export const DEV_COMMAND = 'pnpm exec stacknext dev --open'
