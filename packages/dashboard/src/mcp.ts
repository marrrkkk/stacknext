export type McpToolGroupId = 'live' | 'diagnostics' | 'regression' | 'snapshots'

export interface McpToolGroup {
  id: McpToolGroupId
  label: string
  /** Compact label used in the derived stat-tile breakdown. */
  shortLabel: string
}

export interface McpTool {
  name: string
  group: McpToolGroupId
  purpose: string
}

export const MCP_TOOL_GROUPS: McpToolGroup[] = [
  { id: 'live', label: 'Live sample', shortLabel: 'live' },
  { id: 'diagnostics', label: 'Diagnostics', shortLabel: 'diagnostics' },
  { id: 'regression', label: 'Regression', shortLabel: 'regression' },
  { id: 'snapshots', label: 'Snapshots', shortLabel: 'snapshots' },
]

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'get_project_summary',
    group: 'live',
    purpose: 'Project health, counts, latency, recent errors and coverage.',
  },
  {
    name: 'list_requests',
    group: 'live',
    purpose: 'Filtered HTTP request roots with status, duration and errors.',
  },
  {
    name: 'get_request',
    group: 'live',
    purpose: 'One request with its trace, errors and database evidence.',
  },
  {
    name: 'list_traces',
    group: 'live',
    purpose: 'Browse every captured trace, including non-request traces.',
  },
  {
    name: 'get_trace',
    group: 'live',
    purpose: 'Full span tree, warnings, errors, queries and finding references.',
  },
  {
    name: 'list_errors',
    group: 'live',
    purpose: 'Server errors and deterministic fingerprint groups.',
  },
  {
    name: 'get_error',
    group: 'live',
    purpose: 'One redacted error, its stack and correlated trace.',
  },
  {
    name: 'list_database_queries',
    group: 'live',
    purpose: 'Redacted SQL, durations and trace correlation.',
  },
  {
    name: 'find_slow_requests',
    group: 'live',
    purpose: 'Requests above the configured slow threshold.',
  },
  {
    name: 'stacknext_list_diagnostics',
    group: 'diagnostics',
    purpose: 'Deterministic findings over the current sample.',
  },
  {
    name: 'stacknext_get_diagnostic',
    group: 'diagnostics',
    purpose: 'One finding with bounded evidence and related traces.',
  },
  {
    name: 'stacknext_list_test_runs',
    group: 'regression',
    purpose: 'Playwright-linked runtime captures and correlation status.',
  },
  {
    name: 'stacknext_get_test_run',
    group: 'regression',
    purpose: 'Scenarios, samples and environment for one capture run.',
  },
  {
    name: 'stacknext_list_baselines',
    group: 'regression',
    purpose: 'Immutable reference baselines under .stacknext.',
  },
  {
    name: 'stacknext_get_baseline',
    group: 'regression',
    purpose: 'One baseline with frozen scenario measurements.',
  },
  {
    name: 'stacknext_list_comparisons',
    group: 'regression',
    purpose: 'Baseline versus candidate comparison records.',
  },
  {
    name: 'stacknext_get_comparison',
    group: 'regression',
    purpose: 'Deterministic comparison results and explicit thresholds.',
  },
  {
    name: 'stacknext_list_snapshots',
    group: 'snapshots',
    purpose: 'Frozen saved samples with source, counts and size.',
  },
  {
    name: 'stacknext_get_snapshot',
    group: 'snapshots',
    purpose: 'One snapshot summary and its first traces, errors and queries.',
  },
  {
    name: 'stacknext_get_snapshot_trace',
    group: 'snapshots',
    purpose: 'One full trace inside a saved snapshot.',
  },
]

export const MCP_CONFIG = `{
  "mcpServers": {
    "stacknext": {
      "command": "stacknext",
      "args": ["mcp"],
      "cwd": "/absolute/path/to/your/next-app"
    }
  }
}`

export const MCP_CONFIG_CWD = '"/absolute/path/to/your/next-app"'

const SKILL_INSTALL = `# OpenCode
stacknext skill install --client opencode

# Codex
stacknext skill install --client codex

# Claude Code
stacknext skill install --client claude-code`

export const SKILL_INSTALL_CLIENTS = [
  {
    name: 'OpenCode',
    command: 'stacknext skill install --client opencode',
  },
  {
    name: 'Codex',
    command: 'stacknext skill install --client codex',
  },
  {
    name: 'Claude Code',
    command: 'stacknext skill install --client claude-code',
  },
]

export interface McpToolCount {
  id: McpToolGroupId
  label: string
  shortLabel: string
  count: number
}

export function mcpToolCounts(tools: McpTool[] = MCP_TOOLS): McpToolCount[] {
  return MCP_TOOL_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    shortLabel: group.shortLabel,
    count: tools.filter((tool) => tool.group === group.id).length,
  }))
}

/** Compact breakdown for stat tiles, e.g. "9 live · 2 diagnostics · 6 regression · 3 snapshots". */
export function mcpToolBreakdown(tools: McpTool[] = MCP_TOOLS): string {
  return mcpToolCounts(tools)
    .map((group) => `${group.count} ${group.shortLabel}`)
    .join(' · ')
}

export function filterMcpTools(
  tools: McpTool[],
  query: string,
  group: McpToolGroupId | 'all',
): McpTool[] {
  const needle = query.trim().toLowerCase()
  return tools.filter((tool) => {
    if (group !== 'all' && tool.group !== group) return false
    if (!needle) return true
    const groupLabel =
      MCP_TOOL_GROUPS.find((entry) => entry.id === tool.group)?.label ?? ''
    return `${tool.name} ${tool.purpose} ${groupLabel}`.toLowerCase().includes(needle)
  })
}

/** Copy-all payload for the Agent Skill install block. */
export const SKILL_INSTALL_COMMANDS = SKILL_INSTALL
