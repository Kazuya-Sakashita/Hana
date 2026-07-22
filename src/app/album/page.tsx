import Image from 'next/image'
import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getCurrentUser } from '@/server/auth/current-user'
import { fetchMemoriesWithCovers } from '@/features/memories/server/queries'

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
          <AlbumList userId={user.id} />
        </Suspense>
      </div>
    </main>
  )
}

async function AlbumList({ userId }: { userId: string }) {
  const { items } = await fetchMemoriesWithCovers({ userId, limit: 50 })

  if (items.length === 0) {
    return <EmptyState />
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((m) => {
        const recordedAt = m.recordedAt.toISOString().slice(0, 10)
        return (
          <li key={m.id}>
            <Link
              href={`/memory/${m.id}`}
              className="ease-organic block transition-transform active:scale-[0.98]"
            >
              <Card>
                <CardContent className="flex gap-4 p-4">
                  <Thumbnail url={m.coverThumbnailUrl} alt={m.title} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="meta-label">
                      {recordedAt}
                      {m.weather ? ` ・ ${m.weather}` : ''}
                      {m.isFavorite ? ' ・ ❀' : ''}
                    </div>
                    <h2 className="font-serif text-base leading-tight">{m.title}</h2>
                    {m.body ? (
                      <p className="text-ink-secondary leading-narrative line-clamp-2 text-sm">
                        {m.body}
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function EmptyState() {
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <CardTitle className="font-serif text-xl">まだ ページが ありません</CardTitle>
        <CardDescription className="mt-2">きょうの 1 まいから、はじめましょう。</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild size="lg" className="w-full">
          <Link href="/record" prefetch={false}>
            のこす
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function Thumbnail({ url, alt }: { url: string | null; alt: string }) {
  // home (/) carousel と同じ視覚言語 (ISSUE-030): aspect-[4/5] + object-cover + rounded-2xl
  const baseClass = 'aspect-[4/5] w-20 shrink-0 rounded-2xl border border-hairline'

  if (typeof url === 'string') {
    return (
      <Image
        src={url}
        alt={alt}
        width={80}
        height={100}
        className={`${baseClass} object-cover`}
        sizes="80px"
      />
    )
  }
  return (
    <div
      className={`${baseClass} bg-warm text-sakura-deep flex items-center justify-center text-3xl`}
      aria-hidden="true"
    >
      ❀
    </div>
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
