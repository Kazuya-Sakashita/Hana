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
}

type Phase = 'loading' | 'empty' | 'list' | 'error'

export default function AlbumPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('loading')
  const [items, setItems] = useState<Memory[]>([])

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
                <Card>
                  <CardContent className="flex flex-col gap-2 py-5">
                    <div className="meta-label">
                      {m.recorded_at}
                      {m.weather ? ` ・ ${m.weather}` : ''}
                    </div>
                    <h2 className="font-serif text-lg leading-tight">{m.title}</h2>
                    {m.body ? (
                      <p className="text-ink-secondary leading-narrative text-sm">
                        {m.body.length > 80 ? `${m.body.slice(0, 80)}…` : m.body}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </main>
  )
}
