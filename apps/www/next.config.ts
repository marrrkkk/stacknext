import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  devIndicators: false,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
}

export default nextConfig
