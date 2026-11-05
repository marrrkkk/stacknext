import { describe, expect, it } from 'vitest'
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
} from '../src/mcp.js'

describe('MCP tool catalog', () => {
  it('keeps every tool name unique and inside a known group', () => {
    const names = MCP_TOOLS.map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
    const groupIds = new Set(MCP_TOOL_GROUPS.map((group) => group.id))
    for (const tool of MCP_TOOLS) expect(groupIds.has(tool.group)).toBe(true)
  })

  it('derives a breakdown whose parts sum to the full catalog', () => {
    const counts = mcpToolCounts()
    expect(counts.map((entry) => entry.count)).toEqual([9, 2, 6, 3])
    expect(counts.reduce((sum, entry) => sum + entry.count, 0)).toBe(
      MCP_TOOLS.length,
    )
    expect(MCP_TOOLS).toHaveLength(20)
    expect(mcpToolBreakdown()).toBe(
      '9 live · 2 diagnostics · 6 regression · 3 snapshots',
    )
  })

  it('recomputes counts and breakdown for a filtered catalog', () => {
    const subset = MCP_TOOLS.filter((tool) => tool.group === 'snapshots')
    expect(mcpToolCounts(subset).map((entry) => entry.count)).toEqual([
      0, 0, 0, 3,
    ])
    expect(mcpToolBreakdown(subset)).toBe(
      '0 live · 0 diagnostics · 0 regression · 3 snapshots',
    )
  })
})

describe('filterMcpTools', () => {
  it('matches tool names and purposes case-insensitively', () => {
    expect(filterMcpTools(MCP_TOOLS, '  SNAPSHOT  ', 'all').map((tool) => tool.name)).toEqual([
      'stacknext_list_snapshots',
      'stacknext_get_snapshot',
      'stacknext_get_snapshot_trace',
    ])
    expect(
      filterMcpTools(MCP_TOOLS, 'redacted sql', 'all').map((tool) => tool.name),
    ).toEqual(['list_database_queries'])
  })

  it('combines the group filter with the text query', () => {
    expect(filterMcpTools(MCP_TOOLS, 'get', 'regression').map((tool) => tool.name)).toEqual([
      'stacknext_get_test_run',
      'stacknext_get_baseline',
      'stacknext_get_comparison',
    ])
    expect(filterMcpTools(MCP_TOOLS, 'snapshot', 'regression')).toEqual([])
    expect(filterMcpTools(MCP_TOOLS, '', 'diagnostics')).toHaveLength(2)
  })

  it('matches the readable group label as well as the id', () => {
    expect(filterMcpTools(MCP_TOOLS, 'live sample', 'all')).toHaveLength(9)
  })
})

describe('MCP copy payloads', () => {
  it('keeps the client configuration valid and unchanged', () => {
    const parsed = JSON.parse(MCP_CONFIG) as {
      mcpServers: Record<
        string,
        { command: string; args: string[]; cwd: string }
      >
    }
    expect(parsed).toEqual({
      mcpServers: {
        stacknext: {
          command: 'stacknext',
          args: ['mcp'],
          cwd: '/absolute/path/to/your/next-app',
        },
      },
    })
    expect(MCP_CONFIG.split(MCP_CONFIG_CWD)).toHaveLength(2)
    expect(MCP_CONFIG_CWD).toBe('"/absolute/path/to/your/next-app"')
  })

  it('keeps exactly the three supported skill clients', () => {
    expect(SKILL_INSTALL_CLIENTS).toEqual([
      { name: 'OpenCode', command: 'stacknext skill install --client opencode' },
      { name: 'Codex', command: 'stacknext skill install --client codex' },
      {
        name: 'Claude Code',
        command: 'stacknext skill install --client claude-code',
      },
    ])
    expect(SKILL_INSTALL_COMMANDS).toBe(
      SKILL_INSTALL_CLIENTS.map(
        (client) => `# ${client.name}\n${client.command}`,
      ).join('\n\n'),
    )
  })
})
