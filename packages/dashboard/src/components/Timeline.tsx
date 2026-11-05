import { useMemo, useState, type ReactElement } from 'react'
import {
  SPAN_CATEGORY_LABELS,
  classifySpanCategory,
  isStandardNextSpanType,
  type StackNextSpan,
  type StackNextSpanCategory,
} from '@stacknext/core'
import {
  formatAbsolute,
  formatDuration,
  formatTime,
} from '../format'
import {
  Badge,
  CopyButton,
  EmptyState,
  KeyValue,
  SearchInput,
  StatusCodeBadge,
  cx,
} from './ui'
import { DurationValue, RelativeTime } from './details'
import { Icon } from './Icon'

interface SpanRow {
  span: StackNextSpan
  depth: number
  hasChildren: boolean
  collapsed: boolean
}

type CategoryFilter = 'all' | StackNextSpanCategory | 'error'

const CATEGORY_FILTERS: Array<{ key: CategoryFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'framework', label: 'Framework' },
  { key: 'app', label: 'App' },
  { key: 'database', label: 'Database' },
  { key: 'fetch', label: 'Fetch' },
  { key: 'error', label: 'Errors' },
]

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

function matchesCategory(span: StackNextSpan, filter: CategoryFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'error') return span.status === 'error'
  return categoryOf(span) === filter
}

