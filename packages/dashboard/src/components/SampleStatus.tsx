import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { HealthResponse, SnapshotSummary } from '@stacknext/core'
import { api } from '../api'
import { Icon } from './Icon'
import { formatDateTime, formatNumber } from '../format'

function countdownLabel(remainingMs: number): string {
  if (remainingMs <= 0) return 'Sample expired'
  if (remainingMs < 60_000) return `Expires in ${Math.max(1, Math.ceil(remainingMs / 1_000))}s`
  if (remainingMs < 3_600_000) {
    return `Expires in ${Math.ceil(remainingMs / 60_000)}m`
  }
  const hours = Math.floor(remainingMs / 3_600_000)
  const minutes = Math.ceil((remainingMs % 3_600_000) / 60_000)
  return `Expires in ${hours}h ${minutes}m`
}

export function SampleStatus({
  health,
  onNavigate,
}: {
  health: HealthResponse | null
  onNavigate: (path: string) => void
}): React.ReactElement | null {
  const [now, setNow] = useState(() => Date.now())
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<SnapshotSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!open) return
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    const shell = document.querySelector<HTMLElement>('.shell')
    const wasInert = shell?.hasAttribute('inert') ?? false
    if (shell && !wasInert) shell.setAttribute('inert', '')
    const focusable = (): HTMLElement[] =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((node) => node.tabIndex >= 0)
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const nodes = focusable()
      if (nodes.length === 0) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      if (shell && !wasInert) shell.removeAttribute('inert')
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open || (!saving && !saved)) return
    dialogRef.current?.focus()
  }, [open, saved, saving])

  if (!health) return null

  const sample = health.sample
  const lastEventTime = sample.lastEventTime
  const lastReceivedAt = sample.lastReceivedAt
  const expiresAt = lastReceivedAt === null ? null : lastReceivedAt + sample.retentionMs
  const remaining = expiresAt === null ? null : expiresAt - now
  const hasData =
    health.counts.spans + health.counts.errors + health.counts.databaseQueries > 0
  const urgent = remaining !== null && remaining <= 60_000

  const openDialog = (): void => {
    setSaved(null)
    setError(null)
    setOpen(true)
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      const snapshot = await api.saveSnapshot(label.trim() || undefined)
      setSaved(snapshot)
      setLabel('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSaving(false)
    }
  }

  const go = (path: string): void => {
    setOpen(false)
    onNavigate(path)
  }

  return (
    <>
      <div className="topbar__sample">
        <span
          className={urgent ? 'sample-countdown sample-countdown--urgent' : 'sample-countdown'}
          title={
            expiresAt === null
              ? 'No events in the current sample yet'
              : `Last event ${formatDateTime(lastEventTime)} · retention ${formatDateTime(expiresAt)}`
          }
        >
          <Icon name="clock" size={13} />
          {remaining === null ? 'No live sample' : countdownLabel(remaining)}
        </span>
        <button
          type="button"
          className="button button--secondary button--small topbar__save-sample"
          onClick={openDialog}
          disabled={!hasData}
          title={
            hasData
              ? 'Save the current sample as a frozen local snapshot'
              : 'No telemetry in the current sample to save'
          }
        >
          <Icon name="layers" size={14} /> Save sample
        </button>
      </div>

      {open &&
        createPortal(
          <div
            className="command-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false)
            }}
          >
            <div
              ref={dialogRef}
              className="command-dialog sample-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="sample-dialog-title"
              tabIndex={-1}
            >
              <header className="sample-dialog__head">
                <div>
                  <h2 className="sample-dialog__title" id="sample-dialog-title">
                    {saved ? 'Snapshot saved' : 'Save current sample'}
                  </h2>
                  <p className="sample-dialog__subtitle">
                    {saved
                      ? 'The snapshot is now stored under .stacknext/snapshots.'
                      : 'Freeze the current in-memory telemetry before the retention window expires.'}
                  </p>
                </div>
                <button
                  type="button"
                  className="button button--ghost button--icon button--compact"
                  onClick={() => setOpen(false)}
                  aria-label="Close save snapshot dialog"
                >
                  <Icon name="close" size={16} />
                </button>
              </header>

              <div className="sample-dialog__body">
                {saved ? (
                  <>
                    <div className="sample-dialog__success">
                      <Icon name="check" size={16} />
                      <div>
                        <div className="mono">{saved.id}</div>
                        <div className="muted">
                          {formatNumber(saved.stats.requests)} requests ·{' '}
                          {formatNumber(saved.stats.spans)} spans ·{' '}
                          {formatNumber(saved.stats.errors)} errors ·{' '}
                          {formatNumber(saved.stats.databaseQueries)} queries
                        </div>
                      </div>
                    </div>
                    <div className="sample-dialog__actions">
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={() => go(`/snapshots/${saved.id}`)}
                      >
                        Open snapshot
                      </button>
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => go('/snapshots')}
                      >
                        View all snapshots
                      </button>
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => setOpen(false)}
                      >
                        Done
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="sample-dialog__field">
                      <span>Label</span>
                      <input
                        ref={inputRef}
                        type="text"
                        value={label}
                        maxLength={200}
                        placeholder="e.g. before index change"
                        onChange={(event) => setLabel(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !saving) void save()
                        }}
                      />
                    </label>
                    <p className="muted">
                      Optional. Manual snapshots are never deleted by automatic rotation. The
                      snapshot is redacted and frozen; it never replaces live telemetry.
                    </p>
                    {error && (
                      <div className="sample-dialog__error" role="alert">
                        <Icon name="errors" size={15} /> {error}
                      </div>
                    )}
                    <div className="sample-dialog__actions">
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={() => void save()}
                        disabled={saving}
                        aria-busy={saving || undefined}
                      >
                        <Icon
                          name={saving ? 'refresh' : 'layers'}
                          size={15}
                          className={saving ? 'icon-button__spin' : undefined}
                        />
                        {saving ? 'Saving…' : 'Save snapshot'}
                      </button>
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => setOpen(false)}
                        disabled={saving}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
