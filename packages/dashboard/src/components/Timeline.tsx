import { useState, type ReactElement } from 'react'
import {
  SPAN_CATEGORY_LABELS,
  classifySpanCategory,
  isStandardNextSpanType,
  type StackNextSpan,
  type StackNextSpanCategory,
} from '@stacknext/core'
import { formatDateTime, formatDuration, formatTime } from '../format'
import { Badge, cx, JsonView, StatusCodeBadge } from './ui'
import { Icon } from './Icon'

interface SpanRow {
  span: StackNextSpan
  depth: number
  hasChildren: boolean
  collapsed: boolean
}

function spanTree(spans: StackNextSpan[]): {
  roots: StackNextSpan[]
  children: Map<string, StackNextSpan[]>
} {
  const ids = new Set(spans.map((span) => span.spanId))
  const children = new Map<string, StackNextSpan[]>()
  const roots: StackNextSpan[] = []
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
  return { roots, children }
}

function sortSpans(list: StackNextSpan[]): StackNextSpan[] {
  return [...list].sort(
    (a, b) => a.startTime - b.startTime || a.spanId.localeCompare(b.spanId),
  )
}

function orderedRows(spans: StackNextSpan[], collapsed: Set<string>): SpanRow[] {
  const { roots, children } = spanTree(spans)
  const rows: SpanRow[] = []
  const seen = new Set<string>()
  const visit = (span: StackNextSpan, depth: number): void => {
    if (seen.has(span.spanId)) return
    seen.add(span.spanId)
    const childList = sortSpans(children.get(span.spanId) ?? [])
    const isCollapsed = collapsed.has(span.spanId)
    rows.push({
      span,
      depth,
      hasChildren: childList.length > 0,
      collapsed: isCollapsed,
    })
    if (isCollapsed) return
    for (const child of childList) visit(child, Math.min(depth + 1, 12))
  }
  for (const root of sortSpans(roots)) visit(root, 0)
  for (const span of sortSpans(spans)) {
    if (!seen.has(span.spanId)) visit(span, 0)
  }
  return rows
}

function categoryOf(span: StackNextSpan): StackNextSpanCategory {
  return classifySpanCategory(span)
}

function barTone(span: StackNextSpan): string {
  if (span.status === 'error') return 'timeline__bar--error'
  switch (categoryOf(span)) {
    case 'framework':
      return 'timeline__bar--framework'
    case 'app':
      return 'timeline__bar--app'
    case 'database':
      return 'timeline__bar--database'
    case 'fetch':
      return 'timeline__bar--fetch'
  }
}

function durationLabel(ms: number): string {
  return Number.isFinite(ms) ? formatDuration(ms) : 'unknown'
}

export function SpanTimeline({
  spans,
  selectedSpanId,
  onSelect,
}: {
  spans: StackNextSpan[]
  selectedSpanId: string | null
  onSelect: (spanId: string) => void
}): ReactElement {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  if (spans.length === 0) {
    return <p className="muted">No spans were captured for this trace.</p>
  }
  const rows = orderedRows(spans, collapsed)
  const start = Math.min(...spans.map((span) => span.startTime))
  const end = Math.max(...spans.map((span) => span.endTime))
  const total = Math.max(1, end - start)
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  const toggle = (spanId: string): void => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(spanId)) next.delete(spanId)
      else next.add(spanId)
      return next
    })
  }

  return (
    <div className="timeline">
      <div className="timeline__legend">
        <span>
          <i className="timeline__swatch timeline__bar--framework" /> framework
        </span>
        <span>
          <i className="timeline__swatch timeline__bar--app" /> app/custom
        </span>
        <span>
          <i className="timeline__swatch timeline__bar--database" /> database
        </span>
        <span>
          <i className="timeline__swatch timeline__bar--fetch" /> fetch
        </span>
        <span>
          <i className="timeline__swatch timeline__bar--error" /> error
        </span>
        <span className="timeline__range">
          window {formatTime(start)} → {formatTime(end)}
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
        {rows.map(({ span, depth, hasChildren, collapsed: isCollapsed }) => {
          const offset = ((span.startTime - start) / total) * 100
          const width = Math.max(0.6, (span.durationMs / total) * 100)
          const selected = span.spanId === selectedSpanId
          const category = categoryOf(span)
          const verbose = span.nextSpanType !== undefined && !isStandardNextSpanType(span.nextSpanType)
          const displayName = span.nextSpanName ?? span.name
          return (
            <div
              role="button"
              tabIndex={0}
              key={span.spanId}
              className={cx('timeline__row', selected && 'timeline__row--selected')}
              onClick={() => onSelect(span.spanId)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(span.spanId)
                }
              }}
            >
              <span className="timeline__name" style={{ paddingLeft: `${depth * 14}px` }}>
                {hasChildren ? (
                  <button
                    type="button"
                    className="timeline__toggle"
                    aria-label={isCollapsed ? 'Expand span children' : 'Collapse span children'}
                    aria-expanded={!isCollapsed}
                    onClick={(event) => {
                      event.stopPropagation()
                      toggle(span.spanId)
                    }}
                  >
                    {isCollapsed ? '▸' : '▾'}
                  </button>
                ) : (
                  depth > 0 && <span className="timeline__branch">└</span>
                )}
                <span
                  className="timeline__name-text"
                  title={[
                    span.name,
                    span.nextSpanType,
                    span.nextRoute ? `route ${span.nextRoute}` : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                >
                  {displayName}
                </span>
                <span className={cx('timeline__category', `timeline__category--${category}`)}>
                  {SPAN_CATEGORY_LABELS[category]}
                </span>
                {verbose && <span className="timeline__verbose">verbose</span>}
                {span.status === 'error' && (
                  <Icon name="errors" size={12} className="timeline__error-icon" />
                )}
              </span>
              <span className="timeline__track">
                <span
                  className={cx('timeline__bar', barTone(span))}
                  style={{ left: `${offset}%`, width: `${width}%` }}
                />
              </span>
              <span className="timeline__duration">{durationLabel(span.durationMs)}</span>
            </div>
          )
        })}
      </div>
      <p className="muted timeline__note">
        Span durations overlap. The trace window spans first start to last end and is not a
        sum of span durations.
      </p>
    </div>
  )
}

