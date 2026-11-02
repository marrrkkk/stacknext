import { db } from '@/lib/db'
import { projects } from '@/lib/schema'

export const dynamic = 'force-dynamic'

/**
 * Deliberately throws so Next.js calls instrumentation `onRequestError` and
 * StackNext can demonstrate trace correlation and secret redaction. The fake
 * token never appears in the dashboard or export.
 */
export function GET(): Response {
  db.select().from(projects).all()
  throw new Error(
    'Demo failure from /api/error: token=super-secret-demo-token and password=hunter2',
  )
}
