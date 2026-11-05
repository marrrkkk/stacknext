import { useState } from 'react'
import type { HealthResponse } from '@stacknext/core'
import { DEFAULT_CONFIG } from '@stacknext/core'
import type { RunSummary } from '@stacknext/regression'
import { api, type ConfigResponse } from '../api'
import { useAsync, type Theme } from '../hooks'
import {
  Badge,
  Banner,
  CopyButton,
  EmptyState,
  ErrorState,
  KeyValue,
  Loading,
  StatCard,
  StatStrip,
  shortcutLabel,
} from '../components/ui'
import { Icon } from '../components/Icon'
import {
  CheckGroup,
  CheckList,
  CodeBlock,
  CopyText,
  RelativeTime,
  SettingsDisclosure,
  SettingsGroup,
  SettingsPageShell,
  SettingsRailNav,
  SettingsSection,
  SourceLegend,
  type RailNavGroup,
} from '../components/settings'
import {
  formatBinarySize,
  formatExactBytes,
  formatExactDuration,
  formatHumanDuration,
  formatNumber,
  plural,
} from '../format'
import { MCP_TOOLS } from '../mcp'

interface SettingsData {
  config: ConfigResponse
  health: HealthResponse
  latestRun: RunSummary | null
}

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

const SETTINGS_NAV: RailNavGroup[] = [
  {
    label: 'Preferences',
    items: [
      { id: 'appearance', label: 'Appearance' },
      { id: 'navigation', label: 'Navigation' },
    ],
  },
  {
    label: 'Capture & storage',
    items: [
      { id: 'configuration', label: 'Configuration' },
      { id: 'snapshots', label: 'Snapshots' },
      { id: 'data-safety', label: 'Data safety' },
    ],
  },
  {
    label: 'Connections',
    items: [
      { id: 'collector', label: 'Collector' },
      { id: 'instrumentation', label: 'Instrumentation' },
      { id: 'adapters', label: 'Adapters' },
      { id: 'mcp-server', label: 'MCP server' },
    ],
  },
  {
    label: 'About',
    items: [{ id: 'limitations', label: 'Limitations' }],
  },
]

const THEME_OPTIONS: Array<{
  value: Theme
  label: string
  icon: 'moon' | 'sun' | 'monitor'
}> = [
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'system', label: 'System', icon: 'monitor' },
]

const NEXT_THEME: Record<Theme, Theme> = {
  dark: 'light',
  light: 'system',
  system: 'dark',
}

const THEME_LABEL: Record<Theme, string> = {
  dark: 'Dark',
  light: 'Light',
  system: 'System',
}

function isAdapter(value: string): value is 'drizzle' | 'prisma' {
  return value === 'drizzle' || value === 'prisma'
}

function renderLimitation(text: string): React.ReactNode {
  return text.split(/(withStackNextAction\(\))/g).map((part, index) =>
    part === 'withStackNextAction()' ? (
      <code key={index}>{part}</code>
    ) : (
      part
    ),
  )
}

export function SettingsPage({
  refreshKey,
  theme,
  onThemeChange,
  onCycleTheme,
  onNavigate,
}: {
  refreshKey: number
  theme: Theme
  onThemeChange: (theme: Theme) => void
  onCycleTheme: () => void
  onNavigate: (path: string) => void
}): React.ReactElement {
  const state = useAsync<SettingsData>(
    async (signal) => {
      const [config, health, runs] = await Promise.all([
        api.config(signal),
        api.health(signal),
        api.testRuns({ limit: 1 }, signal).catch(() => null),
      ])
      return { config, health, latestRun: runs?.items[0] ?? null }
    },
    'settings',
    refreshKey,
    30_000,
  )

  if (state.loading && !state.data) {
    return (
      <>
        <SettingsPageShell title="Settings" description="Loading configuration…">
          <Loading rows={6} />
        </SettingsPageShell>
      </>
    )
  }
  if (state.error && !state.data) {
    return (
      <>
        <SettingsPageShell title="Settings">
          <ErrorState message={state.error} onRetry={state.reload} />
        </SettingsPageShell>
      </>
    )
  }
  if (!state.data) return <Loading />

  return (
    <SettingsContent
      data={state.data}
      refreshing={state.loading}
      onRefresh={state.reload}
      theme={theme}
      onThemeChange={onThemeChange}
      onCycleTheme={onCycleTheme}
      onNavigate={onNavigate}
    />
  )
}

