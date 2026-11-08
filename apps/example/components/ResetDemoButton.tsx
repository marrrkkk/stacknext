'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from './Icon'

export function ResetDemoButton(): React.ReactElement {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const reset = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/seed', { method: 'POST' })
      const payload = (await response.json()) as { projects?: number }
      if (!response.ok) throw new Error(`Reset failed with HTTP ${response.status}`)
      router.refresh()
      setMessage(`Reset to ${payload.projects ?? 3} seeded projects.`)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="reset-action">
      <button
        type="button"
        className="button button--secondary button--small"
        onClick={() => void reset()}
        disabled={busy}
      >
        <Icon name="reset" size={13} />
        {busy ? 'Resetting…' : 'Reset demo data'}
      </button>
      <span className="reset-action__message" role="status" aria-live="polite">
        {message}
      </span>
    </div>
  )
}