function searchableText(span: StackNextSpan): string {
  return [
    span.name,
    span.nextSpanName,
    span.nextSpanType,
    span.nextRoute,
    span.nextPage,
    span.route,
    span.spanId,
    span.kind,
    span.status,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function ancestorsOf(spans: StackNextSpan[], ids: Set<string>): Set<string> {
  const byId = new Map(spans.map((span) => [span.spanId, span]))
  const visible = new Set(ids)
  for (const id of ids) {
    let parent = byId.get(id)?.parentSpanId
    const guard = new Set<string>()
    while (parent && !guard.has(parent)) {
      guard.add(parent)
      visible.add(parent)
      parent = byId.get(parent)?.parentSpanId
    }
  }
  return visible
}

function highlightText(value: string, query: string): React.ReactNode {
  if (!query) return value
  const index = value.toLowerCase().indexOf(query.toLowerCase())
  if (index < 0) return value
  return (
    <>
      {value.slice(0, index)}
      <mark className="timeline__match">{value.slice(index, index + query.length)}</mark>
      {value.slice(index + query.length)}
    </>
  )
}

function focusAdjacentRow(
  current: HTMLElement,
  delta: number | 'first' | 'last',
): void {
  const container = current.closest('.timeline__rows')
  if (!container) return
  const rows = [...container.querySelectorAll<HTMLElement>('.timeline__row')]
  if (rows.length === 0) return
  const index = rows.indexOf(current)
  const target =
    delta === 'first'
      ? 0
      : delta === 'last'
        ? rows.length - 1
        : Math.max(0, Math.min(rows.length - 1, index + delta))
  rows[target]?.focus()
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
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')

  const query = search.trim().toLowerCase()
  const filtering = query.length > 0 || category !== 'all'
  const allRows = useMemo(() => orderedRows(spans, collapsed), [collapsed, spans])
  const counts = useMemo(() => {
    const result = new Map<CategoryFilter, number>([['all', spans.length]])
    for (const filter of CATEGORY_FILTERS) {
      if (filter.key === 'all') continue
      result.set(
        filter.key,
        spans.filter((span) => matchesCategory(span, filter.key)).length,
      )
    }
    return result
  }, [spans])

  const rows = useMemo(() => {
    if (!filtering) return allRows
    const matching = new Set(
      spans
        .filter(
          (span) =>
            matchesCategory(span, category) &&
            (!query || searchableText(span).includes(query)),
        )
        .map((span) => span.spanId),
    )
    const visible = ancestorsOf(spans, matching)
    return orderedRows(spans, new Set()).filter((row) => visible.has(row.span.spanId))
  }, [allRows, category, filtering, query, spans])

  if (spans.length === 0) {
    return (
      <EmptyState
        compact
        icon="layers"
        title="No spans were captured for this trace"
        description="The trace may have been sampled without span detail, or retention removed the spans before this view loaded."
      />
    )
  }

  const start = Math.min(...spans.map((span) => span.startTime))
  const end = Math.max(...spans.map((span) => span.endTime))
  const total = Math.max(1, end - start)
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const parentIds = new Set(
    spans
      .map((span) => span.parentSpanId)
      .filter((value): value is string => Boolean(value)),
  )

  const toggle = (spanId: string): void => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(spanId)) next.delete(spanId)
      else next.add(spanId)
      return next
    })
  }

  const onRowKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    span: StackNextSpan,
    hasChildren: boolean,
    isCollapsed: boolean,
  ): void => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusAdjacentRow(event.currentTarget, 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusAdjacentRow(event.currentTarget, -1)
        break
      case 'Home':
        event.preventDefault()
        focusAdjacentRow(event.currentTarget, 'first')
        break
      case 'End':
        event.preventDefault()
        focusAdjacentRow(event.currentTarget, 'last')
        break
      case 'ArrowRight':
        if (hasChildren && isCollapsed) {
          event.preventDefault()
          toggle(span.spanId)
        }
        break
      case 'ArrowLeft':
        if (hasChildren && !isCollapsed) {
          event.preventDefault()
          toggle(span.spanId)
        }
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        onSelect(span.spanId)
        break
    }
  }

  return (
    <div className="timeline">
      <div className="timeline__toolbar">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search spans…"
          label="Search spans"
        />
        <div className="timeline__filters" role="group" aria-label="Span category">
          {CATEGORY_FILTERS.map((filter) => (
            <button
              type="button"
              key={filter.key}
              className={cx(
                'timeline__filter',
                category === filter.key && 'is-active',
              )}
              aria-pressed={category === filter.key}
              onClick={() => setCategory(filter.key)}
              title={`Show ${filter.label.toLowerCase()} spans`}
            >
              {filter.label}
              <span className="timeline__count"> {counts.get(filter.key) ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="timeline__actions">
          <span className="timeline__count" aria-live="polite">
            {rows.length} of {spans.length} rows
          </span>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => setCollapsed(new Set(parentIds))}
            disabled={parentIds.size === 0}
            title="Collapse every span with children"
          >
            Collapse all
          </button>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => setCollapsed(new Set())}
            disabled={collapsed.size === 0}
            title="Expand every span"
          >
            Expand all
          </button>
        </div>
      </div>

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

      <div className="timeline__ruler">
        <div className="timeline__axis" aria-hidden="true">
          <span />
          <div className="timeline__ticks">
            {ticks.map((tick) => (
              <span key={tick} style={{ left: `${tick * 100}%` }}>
                {formatDuration(total * tick)}
              </span>
            ))}
          </div>
          <span />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="timeline__empty">
          <EmptyState
            compact
            icon="search"
            title="No span matches these filters"
            description="Clear the search or choose All to see the full timeline."
            action={
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() => {
                  setSearch('')
                  setCategory('all')
                }}
              >
                Clear filters
              </button>
            }
          />
        </div>
      ) : (
        <div className="timeline__rows">
          <div className="timeline__grid" aria-hidden="true">
            <span />
            <div className="timeline__gridlines">
              {ticks.map((tick) => (
                <span
                  key={tick}
                  className="timeline__gridline"
                  style={{ left: `${tick * 100}%` }}
                />
              ))}
            </div>
            <span />
          </div>
          {rows.map(({ span, depth, hasChildren, collapsed: isCollapsed }) => {
            const offset = ((span.startTime - start) / total) * 100
            const width = Math.max(0.6, (span.durationMs / total) * 100)
            const selected = span.spanId === selectedSpanId
            const categoryValue = categoryOf(span)
            const verbose =
              span.nextSpanType !== undefined && !isStandardNextSpanType(span.nextSpanType)
            const displayName = span.nextSpanName ?? span.name
            const matching =
              !filtering ||
              (matchesCategory(span, category) &&
                (!query || searchableText(span).includes(query)))
            return (
              <div
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={`${displayName}, ${SPAN_CATEGORY_LABELS[categoryValue]}, ${formatDuration(span.durationMs)}, ${span.status}`}
                key={span.spanId}
                className={cx(
                  'timeline__row',
                  selected && 'timeline__row--selected',
                  filtering && !matching && 'timeline__row--dimmed',
                )}
                onClick={() => onSelect(span.spanId)}
                onKeyDown={(event) =>
                  onRowKeyDown(event, span, hasChildren, isCollapsed)
                }
              >
                <span className="timeline__name" style={{ paddingLeft: `${depth * 12}px` }}>
                  {hasChildren ? (
                    <button
                      type="button"
                      className="timeline__toggle"
                      aria-label={
                        isCollapsed ? 'Expand span children' : 'Collapse span children'
                      }
                      aria-expanded={!isCollapsed}
                      tabIndex={-1}
                      onClick={(event) => {
                        event.stopPropagation()
                        toggle(span.spanId)
                      }}
                    >
                      <Icon name={isCollapsed ? 'chevron-right' : 'chevron-down'} size={14} />
                    </button>
                  ) : (
                    depth > 0 && (
                      <span className="timeline__branch" aria-hidden="true">
                        └
                      </span>
                    )
                  )}
                  <span
                    className="timeline__name-text"
                    title={[
                      span.name,
                      span.nextSpanType,
                      span.nextRoute ? `route ${span.nextRoute}` : undefined,
                      span.spanId,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  >
                    {highlightText(displayName, query)}
                  </span>
                  <span className="timeline__category">
                    {SPAN_CATEGORY_LABELS[categoryValue]}
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
                <span className="timeline__duration">
                  <DurationValue ms={span.durationMs} />
                </span>
              </div>
            )
          })}
        </div>
      )}
      <div className="timeline__kbd-hint">
        <span>↑ ↓ move</span>
        <span>← → collapse/expand</span>
        <span>Enter select</span>
        <span>Home/End jump</span>
      </div>
      <p className="muted timeline__note">
        Span durations overlap. The trace window spans first start to last end and is not a
        sum of span durations. Durations are measured by OpenTelemetry; they are not a
        significance claim.
      </p>
    </div>
  )
}

