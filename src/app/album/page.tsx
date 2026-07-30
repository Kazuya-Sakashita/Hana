import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AlbumList } from '@/features/memories/client/album-list'
import { MonthNavigator } from '@/features/memories/components/month-navigator'
import { getCurrentUser } from '@/server/auth/current-user'
import { countMemories, fetchMemoriesWithCovers } from '@/features/memories/server/queries'
import { encodeCursor } from '@/features/memories/server/parse'
import { toMemoryResponse } from '@/features/memories/view-models/memory'
import { signInPath } from '@/lib/auth/safe-redirect'
import {
  albumMonthRange,
  currentAlbumMonth,
  normalizeAlbumMonth,
  type MemoryDateRange,
} from '@/features/memories/month'

export const metadata: Metadata = {
  title: 'アルバム | Hana',
  description: 'Hana のアルバム',
}

// ISSUE-057: Album keepsake refresh.
// Keep SSR first page + Suspense while changing only the visual hierarchy.

export const dynamic = 'force-dynamic'

interface AlbumPageProps {
  searchParams: Promise<{ month?: string | string[] }>
}

export default async function AlbumPage({ searchParams }: AlbumPageProps) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams])
  const rawMonth = typeof params.month === 'string' ? params.month : undefined
  const currentMonth = currentAlbumMonth()
  const month = normalizeAlbumMonth(rawMonth, currentMonth)
  if (!user) {
    redirect(signInPath(rawMonth ? `/album?month=${encodeURIComponent(month)}` : '/album'))
  }
  if (params.month !== undefined && rawMonth !== month) {
    redirect(`/album?month=${month}`)
  }
  const dateRange = albumMonthRange(month)
  const recordedFrom = new Date(`${dateRange.recordedFrom}T00:00:00Z`)
  const recordedBefore = new Date(`${dateRange.recordedBefore}T00:00:00Z`)
  const [totalCount, allMemoryCount] = await Promise.all([
    countMemories({ userId: user.id, recordedFrom, recordedBefore }),
    countMemories({ userId: user.id }),
  ])

  return (
    <main className="bg-canvas min-h-dvh px-6 pb-28 pt-10">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-8">
          <p className="meta-label">しまってあるページ</p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <div>
              <h1 className="font-serif text-2xl leading-snug">アルバム</h1>
              <p className="text-ink-secondary mt-2 text-sm leading-7">
                しまったページを、静かに読み返せます。
              </p>
            </div>
            {allMemoryCount > 0 ? (
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link href="/record" prefetch={false}>
                  <Camera className="size-4" aria-hidden="true" />
                  写真から のこす
                </Link>
              </Button>
            ) : null}
          </div>
        </header>

        <MonthNavigator month={month} currentMonth={currentMonth} totalCount={totalCount} />
        <Suspense key={month} fallback={<AlbumListSkeleton />}>
          <AlbumListBoundary
            userId={user.id}
            month={month}
            dateRange={dateRange}
            totalCount={totalCount}
            hasAnyMemory={allMemoryCount > 0}
          />
        </Suspense>
      </div>
    </main>
  )
}

async function AlbumListBoundary({
  userId,
  month,
  dateRange,
  totalCount,
  hasAnyMemory,
}: {
  userId: string
  month: string
  dateRange: MemoryDateRange
  totalCount: number
  hasAnyMemory: boolean
}) {
  const recordedFrom = new Date(`${dateRange.recordedFrom}T00:00:00Z`)
  const recordedBefore = new Date(`${dateRange.recordedBefore}T00:00:00Z`)
  const { items, hasMore } = await fetchMemoriesWithCovers({
    userId,
    limit: 50,
    recordedFrom,
    recordedBefore,
  })
  const last = items[items.length - 1]

  return (
    <AlbumList
      month={month}
      dateRange={dateRange}
      hasAnyMemory={hasAnyMemory}
      initialData={{
        data: items.map(({ coverThumbnailUrl, ...memory }) =>
          toMemoryResponse(memory, { coverThumbnailUrl }),
        ),
        page: {
          next_cursor: hasMore && last ? encodeCursor(last.id) : null,
          total_count: totalCount,
        },
      }}
    />
  )
}

function AlbumListSkeleton() {
  return (
    <ul className="flex flex-col gap-4" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i}>
          <div className="paper-surface rounded-[var(--radius-paper-slip)] p-3">
            <div className="flex gap-4">
              <div className="photo-mat aspect-[4/5] w-24 shrink-0 animate-pulse rounded-[var(--radius-photo-mat)]" />
              <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
                <div className="bg-warm h-3 w-28 animate-pulse rounded" />
                <div className="bg-warm h-5 w-44 animate-pulse rounded" />
                <div className="bg-warm h-3 w-full animate-pulse rounded" />
                <div className="bg-warm h-3 w-4/5 animate-pulse rounded" />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
