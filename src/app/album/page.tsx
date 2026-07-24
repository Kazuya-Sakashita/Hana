import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AlbumList } from '@/features/memories/client/album-list'
import { getCurrentUser } from '@/server/auth/current-user'
import { fetchMemoriesWithCovers } from '@/features/memories/server/queries'
import { encodeCursor } from '@/features/memories/server/parse'
import { toMemoryResponse } from '@/features/memories/view-models/memory'

// ISSUE-057: Album keepsake refresh.
// Keep SSR first page + Suspense while changing only the visual hierarchy.

export const dynamic = 'force-dynamic'

export default async function AlbumPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

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
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link href="/record" prefetch={false}>
                <Camera className="size-4" aria-hidden="true" />
                写真から のこす
              </Link>
            </Button>
          </div>
        </header>

        <Suspense fallback={<AlbumListSkeleton />}>
          <AlbumListBoundary userId={user.id} />
        </Suspense>
      </div>
    </main>
  )
}

async function AlbumListBoundary({ userId }: { userId: string }) {
  const { items, hasMore } = await fetchMemoriesWithCovers({ userId, limit: 50 })
  const last = items[items.length - 1]

  return (
    <AlbumList
      initialData={{
        data: items.map(({ coverThumbnailUrl, ...memory }) =>
          toMemoryResponse(memory, { coverThumbnailUrl }),
        ),
        page: { next_cursor: hasMore && last ? encodeCursor(last.id) : null },
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
