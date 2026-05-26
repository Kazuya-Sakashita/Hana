'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getBrowserApiClient } from '@/lib/api/browser-client'
import { isApiProblemError } from '@/lib/api/error'

type Memory = {
  id: string
  title: string
  body: string | null
  recorded_at: string
  weather: string | null
  is_favorite: boolean
  image_ids: string[]
  cover_thumbnail_url?: string | null
}

type Phase = 'loading' | 'empty' | 'list' | 'error'

export default function AlbumPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('loading')
  const [items, setItems] = useState<Memory[]>([])

  // ISSUE-018 で BFF 化: list レスポンスに cover_thumbnail_url が含まれるので
  // 個別の /uploads/{id}/url fetch は不要 (50 並列 N+1 排除)
  useEffect(() => {
    let cancelled = false
    const client = getBrowserApiClient()
    client
      .GET('/memories', { params: { query: { limit: 50 } } })
      .then(({ data }) => {
        if (cancelled) return
        const list = (data?.data ?? []) as Memory[]
        setItems(list)
        setPhase(list.length === 0 ? 'empty' : 'list')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        if (isApiProblemError(e) && e.reason === 'unauthorized') {
          router.push('/sign-in')
          return
        }
        setPhase('error')
      })
    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <main className="bg-canvas min-h-dvh px-6 pb-28 pt-12">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="font-serif text-2xl">アルバム</h1>
          <Button asChild size="sm" variant="outline">
            <Link href="/record">のこす</Link>
          </Button>
        </header>

        {phase === 'loading' ? (
          <p className="text-ink-tertiary text-center text-sm">よみこんでいます…</p>
        ) : null}

        {phase === 'error' ? (
          <Card>
            <CardHeader className="items-center text-center">
              <CardTitle className="font-serif text-xl">うまく ひらけませんでした</CardTitle>
              <CardDescription className="mt-2">
                ネットワークの ちょうしを たしかめて、もういちど ためしてみてください。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => location.reload()} className="w-full">
                もういちど ひらく
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {phase === 'empty' ? (
          <Card>
            <CardHeader className="items-center text-center">
              <CardTitle className="font-serif text-xl">まだ ページが ありません</CardTitle>
              <CardDescription className="mt-2">
                きょうの 1 まいから、はじめましょう。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="lg" className="w-full">
                <Link href="/record">のこす</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {phase === 'list' ? (
          <ul className="flex flex-col gap-3">
            {items.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/memory/${m.id}`}
                  className="ease-organic block transition-transform active:scale-[0.98]"
                >
                  <Card>
                    <CardContent className="flex gap-4 p-4">
                      <Thumbnail url={m.cover_thumbnail_url ?? null} alt={m.title} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div className="meta-label">
                          {m.recorded_at}
                          {m.weather ? ` ・ ${m.weather}` : ''}
                          {m.is_favorite ? ' ・ ❀' : ''}
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
            ))}
          </ul>
        ) : null}
      </div>
    </main>
  )
}

function Thumbnail({ url, alt }: { url: string | null; alt: string }) {
  // home (/) carousel と同じ視覚言語: aspect-[4/5] + object-cover + rounded-2xl。
  // サイズは row レイアウト用に w-20 (= 80×100、 home は w-full=140 wide)。
  // ISSUE-018 (BFF) で skeleton 状態は不要 (1 stage fetch、 url は null か string)。
  const baseClass = 'aspect-[4/5] w-20 shrink-0 rounded-2xl border border-hairline'

  if (typeof url === 'string') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={alt} className={`${baseClass} object-cover`} />
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
