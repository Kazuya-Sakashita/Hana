'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getBrowserApiClient } from '@/lib/api/browser-client'
import { isApiProblemError } from '@/lib/api/error'
import { computeAge, formatAgeLabel } from '@/lib/age'
import { imageUrlCache } from '@/lib/cache/image-url-cache'

// V0 prompt §5.2 ホーム画面:
//   1. Top bar: 時間帯挨拶 + 子どもアバター
//   2. Hero card → /record
//   3. (1年前の今日: MVP ではスキップ・ISSUE-017 で本格対応)
//   4. 最近のページ (横スクロール)
//   5. これまでの あゆみ stat (全体カウントベースで代替・月別フィルタは ISSUE-016)
//   6. 空状態: 「○○ちゃんとの 1まいめを、ひらきましょう」

type Me = { id: string; email: string | null; display_name: string | null }
type Child = { id: string; name: string; birthdate: string; created_at: string }
type Memory = {
  id: string
  title: string
  recorded_at: string
  weather: string | null
  image_ids: string[]
}

type Phase = 'loading' | 'no_child' | 'ready' | 'error'

function greeting(date = new Date()): string {
  const h = date.getHours()
  if (h >= 6 && h < 11) return 'おはようございます'
  if (h >= 11 && h < 17) return 'こんにちは'
  if (h >= 17 && h < 22) return 'こんばんは'
  return 'おかえりなさい'
}

function daysBetween(from: Date, to: Date): number {
  const dayMs = 24 * 60 * 60 * 1000
  const f = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  const t = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  return Math.max(0, Math.floor((t - f) / dayMs))
}

