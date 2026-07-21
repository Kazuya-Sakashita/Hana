import type { NextConfig } from 'next'
import bundleAnalyzer from '@next/bundle-analyzer'

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
}

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

export default withBundleAnalyzer(config)
