import type { HealthResponse } from '@stacknext/core'
import { api, type ConfigResponse } from '../api'
import { useAsync, type Theme } from '../hooks'
import {
  Badge,
  Card,
  CopyButton,
  EmptyState,
  ErrorState,
  KeyValue,
  Loading,
  PageHeader,
} from '../components/ui'
import { Icon } from '../components/Icon'
import { formatDuration, formatNumber, formatRelative } from '../format'

interface SettingsData {
  config: ConfigResponse
  health: HealthResponse
}

const MCP_CONFIG = `{
  "mcpServers": {
    "stacknext": {
      "command": "stacknext",
      "args": ["mcp"],
      "cwd": "/absolute/path/to/your/next-app"
    }
  }
}`

const DRIZZLE_SNIPPET = `import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createStackNextDrizzleLogger } from '@stacknext/drizzle'

export const db = drizzle(client, {
  logger: createStackNextDrizzleLogger({ databaseSystem: 'sqlite' }),
})`

const PRISMA_SNIPPET = `import { PrismaClient } from '@prisma/client'
import { instrumentPrismaClient } from '@stacknext/prisma'

const prisma = new PrismaClient()
instrumentPrismaClient(prisma, { databaseSystem: 'sqlite' })

export { prisma }`

export function SettingsPage({
  refreshKey,
  theme,
  onThemeChange,
}: {
  refreshKey: number
  theme: Theme
  onThemeChange: (theme: Theme) => void
}): React.ReactElement {
  const state = useAsync<SettingsData>(
    async (signal) => {
      const [config, health] = await Promise.all([api.config(signal), api.health(signal)])
      return { config, health }
    },
    'settings',
    refreshKey,
    30_000,
  )

  if (state.loading && !state.data) {
    return (
      <>
        <PageHeader title="MCP & settings" description="Loading configuration…" />
        <Loading rows={6} />
      </>
    )
  }
  if (state.error && !state.data) {
    return (
      <>
        <PageHeader title="MCP & settings" />
        <ErrorState message={state.error} onRetry={state.reload} />
      </>
    )
  }
  if (!state.data) return <Loading />

  const { config, health } = state.data
  const connected = health.connections.filter((connection) => connection.connected)
  const verbose = health.instrumentation.nextOtelVerbose

  return (
    <>
      <PageHeader
        eyebrow={config.projectName}
        title="MCP & settings"
        description="Connect an AI client to local telemetry, review privacy boundaries and inspect collector configuration."
      />

      <div className="grid grid--2">
        <Card
          title="MCP server"
          subtitle="Read-only stdio server for Claude Desktop, Codex and other MCP clients"
          actions={
            <CopyButton value={MCP_CONFIG} label="Copy config" />
          }
        >
          <p className="prose">
            StackNext exposes seventeen read-only tools: project summary, requests, traces, errors,
            database queries, slow-request search, deterministic diagnostics and saved regression
            runs, baselines and comparisons. No tool can mutate your app, telemetry or regression
            records.
          </p>
          <pre className="code-block code-block--scroll">{MCP_CONFIG}</pre>
          <p className="muted small">
            Start the collector with <code>stacknext dev</code> first. The MCP server reads the
            bearer token from <code>.stacknext/run.json</code>; the token never leaves loopback.
          </p>
        </Card>

        <Card title="Data safety" subtitle="What is stored, and what is not">
          <div className="safety-grid">
            <div className="safety-item safety-item--good">
              <Icon name="check" size={16} />
              <span>Request bodies are never captured</span>
            </div>
            <div className="safety-item safety-item--good">
              <Icon name="check" size={16} />
              <span>Headers, cookies and authorization values are dropped</span>
            </div>
            <div className="safety-item safety-item--good">
              <Icon name="check" size={16} />
              <span>URL query strings and SQL bind parameters are removed</span>
            </div>
            <div className="safety-item safety-item--good">
              <Icon name="check" size={16} />
              <span>Collector binds to 127.0.0.1 only</span>
            </div>
            <div className="safety-item safety-item--warn">
              <Icon name="shield" size={16} />
              <span>Stack traces and redacted SQL are stored in memory</span>
            </div>
            <div className="safety-item safety-item--warn">
              <Icon name="shield" size={16} />
              <span>Runs, baselines and comparisons are redacted files under .stacknext</span>
            </div>
          </div>
          <div className="button-row">
            <a className="button button--primary" href="/api/export" download>
              <Icon name="download" size={15} /> Export telemetry
            </a>
            <button type="button" className="button button--ghost" onClick={state.reload}>
              <Icon name="refresh" size={15} /> Refresh
            </button>
          </div>
          <p className="muted small">
            Data is bounded to {formatNumber(health.store.limits.maxSpans)} spans and{' '}
            {formatDuration(health.store.limits.retentionMs)} of retention. Exports are JSON and
            contain the same redacted fields as the dashboard.
          </p>
        </Card>

        <Card title="Collector" subtitle="Local-only ingestion endpoint">
          <KeyValue
            entries={[
              { label: 'Dashboard', value: <span className="mono">{health.dashboardUrl}</span> },
              {
                label: 'Ingestion',
                value: <span className="mono">{`${health.dashboardUrl}/__stacknext/v1/ingest`}</span>,
              },
              { label: 'Version', value: health.version },
              { label: 'Uptime', value: formatDuration(health.uptimeMs) },
              {
                label: 'Connected apps',
                value: connected.length > 0 ? connected.map((entry) => entry.serviceName).join(', ') : 'none yet',
              },
              {
                label: 'Telemetry',
                value: `${formatNumber(health.counts.spans)} spans · ${formatNumber(health.counts.errors)} errors · ${formatNumber(health.counts.databaseQueries)} queries`,
              },
              {
                label: 'Dropped',
                value: `${health.store.dropped.capacity + health.store.dropped.retention + health.server.droppedMalformed + health.server.droppedPayload + health.exporter.droppedSpans + health.exporter.droppedEvents} events`,
              },
            ]}
          />
        </Card>

        <Card title="Configuration" subtitle="Read from stacknext.config.json">
          <KeyValue
            entries={[
              { label: 'Dashboard port', value: config.config.dashboard.port },
              { label: 'Max spans', value: formatNumber(config.config.collector.maxSpans) },
              { label: 'Retention', value: formatDuration(config.config.collector.retentionMs) },
              { label: 'Slow threshold', value: formatDuration(config.config.slowRequestMs) },
              {
                label: 'Capture fetch',
                value: config.config.instrumentation.captureFetch ? 'enabled' : 'disabled',
              },
              {
                label: 'Capture errors',
                value: config.config.instrumentation.captureErrors ? 'enabled' : 'disabled',
              },
              {
                label: 'Next.js spans',
                value: verbose.enabled
                  ? `verbose (${verbose.source})`
                  : verbose.source === 'unknown'
                    ? 'NEXT_OTEL_VERBOSE has an unrecognized value'
                    : `standard (${verbose.source})`,
              },
              {
                label: 'Adapters',
                value: [
                  config.config.database.drizzle ? 'Drizzle' : null,
                  config.config.database.prisma ? 'Prisma' : null,
                ]
                  .filter(Boolean)
                  .join(', ') || 'none enabled',
              },
            ]}
          />
        </Card>

        <Card title="Appearance" subtitle="Theme preference is stored in this browser">
          <div className="theme-picker" role="group" aria-label="Theme">
            {(
              [
                ['dark', 'Dark', 'moon'],
                ['light', 'Light', 'sun'],
                ['system', 'System', 'monitor'],
              ] as Array<[Theme, string, 'moon' | 'sun' | 'monitor']>
            ).map(([value, label, icon]) => (
              <button
                type="button"
                key={value}
                className={theme === value ? 'theme-choice theme-choice--active' : 'theme-choice'}
                onClick={() => onThemeChange(value)}
                aria-pressed={theme === value}
              >
                <Icon name={icon} size={18} />
                {label}
              </button>
            ))}
          </div>
          <p className="muted small">
            The dashboard follows the system theme by default and works fully offline.
          </p>
        </Card>

        <Card title="Instrumentation" subtitle="Connections and exporter health">
          {connected.length === 0 ? (
            <EmptyState
              compact
              icon="server"
              title="No app heartbeat"
              description="Start Next.js with the StackNext instrumentation registered."
            />
          ) : (
            <div className="stack stack--tight">
              {connected.map((connection) => (
                <div key={connection.instanceId} className="connection connection--boxed">
                  <span className="connection__dot" />
                  <div className="connection__body">
                    <div className="connection__name">{connection.serviceName}</div>
                    <div className="connection__meta">
                      {connection.nextVersion ? `Next.js ${connection.nextVersion} · ` : ''}
                      SDK {connection.sdkVersion} · last seen {formatRelative(connection.lastSeen)}
                    </div>
                    {connection.diagnostics && (
                      <div className="connection__meta">
                        {formatNumber(connection.diagnostics.exportedSpans)} spans exported,{' '}
                        {connection.diagnostics.droppedSpans} dropped,{' '}
                        {connection.diagnostics.queueDepth} queued
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {health.exporter.lastError && (
            <div className="notice notice--warn">
              <Icon name="errors" size={16} />
              <span>{health.exporter.lastError}</span>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid--2">
        <Card title="Drizzle adapter" subtitle="Duration is not exposed by the Drizzle Logger API">
          <pre className="code-block code-block--scroll">{DRIZZLE_SNIPPET}</pre>
        </Card>
        <Card title="Prisma adapter" subtitle="Subscribes to Prisma query events with real durations">
          <pre className="code-block code-block--scroll">{PRISMA_SNIPPET}</pre>
        </Card>
      </div>

      <Card title="Limitations" subtitle="Honest boundaries of StackNext 0.7">
        <ul className="limitations">
          {config.limitations.map((limitation) => (
            <li key={limitation}>
              <Icon name="chevron-right" size={13} />
              {limitation}
            </li>
          ))}
          <li>
            <Icon name="chevron-right" size={13} />
            Database queries cannot be correlated when the driver runs outside the request async
            context.
          </li>
        </ul>
        <div className="badge-row">
          <Badge tone="good">local-first</Badge>
          <Badge tone="accent">MIT licensed</Badge>
          <Badge tone="muted">no accounts</Badge>
          <Badge tone="muted">no cloud</Badge>
        </div>
      </Card>
    </>
  )
}
