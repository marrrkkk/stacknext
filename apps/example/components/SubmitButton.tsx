'use client'

import { useFormStatus } from 'react-dom'
import type { ComponentProps } from 'react'

interface SubmitButtonProps extends ComponentProps<'button'> {
  pendingLabel?: string
}

/** Disables a form button while the enclosing Server Action is pending. */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: SubmitButtonProps): React.ReactElement {
  const { pending } = useFormStatus()
  return (
    <button {...props} disabled={pending || props.disabled}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  )
}
