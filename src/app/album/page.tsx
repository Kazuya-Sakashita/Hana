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
}

type Phase = 'loading' | 'empty' | 'list' | 'error'

// 「サムネ取得中 (undefined)」と「失敗 / 画像無し (null)」を区別する
type CoverState = string | null | undefined

export default function AlbumPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('loading')
  const [items, setItems] = useState<Memory[]>([])
  const [covers, setCovers] = useState<Record<string, CoverState>>({})

  // Stage 1: memories 一覧
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

  // Stage 2: 各 memory の image_ids[0] の signed URL を並列取得
  useEffect(() => {
    if (items.length === 0) return
    let cancelled = false
    const client = getBrowserApiClient()

    void (async () => {
      const results = await Promise.all(
        items.map(async (m): Promise<[string, CoverState]> => {
          const firstId = m.image_ids[0]
          if (!firstId) return [m.id, null]
          try {
            const r = await client.GET('/uploads/{imageId}/url', {
              params: { path: { imageId: firstId } },
            })
            return [m.id, r.data?.url ?? null]
          } catch {
            // silent fail: V0 §4「責めない」原則。placeholder で品よく
            return [m.id, null]
          }
        }),
      )
      if (cancelled) return
      setCovers((prev) => {
        const next = { ...prev }
        for (const [memId, url] of results) next[memId] = url
        return next
      })
    })()

    return () => {
      cancelled = true
    }
  }, [items])

  return (
    <main className="bg-canvas min-h-dvh px-6 py-12">
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
                      <Thumbnail
                        url={covers[m.id]}
                        hasImage={m.image_ids.length > 0}
                        alt={m.title}
                      />
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

function Thumbnail({ url, hasImage, alt }: { url: CoverState; hasImage: boolean; alt: string }) {
  // url === undefined: フェッチ中 (skeleton)
  // url === null:      画像無し or 失敗 → placeholder
  // url is string:     表示
  const baseClass =
    'aspect-square h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-hairline'

  if (typeof url === 'string') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={alt} className={`${baseClass} object-cover`} />
    )
  }
  if (url === undefined && hasImage) {
    // フェッチ中: warm skeleton
    return <div className={`${baseClass} bg-warm animate-pulse`} aria-hidden="true" />
  }
  // 画像なし or 失敗: ❀ placeholder
  return (
    <div
      className={`${baseClass} bg-warm text-sakura-deep flex items-center justify-center text-2xl`}
      aria-hidden="true"
    >
      ❀
    </div>
  )
}
