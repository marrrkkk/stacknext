import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  poweredByHeader: false,
  agentRules: false,
}

export default nextConfig
