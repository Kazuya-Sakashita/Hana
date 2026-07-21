import type { NextConfig } from 'next'
import { createRequire } from 'node:module'

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
}

let outputConfig = config

if (process.env.ANALYZE === 'true') {
  const require = createRequire(import.meta.url)
  const bundleAnalyzer = require('@next/bundle-analyzer') as (options: {
    enabled: boolean
  }) => (nextConfig: NextConfig) => NextConfig
  outputConfig = bundleAnalyzer({ enabled: true })(config)
}

export default outputConfig
