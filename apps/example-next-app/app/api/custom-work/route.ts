import { withStackNextSpan, withStackNextSpanSync } from '@stacknext/next'

export const dynamic = 'force-dynamic'

/**
 * Demonstrates the manual span helpers inside a route handler. The attributes
 * include secrets and a URL with a query string so the e2e test can prove both
 * app-side and collector-side redaction.
 */
export async function GET(): Promise<Response> {
  const result = await withStackNextSpan(
    'demo.custom.async',
    {
      attributes: {
        'app.custom': true,
        authorization: 'Bearer custom-attribute-secret',
        'app.demo.url': '/api/custom-work?token=custom-url-secret',
      },
    },
    async (span) => {
      span.setAttribute('app.stage', 'async')
      const sync = withStackNextSpanSync(
        'demo.custom.sync',
        { attributes: { 'app.sync': true } },
        () => 'sync-result',
      )
      await new Promise((resolve) => setTimeout(resolve, 5))
      return { sync }
    },
  )

  return Response.json({ ok: true, ...result })
}
