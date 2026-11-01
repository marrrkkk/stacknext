import type { ReactElement } from 'react'
import type { NextScopeSpan } from '@nextscope/core'
import { formatDateTime, formatDuration, formatTime } from '../format'
import { cx, JsonView, StatusCodeBadge } from './ui'
import { Icon } from './Icon'

interface SpanRow {
  span: NextScopeSpan
  depth: number
}

function orderedRows(spans: NextScopeSpan[]): SpanRow[] {
  const ids = new Set(spans.map((span) => span.spanId))
  const children = new Map<string, NextScopeSpan[]>()
  const roots: NextScopeSpan[] = []
  for (const span of spans) {
    const parent =
      span.parentSpanId && ids.has(span.parentSpanId) ? span.parentSpanId : undefined
    if (!parent) {
      roots.push(span)
    } else {
      const list = children.get(parent) ?? []
      list.push(span)
      children.set(parent, list)
    }
  }
  const sort = (list: NextScopeSpan[]): NextScopeSpan[] =>
    [...list].sort((a, b) => a.startTime - b.startTime || a.spanId.localeCompare(b.spanId))
  const rows: SpanRow[] = []
  const seen = new Set<string>()
  const visit = (span: NextScopeSpan, depth: number): void => {
    if (seen.has(span.spanId)) return
    seen.add(span.spanId)
    rows.push({ span, depth })
    for (const child of sort(children.get(span.spanId) ?? [])) {
      visit(child, Math.min(depth + 1, 12))
    }
  }
  for (const root of sort(roots)) visit(root, 0)
  for (const span of sort(spans)) {
    if (!seen.has(span.spanId)) visit(span, 0)
  }
  return rows
}

function barTone(span: NextScopeSpan): string {
  if (span.status === 'error') return 'timeline__bar--error'
  if (span.nextSpanType?.includes('fetch')) return 'timeline__bar--fetch'
  if (span.kind === 'server') return 'timeline__bar--server'
  if (span.kind === 'client') return 'timeline__bar--client'
  return 'timeline__bar--internal'
}

export function SpanTimeline({
  spans,
  selectedSpanId,
  onSelect,
}: {
  spans: NextScopeSpan[]
  selectedSpanId: string | null
  onSelect: (spanId: string) => void
}): ReactElement {
  if (spans.length === 0) {
    return <p className="muted">No spans were captured for this trace.</p>
  }
  const rows = orderedRows(spans)
  const start = Math.min(...spans.map((span) => span.startTime))
  const end = Math.max(...spans.map((span) => span.endTime))
  const total = Math.max(1, end - start)
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="timeline">
      <div className="timeline__legend">
        <span>
          <i className="timeline__swatch timeline__bar--server" /> server
        </span>
        <span>
          <i className="timeline__swatch timeline__bar--fetch" /> fetch
        </span>
        <span>
          <i className="timeline__swatch timeline__bar--client" /> database/client
        </span>
        <span>
          <i className="timeline__swatch timeline__bar--error" /> error
        </span>
        <span className="timeline__range">
          {formatTime(start)} → {formatTime(end)}
        </span>
      </div>
      <div className="timeline__axis" aria-hidden="true">
        <span />
        <div className="timeline__ticks">
          {ticks.map((tick) => (
            <span key={tick} style={{ left: `${tick * 100}%` }}>
              {formatDuration(total * tick)}
            </span>
          ))}
        </div>
      </div>
      <div className="timeline__rows">
        {rows.map(({ span, depth }) => {
          const offset = ((span.startTime - start) / total) * 100
          const width = Math.max(0.6, (span.durationMs / total) * 100)
          const selected = span.spanId === selectedSpanId
          return (
            <button
              type="button"
              key={span.spanId}
              className={cx('timeline__row', selected && 'timeline__row--selected')}
              onClick={() => onSelect(span.spanId)}
            >
              <span className="timeline__name" style={{ paddingLeft: `${depth * 14}px` }}>
                {depth > 0 && <span className="timeline__branch">└</span>}
                <span className="timeline__name-text" title={span.name}>
                  {span.name}
                </span>
                {span.status === 'error' && <Icon name="errors" size={12} className="timeline__error-icon" />}
              </span>
              <span className="timeline__track">
                <span
                  className={cx('timeline__bar', barTone(span))}
                  style={{ left: `${offset}%`, width: `${width}%` }}
                />
              </span>
              <span className="timeline__duration">{formatDuration(span.durationMs)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function SpanDetail({ span }: { span: NextScopeSpan }): ReactElement {
  return (
    <div className="span-detail">
      <div className="span-detail__header">
        <div>
          <div className="eyebrow">Span</div>
          <h3>{span.name}</h3>
        </div>
        <StatusCodeBadge code={span.statusCode} failed={span.status === 'error'} />
      </div>
      <dl className="key-values">
        <div className="key-values__row">
          <dt>Kind</dt>
          <dd>{span.kind}</dd>
        </div>
        <div className="key-values__row">
          <dt>Status</dt>
          <dd>{span.status}</dd>
        </div>
        <div className="key-values__row">
          <dt>Duration</dt>
          <dd>{formatDuration(span.durationMs)}</dd>
        </div>
        <div className="key-values__row">
          <dt>Started</dt>
          <dd>{formatDateTime(span.startTime)}</dd>
        </div>
        <div className="key-values__row">
          <dt>Span ID</dt>
          <dd className="mono">{span.spanId}</dd>
        </div>
        <div className="key-values__row">
          <dt>Parent</dt>
          <dd className="mono">{span.parentSpanId ?? '—'}</dd>
        </div>
        {span.nextSpanType && (
          <div className="key-values__row">
            <dt>Next.js type</dt>
            <dd className="mono">{span.nextSpanType}</dd>
          </div>
        )}
        {span.route && (
          <div className="key-values__row">
            <dt>Route</dt>
            <dd className="mono">{span.route}</dd>
          </div>
        )}
        {span.statusMessage && (
          <div className="key-values__row">
            <dt>Message</dt>
            <dd>{span.statusMessage}</dd>
          </div>
        )}
      </dl>
      <details className="disclosure" open={Object.keys(span.attributes).length <= 8}>
        <summary>Attributes ({Object.keys(span.attributes).length})</summary>
        <JsonView value={span.attributes} maxHeight={320} />
      </details>
      {span.events.length > 0 && (
        <details className="disclosure">
          <summary>Events ({span.events.length})</summary>
          <JsonView value={span.events} maxHeight={260} />
        </details>
      )}
      <details className="disclosure">
        <summary>Resource</summary>
        <JsonView value={span.resource} maxHeight={200} />
      </details>
    </div>
  )
}
