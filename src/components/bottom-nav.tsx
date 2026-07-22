'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// V0 prompt §2: Persistent bottom tab bar with 3 destinations + 中央 + ボタン
// 表示しないページ (集中フロー / 認証画面)
const HIDDEN_PATHS = ['/sign-in', '/auth/callback', '/onboarding', '/record']

function shouldHide(pathname: string | null): boolean {
  if (!pathname) return false
  return HIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

interface TabDef {
  href: string
  label: string
  glyph: string
  // active 判定。完全一致 or 前方一致
  matches: (path: string) => boolean
}

const TABS: ReadonlyArray<TabDef> = [
  {
    href: '/',
    label: 'ホーム',
    glyph: '⌂',
    matches: (p) => p === '/',
  },
  {
    href: '/album',
    label: 'アルバム',
    glyph: '◫',
    matches: (p) => p === '/album' || p.startsWith('/memory'),
  },
  {
    href: '/settings',
    label: 'せってい',
    glyph: '☰',
    matches: (p) => p === '/settings' || p.startsWith('/settings/'),
  },
]

export function BottomNav() {
  const pathname = usePathname()
  if (shouldHide(pathname)) return null

  return (
    <nav
      className="bg-canvas/95 border-hairline pb-safe fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-sm"
      aria-label="メイン ナビゲーション"
    >
      <div className="relative mx-auto flex h-16 max-w-md items-stretch">
        <TabLink tab={TABS[0]!} pathname={pathname} />
        <TabLink tab={TABS[1]!} pathname={pathname} />
        <TabLink tab={TABS[2]!} pathname={pathname} />

        {/* 中央 + ボタン (floating、tab bar に重なる) */}
        <Link
          href="/record"
          prefetch={false}
          aria-label="あたらしく のこす"
          className="bg-primary text-primary-foreground hover:bg-sakura-deep shadow-lift ease-organic absolute left-1/2 top-0 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-2xl transition-all active:scale-95"
        >
          +
        </Link>
      </div>
    </nav>
  )
}

function TabLink({ tab, pathname }: { tab: TabDef; pathname: string | null }) {
  const active = pathname ? tab.matches(pathname) : false
  return (
    <Link
      href={tab.href}
      prefetch={true}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors ${
        active ? 'text-sakura-deep font-medium' : 'text-ink-tertiary'
      }`}
    >
      <span className="text-xl leading-none" aria-hidden="true">
        {tab.glyph}
      </span>
      <span className="text-xs">{tab.label}</span>
    </Link>
  )
}
