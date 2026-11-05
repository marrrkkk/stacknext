import { useLayoutEffect, useRef, useState } from 'react'
import type { RequestSummary } from '@stacknext/core'
import { formatDuration, formatDurationParts, formatTime, formatTimeShort } from '../format'

type Outcome = 'ok' | 'slow' | 'error'

const SCALE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] as const

function roundedScaleMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  const step =
    SCALE_STEPS.find((candidate) => normalized < candidate - 1e-9) ?? 10
  return step * magnitude
}

function axisLabel(ms: number): string {
  const parts = formatDurationParts(ms)
  return parts.unit ? `${parts.value} ${parts.unit}` : parts.value
}

function outcomeFor(request: RequestSummary, thresholdMs: number): Outcome {
  if (request.failed || (request.statusCode ?? 0) >= 500) return 'error'
  if (request.slow || (request.durationMs ?? 0) > thresholdMs) return 'slow'
  return 'ok'
}

function recentRequests(requests: RequestSummary[]): RequestSummary[] {
  return [...requests].sort((a, b) => a.timestamp - b.timestamp).slice(-24)
}

export interface LatencyStats {
  errorCount: number
  slowCount: number
  slowest: number
  scaleMax: number
  allUnderThreshold: boolean
}

/** Presentation-only summary shared by the chart body and the card footer. */
export function latencyStats(
  requests: RequestSummary[],
  thresholdMs: number,
): LatencyStats {
  const recent = recentRequests(requests)
  const durations = recent.map((request) => request.durationMs ?? 0)
  const slowest = Math.max(0, ...durations)
  return {
    errorCount: recent.filter(
      (request) => outcomeFor(request, thresholdMs) === 'error',
    ).length,
    slowCount: recent.filter(
      (request) => outcomeFor(request, thresholdMs) === 'slow',
    ).length,
    slowest,
    scaleMax: roundedScaleMax(Math.max(slowest, 1)),
    allUnderThreshold: recent.length > 0 && slowest < thresholdMs,
  }
}

export function LatencyLegend({ thresholdMs }: { thresholdMs: number }): React.ReactElement {
  return (
    <span className="latency-legend" aria-label="Bar colour legend">
      <span className="latency-legend__item">
        <span className="latency-legend__swatch latency-legend__swatch--ok" aria-hidden="true" />
        ok
      </span>
      <span className="latency-legend__item">
        <span className="latency-legend__swatch latency-legend__swatch--slow" aria-hidden="true" />
        slow &gt; {formatDuration(thresholdMs)}
      </span>
      <span className="latency-legend__item">
        <span className="latency-legend__swatch latency-legend__swatch--error" aria-hidden="true" />
        error
      </span>
    </span>
  )
}

