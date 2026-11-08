'use client'

import { useState } from 'react'
import { EXPECTED_ERROR_IDS, TRAFFIC_ROUTES } from '@/lib/demo-routes'
import { Icon } from './Icon'

interface RunResult {
  id: string
  label: string
  path: string
  status: number | null
  ms: number
  expected: boolean
}

export function ScenarioRunner({
  dashboardUrl,
}: {
  dashboardUrl: string
}): React.ReactElement {
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<RunResult[]>([])
  const [error, setError] = useState<string | null>(null)

  const run = async (): Promise<void> => {
    setRunning(true)
    setError(null)
    setResults([])
    const next: RunResult[] = []
    try {
      for (const route of TRAFFIC_ROUTES) {
        const started = performance.now()
        try {
          const response = await fetch(route.path, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
          await response.arrayBuffer()
          next.push({
            id: route.id,
            label: route.title,
            path: route.path,
            status: response.status,
            ms: Math.round(performance.now() - started),
            expected: EXPECTED_ERROR_IDS.has(route.id) ? response.status === 500 : response.ok,
          })
        } catch (cause) {
          next.push({
            id: route.id,
            label: route.title,
            path: route.path,
            status: null,
            ms: Math.round(performance.now() - started),
            expected: false,
          })
          setError(cause instanceof Error ? cause.message : String(cause))
        }
        setResults([...next])
      }
    } finally {
      setRunning(false)
    }
  }

  const completed = results.length
  const allExpected = completed > 0 && results.every((result) => result.expected)

  return (
    <div className="runner">
      <div className="runner__bar">
        <button
          type="button"
          className="button button--primary"
          onClick={() => void run()}
          disabled={running}
        >
          <Icon name={running ? 'reset' : 'play'} size={14} />
          {running ? `Running ${completed}/${TRAFFIC_ROUTES.length}…` : 'Generate demo traffic'}
        </button>
        <span className="runner__hint">
          Runs {TRAFFIC_ROUTES.length} safe requests locally. The error route is
          intentional.
        </span>
      </div>

      {completed > 0 && (
        <div className="runner__results" aria-live="polite">
          <div className="runner__summary">
            <span className={`chip chip--${allExpected ? 'good' : 'warn'}`}>
              <span className="chip__dot" aria-hidden="true" />
              <span className="chip__label">
                {completed}/{TRAFFIC_ROUTES.length} requests completed
              </span>
            </span>
            {!running && (
              <a className="button button--secondary button--small" href={dashboardUrl} target="_blank" rel="noreferrer">
                Inspect in StackNext
                <Icon name="external" size={12} />
              </a>
            )}
          </div>
          <ul className="runner__log">
            {results.map((result) => (
              <li key={result.id} className="runner__log-row">
                <span
                  className={`runner__status runner__status--${
                    result.expected ? 'ok' : 'bad'
                  }`}
                >
                  {result.status ?? 'ERR'}
                </span>
                <span className="runner__log-label">{result.label}</span>
                <code className="runner__log-path">{result.path}</code>
                <span className="runner__log-time">{result.ms} ms</span>
              </li>
            ))}
          </ul>
          {error && <p className="runner__error">{error}</p>}
        </div>
      )}
    </div>
  )
}
