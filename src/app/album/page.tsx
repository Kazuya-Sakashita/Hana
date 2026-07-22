import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AlbumList } from '@/features/memories/client/album-list'
import { getCurrentUser } from '@/server/auth/current-user'
import { fetchMemoriesWithCovers } from '@/features/memories/server/queries'
import { encodeCursor } from '@/features/memories/server/parse'
import { toMemoryResponse } from '@/features/memories/view-models/memory'

// ISSUE-025: /album を Server Component 化 + Suspense streaming。
// baseline-2026-06-10 で LCP 要素 = カード本文 <p> (= text-LCP) と判明したため、
// HTML 同梱で text の paint 時刻を JS waterfall から解放する。

export const dynamic = 'force-dynamic'

export default async function AlbumPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  return (
    <main className="bg-canvas min-h-dvh px-6 pb-28 pt-12">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="font-serif text-2xl">アルバム</h1>
          <Button asChild size="sm" variant="outline">
            <Link href="/record" prefetch={false}>
              のこす
            </Link>
          </Button>
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
  // card 形状一致で CLS ゼロを維持。 サムネ + メタ + タイトル + 本文 (line-clamp-2) のレイアウト。
  return (
    <ul className="flex flex-col gap-3" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i}>
          <Card>
            <CardContent className="flex gap-4 p-4">
              <div className="bg-warm aspect-[4/5] w-20 shrink-0 animate-pulse rounded-2xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="bg-warm h-3 w-32 animate-pulse rounded" />
                <div className="bg-warm h-4 w-48 animate-pulse rounded" />
                <div className="bg-warm h-3 w-full animate-pulse rounded" />
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )
}
