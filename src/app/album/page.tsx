import { Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookOpen, Camera, ChevronRight } from 'lucide-react'
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
  const featured = items[0] ?? null

  return (
    <div className="flex flex-col gap-8">
      {featured ? <FeaturedAlbumPage item={featured} /> : null}
      <AlbumList
        initialData={{
          data: items.map(({ coverThumbnailUrl, ...memory }) =>
            toMemoryResponse(memory, { coverThumbnailUrl }),
          ),
          page: { next_cursor: hasMore && last ? encodeCursor(last.id) : null },
        }}
      />
    </div>
  )
}

function FeaturedAlbumPage({
  item,
}: {
  item: Awaited<ReturnType<typeof fetchMemoriesWithCovers>>['items'][number]
}) {
  return (
    <section aria-labelledby="album-featured-page" data-testid="album-featured-page">
      <Link
        href={`/memory/${item.id}`}
        className="photo-mat ease-organic block rounded-[var(--radius-sheet)] p-2 transition-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
      >
        {typeof item.coverThumbnailUrl === 'string' ? (
          <Image
            src={item.coverThumbnailUrl}
            alt=""
            width={360}
            height={450}
            sizes="(max-width: 480px) 88vw, 360px"
            priority
            className="aspect-[4/5] w-full rounded-[var(--radius-photo-inner)] object-cover"
          />
        ) : (
          <div
            className="bg-paper-slip flex aspect-[4/5] w-full items-center justify-center rounded-[var(--radius-photo-inner)]"
            aria-hidden="true"
          >
            <BookOpen className="text-sakura-deep size-10" />
          </div>
        )}
        <div className="mt-4 flex items-center justify-between gap-3 px-1 pb-1">
          <div className="min-w-0">
            <p className="meta-label">最近しまったページ</p>
            <h2
              id="album-featured-page"
              className="text-ink mt-1 line-clamp-2 break-words font-serif text-xl leading-7 [overflow-wrap:anywhere]"
            >
              {item.title}
            </h2>
          </div>
          <ChevronRight className="text-ink-tertiary size-5 shrink-0" aria-hidden="true" />
        </div>
      </Link>
    </section>
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