export function SpanDetail({
  span,
  requestTraceId,
  parentInTrace = false,
  onSelectSpan,
  onNavigateRequest,
}: {
  span: StackNextSpan
  requestTraceId?: string | null
  parentInTrace?: boolean
  onSelectSpan?: (spanId: string) => void
  onNavigateRequest?: () => void
}): ReactElement {
  const category = categoryOf(span)
  const verbose = span.nextSpanType !== undefined && !isStandardNextSpanType(span.nextSpanType)
  const displayName = span.nextSpanName ?? span.name
  return (
    <div className="span-detail">
      <div className="span-detail__header">
        <div>
          <div className="eyebrow">Span</div>
          <h3>{displayName}</h3>
          <div className="span-detail__badges">
            <Badge tone="accent">{SPAN_CATEGORY_LABELS[category]}</Badge>
            {verbose && <Badge tone="warn">verbose only</Badge>}
            {span.nextRsc && <Badge tone="muted">RSC</Badge>}
          </div>
        </div>
        <StatusCodeBadge code={span.statusCode} failed={span.status === 'error'} />
      </div>
      <div className="button-row span-detail__actions">
        {span.parentSpanId && parentInTrace && onSelectSpan && (
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => onSelectSpan(span.parentSpanId as string)}
          >
            <Icon name="chevron-left" size={14} /> Parent span
          </button>
        )}
        {requestTraceId && onNavigateRequest && (
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={onNavigateRequest}
          >
            <Icon name="arrow-right" size={14} /> Open request
          </button>
        )}
      </div>
      <dl className="key-values">
        <div className="key-values__row">
          <dt>Category</dt>
          <dd>{SPAN_CATEGORY_LABELS[category]}</dd>
        </div>
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
          <dd>{durationLabel(span.durationMs)}</dd>
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
        {span.nextSpanName && span.nextSpanName !== span.name && (
          <div className="key-values__row">
            <dt>Next.js name</dt>
            <dd className="mono">{span.nextSpanName}</dd>
          </div>
        )}
        {span.nextRoute && (
          <div className="key-values__row">
            <dt>Next.js route</dt>
            <dd className="mono">{span.nextRoute}</dd>
          </div>
        )}
        {span.nextPage && (
          <div className="key-values__row">
            <dt>Next.js page</dt>
            <dd className="mono">{span.nextPage}</dd>
          </div>
        )}
        {span.nextSegment && (
          <div className="key-values__row">
            <dt>Next.js segment</dt>
            <dd className="mono">{span.nextSegment}</dd>
          </div>
        )}
        {span.nextRsc !== undefined && (
          <div className="key-values__row">
            <dt>RSC render</dt>
            <dd>{span.nextRsc ? 'yes' : 'no'}</dd>
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