export function SpanDetail({
  span,
  parentInTrace = false,
  traceStart,
  onSelectSpan,
}: {
  span: StackNextSpan
  parentInTrace?: boolean
  traceStart?: number
  onSelectSpan?: (spanId: string) => void
}): ReactElement {
  const category = categoryOf(span)
  const verbose =
    span.nextSpanType !== undefined && !isStandardNextSpanType(span.nextSpanType)
  const displayName = span.nextSpanName ?? span.name
  const attributeCount = Object.keys(span.attributes).length
  const offset =
    traceStart === undefined ? null : Math.max(0, span.startTime - traceStart)

  return (
    <div className="span-detail">
      <div className="span-detail__header">
        <span className="span-detail__label">Selected span</span>
        <StatusCodeBadge code={span.statusCode} failed={span.status === 'error'} />
      </div>
      <h3>{displayName}</h3>
      <div className="span-detail__badges">
        <Badge tone="accent">{SPAN_CATEGORY_LABELS[category]}</Badge>
        <Badge tone={span.status === 'error' ? 'bad' : 'muted'}>{span.status}</Badge>
        {verbose && <Badge tone="warn">verbose only</Badge>}
        {span.nextRsc && <Badge tone="muted">RSC</Badge>}
      </div>
      <div className="button-row span-detail__actions">
        {span.parentSpanId && parentInTrace && onSelectSpan && (
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => onSelectSpan(span.parentSpanId as string)}
            title={span.parentSpanId}
          >
            <Icon name="chevron-left" size={14} /> Parent span
          </button>
        )}
        <CopyButton value={span.spanId} label="Copy span id" small />
      </div>

      <h4 className="span-detail__section">Identity</h4>
      <KeyValue
        entries={[
          { label: 'Category', value: SPAN_CATEGORY_LABELS[category] },
          { label: 'Kind', value: span.kind },
          { label: 'Status', value: span.status },
          {
            label: 'Span ID',
            value: <span className="mono">{span.spanId}</span>,
            copyValue: span.spanId,
          },
          {
            label: 'Parent',
            value: span.parentSpanId ? (
              <span className="mono">{span.parentSpanId}</span>
            ) : null,
            emptyReason: 'This is a root span; no parent was captured.',
          },
          { label: 'Service', value: span.serviceName },
        ]}
      />

      <h4 className="span-detail__section">Timing</h4>
      <KeyValue
        entries={[
          {
            label: 'Duration',
            value: <DurationValue ms={span.durationMs} />,
            numeric: true,
          },
          {
            label: 'Started',
            value: <RelativeTime timestamp={span.startTime} />,
            title: formatAbsolute(span.startTime),
          },
          {
            label: 'Ended',
            value: <RelativeTime timestamp={span.endTime} />,
            title: formatAbsolute(span.endTime),
          },
          {
            label: 'Window offset',
            value:
              offset === null ? (
                <span className="unmeasured">not recorded</span>
              ) : (
                <span className="tabular">+{formatDuration(offset)}</span>
              ),
            title:
              'Offset from the first span start. The timeline uses the same relative scale.',
          },
        ]}
      />

      {(span.nextSpanType ||
        span.nextSpanName ||
        span.nextRoute ||
        span.nextPage ||
        span.nextSegment ||
        span.nextRsc !== undefined ||
        span.route ||
        span.method ||
        span.statusCode !== undefined) && (
        <>
          <h4 className="span-detail__section">Next.js context</h4>
          <KeyValue
            entries={[
              {
                label: 'Type',
                value: span.nextSpanType ? (
                  <span className="mono">{span.nextSpanType}</span>
                ) : null,
                emptyReason: 'No documented next.* span type was attached.',
              },
              {
                label: 'Name',
                value: span.nextSpanName ? (
                  <span className="mono">{span.nextSpanName}</span>
                ) : null,
                emptyReason: 'Next.js did not attach a separate span name.',
              },
              {
                label: 'Route',
                value: (span.nextRoute ?? span.route) ? (
                  <span className="mono">{span.nextRoute ?? span.route}</span>
                ) : null,
                emptyReason: 'No route attribute was captured.',
              },
              {
                label: 'Page',
                value: span.nextPage ? (
                  <span className="mono">{span.nextPage}</span>
                ) : null,
                emptyReason: 'No App Router page attribute was captured.',
              },
              {
                label: 'Segment',
                value: span.nextSegment ? (
                  <span className="mono">{span.nextSegment}</span>
                ) : null,
                emptyReason: 'No App Router segment attribute was captured.',
              },
              {
                label: 'RSC render',
                value:
                  span.nextRsc === undefined ? null : span.nextRsc ? 'yes' : 'no',
                emptyReason: 'Next.js did not mark this span as an RSC render.',
              },
              {
                label: 'Method',
                value: span.method ?? null,
                emptyReason: 'No HTTP method was captured on this span.',
              },
              {
                label: 'HTTP status',
                value:
                  span.statusCode === undefined ? null : String(span.statusCode),
                emptyReason: 'No HTTP status code was captured on this span.',
              },
            ]}
          />
        </>
      )}

      {span.statusMessage && (
        <>
          <h4 className="span-detail__section">Status message</h4>
          <p className="muted">{span.statusMessage}</p>
        </>
      )}

      <details className="disclosure" open={attributeCount > 0 && attributeCount <= 8}>
        <summary>Attributes ({attributeCount})</summary>
        {attributeCount === 0 ? (
          <p className="muted">No attributes were captured on this span.</p>
        ) : (
          <pre className="json-view" style={{ maxHeight: 320 }}>
            {JSON.stringify(span.attributes, null, 2)}
          </pre>
        )}
      </details>
      {span.events.length > 0 && (
        <details className="disclosure">
          <summary>Events ({span.events.length})</summary>
          <pre className="json-view" style={{ maxHeight: 260 }}>
            {JSON.stringify(span.events, null, 2)}
          </pre>
        </details>
      )}
      <details className="disclosure">
        <summary>Resource</summary>
        <pre className="json-view" style={{ maxHeight: 200 }}>
          {JSON.stringify(span.resource, null, 2)}
        </pre>
      </details>
    </div>
  )
}