export default function HomePage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('loading')
  const [, setMe] = useState<Me | null>(null)
  const [child, setChild] = useState<Child | null>(null)
  const [memories, setMemories] = useState<Memory[]>([])
  const [covers, setCovers] = useState<Record<string, string | null>>({})
  // SSR hydration mismatch を避けるため client-only に計算する。
  // useSyncExternalStore は server snapshot を別途返せるので setState in effect を避けられる。
  const greetingText = useSyncExternalStore(
    () => () => undefined,
    () => greeting(),
    () => 'こんにちは',
  )

  useEffect(() => {
    let cancelled = false
    const client = getBrowserApiClient()
    Promise.all([
      client.GET('/me'),
      client.GET('/children'),
      client.GET('/memories', { params: { query: { limit: 5 } } }),
    ])
      .then(async ([meRes, childrenRes, memoriesRes]) => {
        if (cancelled) return
        if (meRes.data) setMe(meRes.data as Me)
        const first = (childrenRes.data?.data as Child[] | undefined)?.[0]
        if (!first) {
          setPhase('no_child')
          router.push('/onboarding')
          return
        }
        setChild(first)
        const list = (memoriesRes.data?.data ?? []) as Memory[]
        setMemories(list)
        setPhase('ready')

        // サムネ並列フェッチ (ISSUE-015 と同じパターン、 ISSUE-019 で client cache + thumbnail size)
        const results = await Promise.all(
          list.map(async (m): Promise<[string, string | null]> => {
            const firstId = m.image_ids[0]
            if (!firstId) return [m.id, null]
            const cached = imageUrlCache.get(firstId, 'thumbnail')
            if (cached) return [m.id, cached]
            try {
              const r = await client.GET('/uploads/{imageId}/url', {
                params: { path: { imageId: firstId }, query: { size: 'thumbnail' } },
              })
              const url = r.data?.url ?? null
              if (url && r.data?.expires_at) {
                imageUrlCache.set(firstId, 'thumbnail', url, r.data.expires_at)
              }
              return [m.id, url]
            } catch {
              return [m.id, null]
            }
          }),
        )
        if (cancelled) return
        const map: Record<string, string | null> = {}
        for (const [memId, url] of results) map[memId] = url
        setCovers(map)
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

  if (phase === 'loading' || phase === 'no_child') {
    return (
      <main className="bg-canvas min-h-dvh px-6 pb-28 pt-12">
        <p className="text-ink-tertiary text-center text-sm">よみこんでいます…</p>
      </main>
    )
  }

  if (phase === 'error') {
    return (
      <main className="bg-canvas min-h-dvh px-6 pb-28 pt-12">
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
      </main>
    )
  }

  if (!child) return null

  const childInitial = Array.from(child.name)[0] ?? '?'
  const ageLabel = formatAgeLabel(computeAge(new Date(`${child.birthdate}T00:00:00Z`), new Date()))
  const togetherDays = daysBetween(new Date(child.created_at), new Date())

  return (
    <main className="bg-canvas min-h-dvh px-6 pb-28 pt-8">
      <div className="mx-auto w-full max-w-md">
        {/* Top bar */}
        <header className="mb-8 flex items-center justify-between">
          <p className="text-ink font-serif text-base">{greetingText}</p>
          <Link
            href="/settings"
            aria-label={`${child.name} の せってい`}
            className="bg-warm text-sakura-deep ring-elevated flex h-10 w-10 items-center justify-center rounded-full font-serif text-base ring-2"
          >
            {childInitial}
          </Link>
        </header>

        {/* Hero card */}
        <Link
          href="/record"
          className="ease-organic block transition-transform active:scale-[0.97]"
        >
          <Card className="bg-elevated shadow-soft">
            <CardHeader>
              <CardTitle className="font-serif text-xl leading-snug">
                今日の {child.name} ちゃんを、のこしませんか
              </CardTitle>
              <CardDescription className="text-ink-secondary mt-2 text-sm">
                しゃしん 1まいから、30びょうで かんりょうします
              </CardDescription>
              <p className="text-sakura-deep mt-3 text-right text-xl" aria-hidden="true">
                →
              </p>
            </CardHeader>
          </Card>
        </Link>

        {memories.length === 0 ? (
          <section className="mt-10 flex flex-col items-center text-center">
            <span className="text-hairline mb-6 text-7xl" aria-hidden="true">
              ❀
            </span>
            <p className="text-ink-secondary leading-narrative font-serif text-base">
              {child.name} ちゃんとの 1まいめを、
              <br />
              ひらきましょう
            </p>
            <Button asChild size="lg" className="mt-6">
              <Link href="/record">はじめての ページを つくる</Link>
            </Button>
          </section>
        ) : (
          <>
            <section className="mt-10">
              <div className="mb-3 flex items-center justify-between">
                <p className="meta-label">さいきんの ページ</p>
                <Link href="/album" className="text-ink-tertiary text-xs">
                  もっとみる →
                </Link>
              </div>
              <ul className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-2">
                {memories.map((m) => {
                  const url = covers[m.id]
                  return (
                    <li key={m.id} className="w-[140px] shrink-0">
                      <Link
                        href={`/memory/${m.id}`}
                        className="ease-organic block transition-transform active:scale-[0.97]"
                      >
                        {typeof url === 'string' ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt={m.title}
                            className="border-hairline aspect-[4/5] w-full rounded-2xl border object-cover"
                          />
                        ) : url === null ? (
                          <div className="bg-warm text-sakura-deep border-hairline flex aspect-[4/5] w-full items-center justify-center rounded-2xl border text-3xl">
                            ❀
                          </div>
                        ) : (
                          <div
                            className="bg-warm border-hairline aspect-[4/5] w-full animate-pulse rounded-2xl border"
                            aria-hidden="true"
                          />
                        )}
                        <p className="text-ink mt-2 line-clamp-2 font-serif text-sm leading-tight">
                          {m.title}
                        </p>
                      </Link>
                    </li>
                  )
                })}
                <li className="w-[140px] shrink-0">
                  <Link
                    href="/album"
                    className="bg-warm text-ink-secondary border-hairline ease-organic flex aspect-[4/5] w-full items-center justify-center rounded-2xl border font-serif text-sm transition-transform active:scale-[0.97]"
                  >
                    もっとみる →
                  </Link>
                </li>
              </ul>
            </section>

            <section className="mt-10">
              <p className="meta-label mb-3">これまでの あゆみ</p>
              <div className="bg-elevated border-hairline grid grid-cols-3 divide-x divide-[var(--hairline)] rounded-2xl border">
                <Stat number={String(memories.length)} unit="ページ" />
                <Stat number={ageLabel.replace('生後 ', '')} unit={`${child.name} ちゃん`} />
                <Stat number={String(togetherDays)} unit="日 いっしょ" />
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function Stat({ number, unit }: { number: string; unit: string }) {
  return (
    <div className="flex flex-col items-center px-2 py-5">
      <span className="text-ink tabular-nums-light text-2xl">{number}</span>
      <span className="text-ink-tertiary mt-1 text-center text-[11px]">{unit}</span>
    </div>
  )
}
