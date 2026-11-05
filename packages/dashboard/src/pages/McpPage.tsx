import { useState } from 'react'
import type { HealthResponse } from '@stacknext/core'
import { api, type ConfigResponse } from '../api'
import { useAsync } from '../hooks'
import {
  Badge,
  Banner,
  CopyButton,
  EmptyState,
  ErrorState,
  KeyValue,
  Loading,
  SearchInput,
  StatCard,
  StatStrip,
} from '../components/ui'
import { Icon } from '../components/Icon'
import {
  CheckList,
  CodeBlock,
  CopyText,
  RelativeTime,
  SettingsPageShell,
  SettingsSection,
} from '../components/settings'
import {
  formatExactDuration,
  formatHumanDuration,
  formatNumber,
  plural,
} from '../format'
import {
  filterMcpTools,
  MCP_CONFIG,
  MCP_CONFIG_CWD,
  MCP_TOOL_GROUPS,
  MCP_TOOLS,
  mcpToolBreakdown,
  mcpToolCounts,
  SKILL_INSTALL_CLIENTS,
  SKILL_INSTALL_COMMANDS,
  type McpToolGroupId,
} from '../mcp'

interface McpData {
  config: ConfigResponse
  health: HealthResponse
}

type ToolFilter = McpToolGroupId | 'all'

export function McpPage({
  refreshKey,
  onNavigate,
}: {
  refreshKey: number
  onNavigate: (path: string) => void
}): React.ReactElement {
  const state = useAsync<McpData>(
    async (signal) => {
      const [config, health] = await Promise.all([api.config(signal), api.health(signal)])
      return { config, health }
    },
    'mcp',
    refreshKey,
    30_000,
  )

  if (state.loading && !state.data) {
    return (
      <SettingsPageShell title="MCP server" description="Loading MCP status…">
        <Loading rows={6} />
      </SettingsPageShell>
    )
  }
  if (state.error && !state.data) {
    return (
      <SettingsPageShell title="MCP server">
        <ErrorState message={state.error} onRetry={state.reload} />
      </SettingsPageShell>
    )
  }
  if (!state.data) return <Loading />

  return (
    <McpContent
      data={state.data}
      refreshing={state.loading}
      onRefresh={state.reload}
      onNavigate={onNavigate}
    />
  )
}