function SettingsContent({
  data,
  refreshing,
  onRefresh,
  theme,
  onThemeChange,
  onCycleTheme,
  onNavigate,
}: {
  data: SettingsData
  refreshing: boolean
  onRefresh: () => void
  theme: Theme
  onThemeChange: (theme: Theme) => void
  onCycleTheme: () => void
  onNavigate: (path: string) => void
}): React.ReactElement {
  const { config, health, latestRun } = data
  const connected = health.connections.filter((connection) => connection.connected)
  const verbose = health.instrumentation.nextOtelVerbose
  const adapterNames = (latestRun?.environment.databases ?? []).filter(isAdapter)
  const [adapter, setAdapter] = useState<'drizzle' | 'prisma'>(() =>
    adapterNames.includes('prisma') && !adapterNames.includes('drizzle')
      ? 'prisma'
      : 'drizzle',
  )

  const snapshotState = [
    config.config.snapshots.autoOnExit ? 'exit' : null,
    config.config.snapshots.autoOnError ? 'error' : null,
  ].filter((value): value is string => value !== null)
  const snapshotHint =
    snapshotState.length > 0
      ? `${snapshotState.join(' and ')} · keep ${formatNumber(config.config.snapshots.autoKeep)}`
      : `keep ${formatNumber(config.config.snapshots.autoKeep)}`
  const capDefault =
    config.config.snapshots.maxBytes === DEFAULT_CONFIG.snapshots.maxBytes
  const droppedEvents =
    health.store.dropped.capacity +
    health.store.dropped.retention +
    health.server.droppedMalformed +
    health.server.droppedPayload +
    health.exporter.droppedSpans +
    health.exporter.droppedEvents

  const limitations = config.limitations
  const tracingLimitations = limitations.filter((entry) =>
    /Next\.js built-in spans|Server Components|Server Actions/.test(entry),
  )
  const databaseLimitations = [
    ...limitations.filter((entry) => /Drizzle Logger/.test(entry)),
    'Database queries cannot be correlated when the driver runs outside the request async context.',
  ]
  const runtimeLimitations = limitations.filter((entry) =>
    /Edge Runtime/.test(entry),
  )
  const known = new Set([
    ...tracingLimitations,
    ...databaseLimitations,
    ...runtimeLimitations,
  ])
  const otherLimitations = limitations.filter((entry) => !known.has(entry))

  const copyableConfig = JSON.stringify(config.config, null, 2)
  const adaptersInUse = new Set(adapterNames)

  return (
    <SettingsPageShell
      eyebrow={config.projectName}
      title="Settings"
      description="Capture boundaries, snapshot storage, connections and dashboard preferences."
      actions={
        <>
          <a
            className="button button--secondary"
            href="/api/export"
            download
            title="JSON with the same redacted fields as the dashboard"
          >
            <Icon name="download" size={15} /> Export
          </a>
          <button
            type="button"
            className="button button--secondary"
            onClick={onRefresh}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            <Icon
              name="refresh"
              size={15}
              className={refreshing ? 'button__spin' : undefined}
            />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </>
      }
      stats={
        <StatStrip three>
          <StatCard
            label="Collector"
            value={health.connected ? 'connected' : 'waiting'}
            tone={health.connected ? 'good' : 'warn'}
            hint={
              <span title={formatExactDuration(health.uptimeMs)}>
                v{health.version} · {formatHumanDuration(health.uptimeMs)}
              </span>
            }
            href="#collector"
            ariaLabel={`Collector ${health.connected ? 'connected' : 'waiting'}; version ${health.version}; uptime ${formatHumanDuration(health.uptimeMs)}. Jump to collector details.`}
            className="stat--wrap"
          />
          <StatCard
            label="Snapshots"
            value={snapshotState.length > 0 ? 'Auto-save on' : 'Auto-save off'}
            hint={snapshotHint}
            href="#snapshots"
            ariaLabel={`Snapshots auto-save ${snapshotState.length > 0 ? `on ${snapshotState.join(' and ')}` : 'off'}; keep ${formatNumber(config.config.snapshots.autoKeep)}. Jump to snapshot settings.`}
            className="stat--wrap"
          />
          <StatCard
            label="Retention"
            value={`${formatNumber(health.store.limits.maxSpans)} spans`}
            hint={
              <span
                title={formatExactDuration(health.store.limits.retentionMs)}
              >
                {formatHumanDuration(health.store.limits.retentionMs)}
              </span>
            }
            href="#configuration"
            ariaLabel={`Retention ${formatNumber(health.store.limits.maxSpans)} spans for ${formatHumanDuration(health.store.limits.retentionMs)}. Jump to configuration.`}
            className="stat--wrap"
          />
        </StatStrip>
      }
      rail={
        <>
          <SettingsRailNav groups={SETTINGS_NAV} />
          <SourceLegend />
        </>
      }
    >
      <SettingsGroup label="Preferences">
        <div className="settings-duo">
          <SettingsSection
            id="appearance"
            title="Appearance"
            description="Theme preference is stored in this browser"
            source="Stored in this browser"
          >
            <div className="settings-panel">
              <fieldset className="theme-fieldset">
                <legend className="sr-only">Theme</legend>
                <div className="theme-options">
                  {THEME_OPTIONS.map((option) => {
                    const selected = theme === option.value
                    return (
                      <label
                        key={option.value}
                        className={
                          selected
                            ? 'theme-option theme-option--active'
                            : 'theme-option'
                        }
                      >
                        <input
                          type="radio"
                          name="theme"
                          value={option.value}
                          checked={selected}
                          onChange={() => onThemeChange(option.value)}
                        />
                        <Icon name={option.icon} size={18} />
                        <span className="theme-option__label">{option.label}</span>
                        {selected && (
                          <Icon
                            name="check"
                            size={14}
                            className="theme-option__check"
                          />
                        )}
                      </label>
                    )
                  })}
                </div>
              </fieldset>
              <p className="settings-note">
                The dashboard follows the system theme by default and works fully
                offline.
              </p>
            </div>
          </SettingsSection>

          <SettingsSection
            id="navigation"
            title="Navigation"
            description="Make the dashboard fit the way you move through it"
          >
            <div className="settings-group">
              <div className="settings-row">
                <div className="settings-row__body">
                  <div className="settings-row__label">Command menu</div>
                  <div className="settings-row__description">
                    Search and jump to any view, filtered list or action.
                  </div>
                </div>
                <div className="settings-row__value">
                  <kbd className="kbd">{shortcutLabel('K')}</kbd>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row__body">
                  <div className="settings-row__label">Cycle theme</div>
                  <div className="settings-row__description">
                    Move between dark, light and system without opening this page.
                  </div>
                </div>
                <div className="settings-row__value">
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    onClick={onCycleTheme}
                    aria-label={`Switch to ${THEME_LABEL[NEXT_THEME[theme]]} theme`}
                  >
                    <Icon
                      name={
                        NEXT_THEME[theme] === 'dark'
                          ? 'moon'
                          : NEXT_THEME[theme] === 'light'
                            ? 'sun'
                            : 'monitor'
                      }
                      size={14}
                    />
                    Next: {THEME_LABEL[NEXT_THEME[theme]]}
                  </button>
                </div>
              </div>
            </div>
          </SettingsSection>
        </div>
      </SettingsGroup>

      <SettingsGroup label="Capture & storage">
        <SettingsSection
          id="configuration"
          title="Configuration"
          description="Read from stacknext.config.json"
          source="From stacknext.config.json"
          action={
            <CopyButton
              value={copyableConfig}
              label="Copy config"
              small
            />
          }
        >
          <div className="settings-panel settings-panel--tight">
            <KeyValue
              entries={[
                {
                  label: 'Dashboard port',
                  value: formatNumber(config.config.dashboard.port),
                  numeric: true,
                },
                {
                  label: 'Max spans',
                  value: formatNumber(config.config.collector.maxSpans),
                  numeric: true,
                },
                {
                  label: 'Retention',
                  value: formatHumanDuration(config.config.collector.retentionMs),
                  title: formatExactDuration(config.config.collector.retentionMs),
                },
                {
                  label: 'Slow threshold',
                  value: formatHumanDuration(config.config.slowRequestMs),
                  title: formatExactDuration(config.config.slowRequestMs),
                },
                {
                  label: 'Snapshot auto-save',
                  value:
                    [
                      config.config.snapshots.autoOnExit ? 'exit' : null,
                      config.config.snapshots.autoOnError ? 'first error' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'disabled',
                },
                {
                  label: 'Automatic snapshots kept',
                  value: formatNumber(config.config.snapshots.autoKeep),
                  numeric: true,
                },
                {
                  label: 'Snapshot size cap',
                  value: `${formatBinarySize(config.config.snapshots.maxBytes)}${capDefault ? ' (default)' : ''}`,
                  title: formatExactBytes(config.config.snapshots.maxBytes),
                },
                {
                  label: 'Capture fetch',
                  value: config.config.instrumentation.captureFetch
                    ? 'enabled'
                    : 'disabled',
                },
                {
                  label: 'Capture errors',
                  value: config.config.instrumentation.captureErrors
                    ? 'enabled'
                    : 'disabled',
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
                  value:
                    [
                      config.config.database.drizzle ? 'Drizzle' : null,
                      config.config.database.prisma ? 'Prisma' : null,
                    ]
                      .filter(Boolean)
                      .join(', ') || 'none enabled',
                },
              ]}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          id="snapshots"
          title="Snapshots"
          description="Keep evidence after the in-memory retention window ends"
          source="From stacknext.config.json"
        >
          <div className="settings-panel">
            <div className="snapshot-state">
              <div className="snapshot-state__row">
                <span>Auto-save on exit</span>
                <strong>
                  {config.config.snapshots.autoOnExit ? 'enabled' : 'disabled'}
                </strong>
              </div>
              <div className="snapshot-state__row">
                <span>Auto-save on error</span>
                <strong>
                  {config.config.snapshots.autoOnError
                    ? 'enabled · 60s cooldown'
                    : 'disabled'}
                </strong>
              </div>
              <div className="snapshot-state__row">
                <span>Automatic keep</span>
                <strong>
                  {plural(config.config.snapshots.autoKeep, 'snapshot')}
                </strong>
              </div>
              <div className="snapshot-state__row">
                <span>Per-snapshot cap</span>
                <strong
                  title={formatExactBytes(config.config.snapshots.maxBytes)}
                >
                  {formatBinarySize(config.config.snapshots.maxBytes)}
                  {capDefault ? ' (default)' : ''}
                </strong>
              </div>
            </div>
            <div className="snapshot-scope">
              <div className="snapshot-scope__row">
                <span className="snapshot-scope__label">Includes:</span>
                <span className="chip-row">
                  <Badge tone="muted">Traces</Badge>
                  <Badge tone="muted">Errors</Badge>
                  <Badge tone="muted">Queries</Badge>
                </span>
              </div>
              <div className="snapshot-scope__row">
                <span className="snapshot-scope__label">Not included:</span>
                <span className="chip-row">
                  <Badge tone="muted">Diagnostics</Badge>
                  <Badge tone="muted">Coverage</Badge>
                  <Badge tone="muted">Playwright artifacts</Badge>
                </span>
              </div>
            </div>
            <div className="settings-actions">
              <button
                type="button"
                className="button button--primary"
                onClick={() => onNavigate('/snapshots')}
              >
                <Icon name="layers" size={15} /> Open snapshots
              </button>
            </div>
            <SettingsDisclosure
              title="How snapshots work"
              storageKey="settings-snapshots-how"
            >
              <p className="settings-note">
                Snapshots are frozen, redacted copies of one collector sample.
                Automatic snapshots are written on a graceful exit and on the first
                server error, then rotated. Manual and imported snapshots are never
                auto-deleted.
              </p>
            </SettingsDisclosure>
          </div>
        </SettingsSection>

        <SettingsSection
          id="data-safety"
          title="Data safety"
          description="What is stored, and what is not"
        >
          <div className="settings-panel settings-panel--tight">
            <CheckGroup title="Not stored" tone="good">
              <CheckList
                items={[
                  { tone: 'good', text: 'Request bodies are never captured' },
                  {
                    tone: 'good',
                    text: 'Headers, cookies and authorization values are dropped',
                  },
                  {
                    tone: 'good',
                    text: 'URL query strings and SQL bind parameters are removed',
                  },
                ]}
              />
            </CheckGroup>
            <CheckGroup title="Stays local" tone="good">
              <CheckList
                items={[
                  { tone: 'good', text: 'Collector binds to 127.0.0.1 only' },
                ]}
              />
            </CheckGroup>
            <CheckGroup title="Stored in memory" tone="warn">
              <CheckList
                items={[
                  {
                    tone: 'warn',
                    text: 'Stack traces and redacted SQL are stored in memory',
                  },
                  {
                    tone: 'warn',
                    text: (
                      <>
                        Data is bounded to{' '}
                        {plural(health.store.limits.maxSpans, 'span')} and{' '}
                        <span
                          title={formatExactDuration(
                            health.store.limits.retentionMs,
                          )}
                        >
                          {formatHumanDuration(health.store.limits.retentionMs)}
                        </span>{' '}
                        of retention.
                      </>
                    ),
                  },
                ]}
              />
            </CheckGroup>
            <CheckGroup title="Stored on disk" tone="warn">
              <CheckList
                items={[
                  {
                    tone: 'warn',
                    text: 'Runs, baselines and comparisons are redacted files under .stacknext',
                  },
                  {
                    tone: 'warn',
                    text: 'Snapshots are redacted, frozen files under .stacknext/snapshots',
                  },
                ]}
              />
            </CheckGroup>
            <p className="settings-note settings-note--footer">
              Exports and snapshots are JSON and contain the same redacted fields as
              the dashboard.
            </p>
          </div>
        </SettingsSection>
      </SettingsGroup>

      <SettingsGroup label="Connections">
        <SettingsSection
          id="collector"
          title="Collector"
          description="Local-only ingestion endpoint"
          source="Live from collector"
          action={
            <Badge tone={health.connected ? 'good' : 'warn'}>
              {health.connected ? 'connected' : 'waiting'}
            </Badge>
          }
        >
          <div className="settings-panel settings-panel--tight">
            <KeyValue
              entries={[
                {
                  label: 'Dashboard',
                  value: <CopyText value={health.dashboardUrl} />,
                },
                {
                  label: 'Ingestion',
                  value: (
                    <CopyText
                      value={`${health.dashboardUrl}/__stacknext/v1/ingest`}
                    />
                  ),
                },
                { label: 'Version', value: `v${health.version}`, mono: true },
                {
                  label: 'Uptime',
                  value: formatHumanDuration(health.uptimeMs),
                  title: formatExactDuration(health.uptimeMs),
                  numeric: true,
                },
                {
                  label: 'Connected apps',
                  value:
                    connected.length > 0
                      ? connected.map((entry) => entry.serviceName).join(', ')
                      : 'none yet',
                },
                {
                  label: 'Telemetry',
                  value: `${plural(health.counts.spans, 'span')} · ${plural(health.counts.errors, 'error')} · ${plural(health.counts.databaseQueries, 'query')}`,
                  numeric: true,
                },
                {
                  label: 'Dropped events',
                  value: plural(droppedEvents, 'event'),
                  numeric: true,
                },
              ]}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          id="instrumentation"
          title="Instrumentation"
          description="Connections and exporter health"
          source="Live from collector"
        >
          {connected.length === 0 ? (
            <div className="settings-panel">
              <EmptyState
                compact
                icon="server"
                title="No app heartbeat"
                description="Start Next.js with the StackNext instrumentation registered."
              />
            </div>
          ) : (
            <div className="settings-group">
              {connected.map((connection) => {
                const diagnostics = connection.diagnostics
                const dropped = diagnostics?.droppedSpans ?? 0
                const queued = diagnostics?.queueDepth ?? 0
                const warnings = [
                  dropped > 0 ? `${formatNumber(dropped)} dropped` : null,
                  queued > 0 ? `${formatNumber(queued)} queued` : null,
                ].filter((value): value is string => value !== null)
                return (
                  <div className="instrumentation-row" key={connection.instanceId}>
                    <div className="instrumentation-row__identity">
                      <div className="settings-row__label">
                        {connection.serviceName}
                        {warnings.length > 0 && (
                          <Badge tone="warn">{warnings.join(' · ')}</Badge>
                        )}
                      </div>
                      <div className="settings-row__description">
                        {connection.nextVersion
                          ? `Next.js ${connection.nextVersion} · `
                          : ''}
                        SDK {connection.sdkVersion} · last seen{' '}
                        <RelativeTime timestamp={connection.lastSeen} />
                      </div>
                    </div>
                    <dl className="instrumentation-figures">
                      <div>
                        <dt>Exported</dt>
                        <dd>
                          {formatNumber(diagnostics?.exportedSpans ?? 0)}
                        </dd>
                      </div>
                      <div>
                        <dt>Dropped</dt>
                        <dd>{formatNumber(dropped)}</dd>
                      </div>
                      <div>
                        <dt>Queued</dt>
                        <dd>{formatNumber(queued)}</dd>
                      </div>
                    </dl>
                  </div>
                )
              })}
            </div>
          )}
          {health.exporter.lastError && (
            <Banner tone="warn" icon="errors">
              {health.exporter.lastError}
            </Banner>
          )}
        </SettingsSection>

        <SettingsSection
          id="adapters"
          title="Adapters"
          description="Database instrumentation snippets"
        >
          <div className="settings-panel">
            <div
              className="segmented"
              role="group"
              aria-label="Choose a database adapter snippet"
            >
              {(['drizzle', 'prisma'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={
                    adapter === value
                      ? 'segmented__button is-active'
                      : 'segmented__button'
                  }
                  aria-pressed={adapter === value}
                  onClick={() => setAdapter(value)}
                >
                  {value === 'drizzle' ? 'Drizzle' : 'Prisma'}
                  {adaptersInUse.has(value) && (
                    <Badge tone="good" className="segmented__badge">
                      In use
                    </Badge>
                  )}
                </button>
              ))}
            </div>
            <p className="settings-note">
              {adapter === 'drizzle'
                ? 'Duration is not exposed by the Drizzle Logger API'
                : 'Subscribes to Prisma query events with real durations'}
            </p>
            <CodeBlock
              label={
                adapter === 'drizzle'
                  ? 'Drizzle adapter · TypeScript'
                  : 'Prisma adapter · TypeScript'
              }
              code={adapter === 'drizzle' ? DRIZZLE_SNIPPET : PRISMA_SNIPPET}
              copyLabel={`Copy ${adapter === 'drizzle' ? 'Drizzle' : 'Prisma'} adapter snippet`}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          id="mcp-server"
          title="MCP server"
          description="Read-only stdio access for AI clients"
        >
          <div className="settings-panel settings-panel--split">
            <div>
              <p className="mcp-summary">
                <span className="mono">{MCP_TOOLS.length} tools</span>
                <span aria-hidden="true">·</span>
                <span>read-only</span>
                <span aria-hidden="true">·</span>
                <span className="mono">stdio</span>
              </p>
              <p className="settings-note">
                Connection snippets, the full tool catalog and Agent Skill
                installation commands live on the MCP page.
              </p>
            </div>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => onNavigate('/mcp')}
            >
              <Icon name="terminal" size={15} /> Open MCP setup
            </button>
          </div>
        </SettingsSection>
      </SettingsGroup>

      <SettingsGroup label="About">
        <SettingsSection
          id="limitations"
          title="Limitations"
          description="Honest boundaries of StackNext 0.6"
        >
          <div className="settings-panel settings-panel--quiet">
            <div className="limitation-group">
              <h3>Tracing</h3>
              <ul className="limitations">
                {tracingLimitations.map((limitation) => (
                  <li key={limitation}>{renderLimitation(limitation)}</li>
                ))}
              </ul>
            </div>
            <div className="limitation-group">
              <h3>Database</h3>
              <ul className="limitations">
                {databaseLimitations.map((limitation) => (
                  <li key={limitation}>{renderLimitation(limitation)}</li>
                ))}
              </ul>
            </div>
            <div className="limitation-group">
              <h3>Runtime</h3>
              <ul className="limitations">
                {runtimeLimitations.map((limitation) => (
                  <li key={limitation}>{renderLimitation(limitation)}</li>
                ))}
              </ul>
            </div>
            {otherLimitations.length > 0 && (
              <div className="limitation-group">
                <h3>Other</h3>
                <ul className="limitations">
                  {otherLimitations.map((limitation) => (
                    <li key={limitation}>{renderLimitation(limitation)}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="about-footer">
              <div className="badge-row">
                <Badge tone="good">local-first</Badge>
                <Badge tone="accent">MIT licensed</Badge>
                <Badge tone="muted">no accounts</Badge>
                <Badge tone="muted">no cloud</Badge>
              </div>
              <span className="about-version">StackNext v{config.version}</span>
            </div>
          </div>
        </SettingsSection>
      </SettingsGroup>
    </SettingsPageShell>
  )
}
