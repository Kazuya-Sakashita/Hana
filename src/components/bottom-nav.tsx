'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Home, Plus, Settings, type LucideIcon } from 'lucide-react'

// Quiet Heirloom: Persistent bottom tab bar with 3 destinations + 中央記録ボタン
// 表示しないページ (集中フロー / 認証画面)
const HIDDEN_PATHS = ['/sign-in', '/auth/callback', '/onboarding', '/record']

function shouldHide(pathname: string | null): boolean {
  if (!pathname) return false
  return HIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

interface TabDef {
  href: string
  label: string
  Icon: LucideIcon
  // active 判定。完全一致 or 前方一致
  matches: (path: string) => boolean
}

const TABS: ReadonlyArray<TabDef> = [
  {
    href: '/',
    label: 'ホーム',
    Icon: Home,
    matches: (p) => p === '/',
  },
  {
    href: '/album',
    label: 'アルバム',
    Icon: BookOpen,
    matches: (p) => p === '/album' || p.startsWith('/memory'),
  },
  {
    href: '/settings',
    label: 'せってい',
    Icon: Settings,
    matches: (p) => p === '/settings' || p.startsWith('/settings/'),
  },
]

export function BottomNav() {
  const pathname = usePathname()
  if (shouldHide(pathname)) return null

  return (
    <nav
      className="bg-elevated/96 border-hairline pb-safe fixed inset-x-0 bottom-0 z-40 border-t shadow-[0_-4px_18px_rgba(58,38,30,0.032)] backdrop-blur-sm"
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
          className="bg-primary text-primary-foreground hover:bg-leaf-deep hover:text-white active:bg-leaf-deep active:text-white shadow-soft ease-organic tap-target absolute left-1/2 top-0 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-all active:scale-95"
        >
          <Plus aria-hidden="true" className="size-6" strokeWidth={1.8} />
        </Link>
      </div>
    </nav>
  )
}

function TabLink({ tab, pathname }: { tab: TabDef; pathname: string | null }) {
  const active = pathname ? tab.matches(pathname) : false
  const { Icon } = tab
  return (
    <Link
      href={tab.href}
      prefetch={true}
      aria-current={active ? 'page' : undefined}
      className={`tap-target flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors ${
        active
          ? 'text-leaf-deep dark:text-leaf font-medium'
          : 'text-ink-tertiary hover:text-ink-secondary'
      }`}
    >
      <Icon aria-hidden="true" className="size-5" strokeWidth={active ? 2 : 1.7} />
      <span className="text-xs">{tab.label}</span>
    </Link>
  )
}