function McpContent({
  data,
  refreshing,
  onRefresh,
  onNavigate,
}: {
  data: McpData
  refreshing: boolean
  onRefresh: () => void
  onNavigate: (path: string) => void
}): React.ReactElement {
  const { config, health } = data
  const connected = health.connections.filter((connection) => connection.connected)
  const lastHeartbeat =
    connected.length > 0
      ? Math.max(...connected.map((connection) => connection.lastSeen))
      : null
  const counts = mcpToolCounts()
  const totalTools = MCP_TOOLS.length
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ToolFilter>('all')
  const visibleTools = filterMcpTools(MCP_TOOLS, query, filter)

  return (
    <SettingsPageShell
      eyebrow={config.projectName}
      title="MCP server"
      description="Local, read-only Model Context Protocol server over stdio for telemetry, diagnostics, regression records and snapshots."
      railWhenNarrow="end"
      actions={
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
      }
      stats={
        <StatStrip>
          <StatCard
            label="Tools"
            value={formatNumber(totalTools)}
            hint={mcpToolBreakdown()}
            className="stat--wrap"
            ariaLabel={`Tools: ${formatNumber(totalTools)}. ${mcpToolBreakdown()}.`}
          />
          <StatCard
            label="Collector"
            value={health.connected ? 'connected' : 'waiting'}
            tone={health.connected ? 'good' : 'warn'}
            hint={
              lastHeartbeat ? (
                <>
                  Last heartbeat <RelativeTime timestamp={lastHeartbeat} />
                </>
              ) : (
                'No app heartbeat'
              )
            }
            className="stat--wrap"
          />
          <StatCard
            label="Telemetry"
            value={plural(health.counts.spans, 'span')}
            hint={`${plural(health.counts.errors, 'error')} · ${plural(health.counts.databaseQueries, 'query')}`}
            className="stat--wrap"
          />
          <StatCard
            label="Uptime"
            value={
              <span title={formatExactDuration(health.uptimeMs)}>
                {formatHumanDuration(health.uptimeMs)}
              </span>
            }
            hint={`collector v${health.version}`}
            className="stat--wrap"
          />
        </StatStrip>
      }
      rail={
        <>
          <SettingsSection
            id="collector-rail"
            title="Collector"
            description="Where the MCP server reads from"
            action={
              <Badge tone={health.connected ? 'good' : 'warn'}>
                {health.connected ? 'connected' : 'waiting'}
              </Badge>
            }
            className="settings-section--rail"
          >
            <div className="settings-panel settings-panel--tight">
              <KeyValue
                entries={[
                  {
                    label: 'Last heartbeat',
                    value: lastHeartbeat ? (
                      <RelativeTime timestamp={lastHeartbeat} />
                    ) : (
                      'no heartbeat'
                    ),
                  },
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
                  {
                    label: 'Connected apps',
                    value:
                      connected.length > 0
                        ? connected.map((entry) => entry.serviceName).join(', ')
                        : 'none yet',
                  },
                ]}
              />
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() => onNavigate('/settings#collector')}
              >
                <Icon name="settings" size={14} /> Open collector settings
              </button>
            </div>
          </SettingsSection>

          <SettingsSection
            id="safety-boundaries"
            title="Safety boundaries"
            description="What the MCP server will never do"
            className="settings-section--rail"
          >
            <div className="settings-panel settings-panel--tight">
              <CheckList
                label="MCP safety boundaries"
                items={[
                  {
                    tone: 'good',
                    text: 'No tool can mutate telemetry, write, delete, capture, compare, run SQL, edit source or change configuration',
                  },
                  {
                    tone: 'good',
                    text: 'Only GET requests to a loopback collector; non-loopback URLs are refused',
                  },
                  {
                    tone: 'good',
                    text: 'stdout is protocol-only; diagnostics go to stderr',
                  },
                  {
                    tone: 'good',
                    text: 'Responses are bounded, paginated and re-sanitized',
                  },
                  {
                    tone: 'good',
                    text: 'Snapshots are frozen evidence, never replayed into the live store',
                  },
                  {
                    tone: 'good',
                    text: 'Prompts and the Agent Skill cannot add capabilities',
                  },
                ]}
              />
            </div>
          </SettingsSection>
        </>
      }
    >
      <Banner tone="good" icon="shield">
        <span>
          <strong>Read-only by construction:</strong> every tool declares{' '}
          <code>readOnlyHint: true</code>; GET requests only, against a loopback
          collector.
        </span>{' '}
        <a className="link" href="#safety-boundaries">
          Safety boundaries
        </a>
      </Banner>

      <SettingsSection
        id="connect"
        title="Connect a client"
        description="Add StackNext to any MCP-capable client on this machine"
      >
        <div className="settings-panel">
          <ol className="setup-steps">
            <li className="setup-step">
              <div className="setup-step__marker" aria-hidden="true">
                {health.connected ? <Icon name="check" size={14} /> : '1'}
              </div>
              <div className="setup-step__body">
                <div className="setup-step__title">
                  Start the app
                  <Badge tone={health.connected ? 'good' : 'warn'}>
                    {health.connected ? 'Done' : 'Waiting'}
                  </Badge>
                </div>
                <p className="settings-note">
                  Start the app with <CopyText value="stacknext dev" /> so the
                  collector and bearer token exist.
                </p>
              </div>
            </li>
            <li className="setup-step">
              <div className="setup-step__marker" aria-hidden="true">
                2
              </div>
              <div className="setup-step__body">
                <div className="setup-step__title">Add the server entry</div>
                <p className="settings-note">
                  Add the server entry below to your MCP client configuration. Point{' '}
                  <code>cwd</code> at the Next.js app directory.
                </p>
                <CodeBlock
                  label="MCP client config · JSON"
                  code={MCP_CONFIG}
                  copyLabel="Copy MCP config"
                >
                  {MCP_CONFIG.split('\n').map((line, index, lines) => {
                    const parts = line.split(MCP_CONFIG_CWD)
                    return (
                      <span key={index}>
                        {parts[0]}
                        {parts.length > 1 && (
                          <mark
                            className="code-highlight"
                            title="Edit this value"
                          >
                            {MCP_CONFIG_CWD}
                          </mark>
                        )}
                        {parts[1]}
                        {index < lines.length - 1 ? '\n' : ''}
                      </span>
                    )
                  })}
                </CodeBlock>
                <p className="settings-note">
                  The server reads the bearer token from{' '}
                  <code>.stacknext/run.json</code>. The token stays on this machine
                  and is never printed by the MCP server.
                </p>
              </div>
            </li>
            <li className="setup-step">
              <div className="setup-step__marker" aria-hidden="true">
                3
              </div>
              <div className="setup-step__body">
                <div className="setup-step__title">Ask for a summary</div>
                <p className="settings-note">
                  Restart the client and ask it to call{' '}
                  <CopyText value="get_project_summary" /> first.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </SettingsSection>

      <SettingsSection
        id="agent-skill"
        title="Agent skill"
        description="Portable investigation guidance for supported clients"
        action={
          <CopyButton
            value={SKILL_INSTALL_COMMANDS}
            label="Copy all"
            small
          />
        }
      >
        <div className="settings-panel">
          <p className="settings-note settings-note--prose">
            The bundled Agent Skill teaches an AI client the evidence-first
            StackNext workflow: start with coverage, read the sample window, use
            diagnostics as hypotheses, and keep snapshot evidence separate from
            live telemetry.
          </p>
          <ul className="skill-clients">
            {SKILL_INSTALL_CLIENTS.map((client) => (
              <li className="skill-client" key={client.name}>
                <div className="skill-client__name">{client.name}</div>
                <code className="skill-client__command">{client.command}</code>
                <CopyButton
                  value={client.command}
                  label={`Copy ${client.name}`}
                  small
                />
              </li>
            ))}
          </ul>
          <p className="settings-note">
            Client support is only claimed after a real end-to-end test. See{' '}
            <code>docs/agent-testing.md</code> in the repository.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        id="tools"
        title="Tool catalog"
        description={`All ${formatNumber(totalTools)} tools are read-only and scoped to the running collector`}
      >
        <div className="settings-panel settings-panel--flush tool-catalog">
          <p className="tool-catalog__note">
            Tool names are shown exactly as the server registers them. Live tools
            are unprefixed; diagnostics, regression and snapshot tools use the{' '}
            <code>stacknext_</code> prefix.
          </p>
          <div className="tool-catalog__toolbar">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search tools and purposes…"
              label="Search MCP tools"
            />
            <div
              className="tool-filters"
              role="group"
              aria-label="Filter tools by group"
            >
              <button
                type="button"
                className={
                  filter === 'all' ? 'filter-chip is-active' : 'filter-chip'
                }
                aria-pressed={filter === 'all'}
                onClick={() => setFilter('all')}
              >
                All <span className="tool-filters__count">{totalTools}</span>
              </button>
              {counts.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={
                    filter === group.id ? 'filter-chip is-active' : 'filter-chip'
                  }
                  aria-pressed={filter === group.id}
                  onClick={() => setFilter(group.id)}
                >
                  {group.label}{' '}
                  <span className="tool-filters__count">{group.count}</span>
                </button>
              ))}
            </div>
            <span className="sr-only" role="status" aria-live="polite">
              {formatNumber(visibleTools.length)} of {formatNumber(totalTools)}{' '}
              tools shown
            </span>
          </div>
          <div
            className="table-scroll data-table-scroll tool-catalog__scroll"
            role="region"
            aria-label="MCP tools"
            tabIndex={0}
          >
            <table className="table tool-table">
              <caption className="sr-only">MCP tools</caption>
              <thead>
                <tr>
                  <th scope="col" className="tool-table__name">
                    Tool
                  </th>
                  <th scope="col">Purpose</th>
                </tr>
              </thead>
              {MCP_TOOL_GROUPS.map((group) => {
                const tools = visibleTools.filter((tool) => tool.group === group.id)
                if (tools.length === 0) return null
                const groupCount =
                  counts.find((entry) => entry.id === group.id)?.count ?? 0
                const showingAll = tools.length === groupCount
                return (
                  <tbody key={group.id}>
                    <tr className="tool-group-row">
                      <th scope="colgroup" colSpan={2}>
                        {group.label}
                        <span>
                          {showingAll
                            ? formatNumber(groupCount)
                            : `${formatNumber(tools.length)} of ${formatNumber(groupCount)}`}
                        </span>
                      </th>
                    </tr>
                    {tools.map((tool) => (
                      <tr key={tool.name}>
                        <th scope="row" className="tool-table__name">
                          <CopyText value={tool.name} label="Copy tool name">
                            {tool.name}
                          </CopyText>
                        </th>
                        <td className="tool-table__purpose">{tool.purpose}</td>
                      </tr>
                    ))}
                  </tbody>
                )
              })}
              {visibleTools.length === 0 && (
                <tbody>
                  <tr>
                    <td colSpan={2}>
                      <EmptyState
                        compact
                        icon="search"
                        title="No tools match"
                        description="Try a different name or clear the group filter."
                      />
                    </td>
                  </tr>
                </tbody>
              )}
            </table>
          </div>
        </div>
      </SettingsSection>
    </SettingsPageShell>
  )
}
