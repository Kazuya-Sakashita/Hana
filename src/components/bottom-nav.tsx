'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Home, ImagePlus, Settings, type LucideIcon } from 'lucide-react'
import { QuietIcon } from '@/components/product/icons'
import { cn } from '@/lib/utils'

// Quiet Heirloom: Persistent bottom tab bar with 3 destinations + 中央記録ボタン
// 表示しないページ (集中フロー / 認証画面)
const HIDDEN_PATHS = ['/sign-in', '/auth/callback', '/onboarding', '/record', '/privacy', '/lp']

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
      className="bg-elevated border-hairline pb-safe fixed inset-x-0 bottom-0 z-40 border-t shadow-[0_-2px_12px_rgba(58,38,30,0.04)]"
      aria-label="メイン ナビゲーション"
    >
      <div className="mx-auto grid h-[72px] max-w-md grid-cols-[1fr_1fr_72px_1fr_1fr] items-center px-2">
        <TabLink tab={TABS[0]!} pathname={pathname} />
        <TabLink tab={TABS[1]!} pathname={pathname} />
        <RecordAction />
        <span aria-hidden="true" />
        <TabLink tab={TABS[2]!} pathname={pathname} />
      </div>
    </nav>
  )
}

function RecordAction() {
  return (
    <Link
      href="/record"
      prefetch={false}
      aria-label="写真から あたらしく のこす"
      className="bg-primary text-primary-foreground hover:bg-leaf-deep hover:text-white active:bg-leaf-deep active:text-white shadow-soft ease-organic tap-target mx-auto flex h-14 w-14 items-center justify-center rounded-full transition-all active:scale-95"
      data-testid="bottom-nav-record-action"
    >
      <QuietIcon icon={ImagePlus} tone="onPrimary" size="lg" active />
      <span className="sr-only">あたらしく のこす</span>
    </Link>
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
      className={cn(
        'tap-target flex flex-col items-center justify-center gap-1 rounded-[var(--radius-paper-slip)] py-2 transition-colors',
        active
          ? 'text-leaf-deep dark:text-leaf font-medium'
          : 'text-ink-tertiary hover:text-ink-secondary',
      )}
    >
      <span
        className={cn(
          'border-hairline flex h-8 min-w-11 items-center justify-center rounded-full border transition-colors',
          active ? 'bg-paper-slip shadow-soft' : 'border-transparent bg-transparent',
        )}
        data-active-indicator={active ? 'true' : undefined}
        aria-hidden="true"
      >
        <QuietIcon icon={Icon} tone={active ? 'primary' : 'muted'} size="md" active={active} />
      </span>
      <span className="text-xs">{tab.label}</span>
    </Link>
  )
}
