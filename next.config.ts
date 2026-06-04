import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // ISSUE-028 / ADR-0013 改訂: Supabase Image Transformation は Pro plan 以上で
  // Free plan では silent fallback で original を返す。 Hana は当面 Free plan のため
  // **Vercel Image Optimization 側で WebP/AVIF 変換 + resize を担う**。
  //   - Supabase signed URL (token 付き 30 分有効) を remote source として Vercel が optimize
  //   - blob URL (record の preview) は unoptimized 必須 (個別に指定)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
}

export default config
