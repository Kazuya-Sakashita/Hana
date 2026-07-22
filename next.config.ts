import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // ISSUE-028 / ADR-0013: Upload-time generated WebP variants (ISSUE-031)
  // handle byte-size reduction. next/image is used for dimensions, lazy loading,
  // and priority hints without routing private signed URLs through Vercel.
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
}

export default config
