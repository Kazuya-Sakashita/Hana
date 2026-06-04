import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // ISSUE-028 / ADR-0013: 画像は Supabase Storage の transformation で resize + format=webp 済。
  // next/image は `unoptimized` で経由のみ (lazy / priority / CLS 防止のため)。
  // remotePatterns は将来 unoptimized を外す可能性 + 安全側のために残す。
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
}

export default config