export function LatencyChart({
  requests,
  thresholdMs,
  onOpenRequest,
}: {
  requests: RequestSummary[]
  thresholdMs: number
  onOpenRequest: (traceId: string) => void
}): React.ReactElement {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const plotRef = useRef<HTMLDivElement | null>(null)
  const tooltipRef = useRef<HTMLSpanElement | null>(null)
  const recent = recentRequests(requests)
  const stats = latencyStats(requests, thresholdMs)
  const { scaleMax } = stats
  const thresholdInRange = thresholdMs <= scaleMax
  const thresholdBottom = thresholdInRange ? (thresholdMs / scaleMax) * 100 : null
  const thresholdHasOwnLabel =
    thresholdInRange &&
    Math.abs(thresholdMs - scaleMax) > 1 &&
    Math.abs(thresholdMs - scaleMax / 2) > 1
  const startTime = recent[0]?.timestamp
  const middleTime = recent[Math.floor((recent.length - 1) / 2)]?.timestamp
  const endTime = recent[recent.length - 1]?.timestamp
  const active = activeIndex === null ? null : recent[activeIndex]

  useLayoutEffect(() => {
    if (activeIndex === null) return
    const update = (): void => {
      const plot = plotRef.current
      const tooltip = tooltipRef.current
      if (!plot || !tooltip) return
      const plotWidth = plot.clientWidth
      const tooltipWidth = tooltip.offsetWidth
      const centre = ((activeIndex + 0.5) / Math.max(1, recent.length)) * plotWidth
      const half = tooltipWidth / 2
      const clamped = Math.min(plotWidth - half, Math.max(half, centre))
      tooltip.style.left = `${clamped}px`
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [active?.id, activeIndex, recent.length])

  return (
    <div className="latency-chart">
      <p className="sr-only">
        {recent.length} recent requests. {stats.slowCount} slow above{' '}
        {formatDuration(thresholdMs)}. {stats.errorCount} errors. Slowest{' '}
        {formatDuration(stats.slowest)}. Axis maximum {formatDuration(scaleMax)}.
      </p>
      <div className="latency-chart__frame">
        <div className="latency-chart__y-axis" aria-hidden="true">
          <span>{axisLabel(scaleMax)}</span>
          <span>{axisLabel(scaleMax / 2)}</span>
          <span>0</span>
        </div>
        <div className="latency-chart__plot" ref={plotRef}>
          <span
            className="latency-chart__gridline latency-chart__gridline--top"
            aria-hidden="true"
          />
          <span
            className="latency-chart__gridline latency-chart__gridline--mid"
            aria-hidden="true"
          />
          <span
            className="latency-chart__gridline latency-chart__gridline--bottom"
            aria-hidden="true"
          />
          {thresholdBottom !== null && (
            <span
              className="latency-chart__threshold"
              style={{ bottom: `${thresholdBottom}%` }}
              aria-hidden="true"
            >
              {thresholdHasOwnLabel && (
                <span className="latency-chart__threshold-label">
                  {formatDuration(thresholdMs)}
                </span>
              )}
            </span>
          )}
          {active && (
            <span
              ref={tooltipRef}
              className="latency-chart__tooltip"
              role="tooltip"
              style={{
                left: `${Math.min(
                  88,
                  Math.max(12, ((activeIndex ?? 0) + 0.5) / recent.length * 100),
                )}%`,
              }}
            >
              <span className="latency-chart__tooltip-title">
                <span className="mono">{active.method ?? '—'}</span>{' '}
                {active.route ?? active.name}
              </span>
              <span className="latency-chart__tooltip-meta">
                <span className="mono">{active.statusCode ?? (active.failed ? 'ERR' : '—')}</span>
                {' · '}
                {formatDuration(active.durationMs)}
                {' · '}
                {formatTime(active.timestamp)}
              </span>
            </span>
          )}
          <span className="latency-chart__bars">
            {recent.map((request, index) => {
              const outcome = outcomeFor(request, thresholdMs)
              return (
                <button
                  type="button"
                  key={request.id}
                  className={`latency-chart__item latency-chart__item--${outcome}`}
                  onClick={() => onOpenRequest(request.traceId)}
                  onPointerEnter={() => setActiveIndex(index)}
                  onPointerLeave={() => setActiveIndex(null)}
                  onFocus={() => setActiveIndex(index)}
                  onBlur={() => setActiveIndex(null)}
                  aria-label={`${request.method ?? 'request'} ${request.route ?? request.name}, status ${request.statusCode ?? (request.failed ? 'error' : 'unknown')}, ${formatDuration(request.durationMs)}, ${formatTime(request.timestamp)}. Open request.`}
                  title={`${request.method ?? ''} ${request.route ?? request.name} — ${formatDuration(request.durationMs)}`}
                >
                  <span
                    className="latency-chart__bar"
                    style={{
                      height: `${Math.max(
                        request.durationMs ? 2 : 0.8,
                        ((request.durationMs ?? 0) / scaleMax) * 100,
                      )}%`,
                    }}
                  />
                </button>
              )
            })}
          </span>
        </div>
      </div>
      <div className="latency-chart__x-axis" aria-hidden="true">
        <span>{formatTimeShort(startTime)}</span>
        <span>{formatTimeShort(middleTime)}</span>
        <span>{formatTimeShort(endTime)}</span>
      </div>
    </div>
  )
}
