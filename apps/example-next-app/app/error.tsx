'use client'

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
      <h1>Something failed on the server</h1>
      <p className="lede">
        This render failed on purpose in the demo. Open NextScope, go to Errors, and check the
        redacted message and correlated trace.
      </p>
      <pre className="error-digest">{error.message}</pre>
      <button type="button" className="button button--primary" onClick={reset}>
        Try again
      </button>
    </div>
  )
}
