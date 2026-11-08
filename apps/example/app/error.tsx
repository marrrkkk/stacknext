'use client'

import { Icon } from '@/components/Icon'
import { DASHBOARD_URL } from '@/lib/config'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}): React.ReactElement {
  return (
    <div className="not-found">
      <p className="eyebrow">Server error</p>
      <h1 className="page-head__title">Something failed on the server</h1>
      <p className="page-head__description">
        This render failed on purpose in the example. Open StackNext, go to Errors, and check
        the redacted message, stack and correlated trace.
      </p>
      <pre className="error-digest">{error.message}</pre>
      <div className="button-row">
        <button type="button" className="button button--primary button--small" onClick={reset}>
          <Icon name="reset" size={13} />
          Try again
        </button>
        <a
          className="button button--secondary button--small"
          href={`${DASHBOARD_URL}/errors`}
          target="_blank"
          rel="noreferrer"
        >
          Open errors
          <Icon name="external" size={12} />
        </a>
      </div>
    </div>
  )
}
