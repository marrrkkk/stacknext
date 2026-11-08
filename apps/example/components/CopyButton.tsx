'use client'

import { useState } from 'react'
import { Icon } from './Icon'

export function CopyButton({
  value,
  label = 'Copy',
  small = false,
}: {
  value: string
  label?: string
  small?: boolean
}): React.ReactElement {
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      // Clipboard permission can fail; the value remains selectable.
    }
  }

  return (
    <>
      <button
        type="button"
        className={`button button--ghost${small ? ' button--small' : ''}`}
        onClick={() => void copy()}
        aria-label={copied ? 'Copied' : label}
        title={copied ? 'Copied' : label}
      >
        <Icon name={copied ? 'check' : 'copy'} size={small ? 12 : 14} />
        {copied ? 'Copied' : label}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? `${label}: copied to clipboard` : ''}
      </span>
    </>
  )
}
