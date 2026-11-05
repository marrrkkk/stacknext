import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Accessible confirmation surface for destructive, irreversible actions.
 *
 * Focus starts on Cancel, stays trapped inside the dialog and returns to the
 * trigger when the dialog closes. Escape and the backdrop cancel the action.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  details,
  confirmLabel,
  busyLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description: ReactNode
  details?: ReactNode
  confirmLabel: string
  busyLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}): React.ReactElement | null {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = window.requestAnimationFrame(() => cancelRef.current?.focus())
    return () => {
      window.cancelAnimationFrame(frame)
      if (previous?.isConnected) previous.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return
    if (busy) {
      // Buttons disable while the request runs, which would otherwise drop
      // focus to the document body and escape the trap.
      dialog.focus()
      return
    }
    if (
      !dialog.contains(document.activeElement) ||
      document.activeElement === dialog
    ) {
      cancelRef.current?.focus()
    }
  }, [busy, open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!busy) onCancel()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => node.tabIndex >= 0,
      )
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, onCancel, open])

  if (!open) return null

  return createPortal(
    <div
      className="command-overlay confirm-overlay"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget || busy) return
        onCancel()
      }}
    >
      <div
        ref={dialogRef}
        className="command-dialog confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        <div className="confirm-dialog__body">
          <h2 className="confirm-dialog__title" id={titleId}>
            {title}
          </h2>
          <div className="confirm-dialog__description" id={descriptionId}>
            {description}
          </div>
          {details && <div className="confirm-dialog__details">{details}</div>}
          {error && (
            <div className="confirm-dialog__error" role="alert">
              <Icon name="errors" size={15} />
              <span>{error}</span>
            </div>
          )}
        </div>
        <div className="confirm-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            className="button button--secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              tone === 'danger'
                ? 'button button--danger-solid'
                : 'button button--primary'
            }
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {busy && <Icon name="refresh" size={15} className="icon-button__spin" />}
            {busy ? (busyLabel ?? `${confirmLabel}…`) : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
