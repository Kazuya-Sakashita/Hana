import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Inter, Noto_Serif_JP } from 'next/font/google'
import { BottomNav } from '@/components/bottom-nav'
import { WebVitalsReporter } from '@/components/web-vitals-reporter'
import { QueryProviders } from '@/lib/query/client'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const notoSerifJP = Noto_Serif_JP({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  title: 'Hana',
  description: '写真1枚から、AIが子どもとの記憶を物語にする育児記録アプリ',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" className={`${inter.variable} ${notoSerifJP.variable}`}>
      <body>
        <QueryProviders>
          {children}
          <BottomNav />
          <WebVitalsReporter />
        </QueryProviders>
      </body>
    </html>
  )
}
