'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getBrowserApiClient } from '@/lib/api/browser-client'
import { isApiProblemError } from '@/lib/api/error'
import { computeAge, formatAgeLabel } from '@/lib/age'
import { imageUrlCache } from '@/lib/cache/image-url-cache'

type Memory = {
  id: string
  child_id: string
  title: string
  body: string | null
  recorded_at: string
  weather: string | null
  is_favorite: boolean
  ai_generated: boolean
  image_ids: string[]
  created_at: string
  updated_at: string
}

type Child = {
  id: string
  name: string
  birthdate: string
}

type Phase = 'loading' | 'view' | 'not_found' | 'forbidden' | 'error' | 'deleted'

interface DialogState {
  open: boolean
  pending: boolean
}

export default function MemoryDetailPage() {
  const router = useRouter()
  const params = useParams<{ memoryId: string }>()
  const memoryId = params.memoryId

  const [phase, setPhase] = useState<Phase>('loading')
  const [memory, setMemory] = useState<Memory | null>(null)
  const [child, setChild] = useState<Child | null>(null)
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [favPending, setFavPending] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState<DialogState>({ open: false, pending: false })

  useEffect(() => {
    if (!memoryId) return
    let cancelled = false
    const client = getBrowserApiClient()
    ;(async () => {
      try {
        const [memRes, childrenRes] = await Promise.all([
          client.GET('/memories/{memoryId}', { params: { path: { memoryId } } }),
          client.GET('/children'),
        ])
        if (cancelled) return
        const mem = memRes.data as Memory | undefined
        if (!mem) throw new Error('Empty memory response')
        setMemory(mem)
        const c = (childrenRes.data?.data as Child[] | undefined)?.find(
          (ch) => ch.id === mem.child_id,
        )
        if (c) setChild(c)

        // signed URL を画像ごとに並列取得 (ISSUE-019: preview size + client cache)
        const urls = await Promise.all(
          mem.image_ids.map(async (imgId) => {
            const cached = imageUrlCache.get(imgId, 'preview')
            if (cached) return [imgId, cached] as const
            const r = await client.GET('/uploads/{imageId}/url', {
              params: { path: { imageId: imgId }, query: { size: 'preview' } },
            })
            const url = r.data?.url ?? null
            if (url && r.data?.expires_at) {
              imageUrlCache.set(imgId, 'preview', url, r.data.expires_at)
            }
            return [imgId, url] as const
          }),
        )
        if (cancelled) return
        const map: Record<string, string> = {}
        for (const [id, url] of urls) {
          if (url) map[id] = url
        }
        setImageUrls(map)
        setPhase('view')
      } catch (e) {
        if (cancelled) return
        if (isApiProblemError(e)) {
          if (e.reason === 'unauthorized') {
            router.push('/sign-in')
            return
          }
          if (e.reason === 'forbidden') {
            setPhase('forbidden')
            return
          }
          if (e.reason === 'not_found') {
            setPhase('not_found')
            return
          }
        }
        setPhase('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [memoryId, router])

  async function toggleFavorite() {
    if (!memory) return
    setFavPending(true)
    const nextFav = !memory.is_favorite
    const client = getBrowserApiClient()
    try {
      const res = await client.PUT('/memories/{memoryId}', {
        params: { path: { memoryId: memory.id } },
        body: { is_favorite: nextFav },
      })
      if (res.data) setMemory(res.data as Memory)
    } catch {
      // 失敗時はサイレント (UX を壊さない)。次の操作で再試行可能
    } finally {
      setFavPending(false)
    }
  }

  async function confirmDelete() {
    if (!memory) return
    setDeleteDialog({ open: true, pending: true })
    const client = getBrowserApiClient()
    try {
      await client.DELETE('/memories/{memoryId}', {
        params: { path: { memoryId: memory.id } },
      })
      setPhase('deleted')
      setTimeout(() => router.push('/album'), 1500)
    } catch (e) {
      setDeleteDialog({ open: true, pending: false })
      if (isApiProblemError(e) && e.reason === 'unauthorized') {
        router.push('/sign-in')
      }
    }
  }

  // === 表示分岐 ===

  if (phase === 'loading') {
    return (
      <main className="bg-canvas min-h-dvh px-6 py-12">
        <p className="text-ink-tertiary text-center text-sm">よみこんでいます…</p>
      </main>
    )
  }

  if (phase === 'not_found') {
    return (
      <ErrorShell
        title="この ページは ありません"
        description="けされたか、まだ つくられていない ようです。"
      />
    )
  }
  if (phase === 'forbidden') {
    return (
      <ErrorShell
        title="このページは ひらけません"
        description="あなたの ページでは ないようです。"
      />
    )
  }
  if (phase === 'error') {
    return (
      <ErrorShell
        title="うまく ひらけませんでした"
        description="ネットワークの ちょうしを たしかめて、もういちど ためしてみてください。"
      />
    )
  }
  if (phase === 'deleted') {
    return (
      <main className="bg-canvas flex min-h-dvh items-center justify-center px-6 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <CardTitle className="font-serif text-xl">このページを、けしました</CardTitle>
            <CardDescription className="mt-2">アルバムへ いどう しています…</CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  if (!memory) return null

  const recordedDate = new Date(`${memory.recorded_at}T00:00:00Z`)
  const ageLabel = child
    ? formatAgeLabel(computeAge(new Date(`${child.birthdate}T00:00:00Z`), recordedDate))
    : null
  const dateLabel = memory.recorded_at.replaceAll('-', '.')
  const metaParts = [dateLabel]
  if (ageLabel) metaParts.push(ageLabel)
  if (memory.weather) metaParts.push(memory.weather)

  return (
    <main className="bg-canvas min-h-dvh pb-28">
      <div className="relative mx-auto w-full max-w-md">
        <Link
          href="/album"
          aria-label="アルバムへ もどる"
          className="bg-canvas/90 text-ink absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full text-lg backdrop-blur-sm"
        >
          ‹
        </Link>

        {memory.image_ids.map((id, idx) => {
          const url = imageUrls[id]
          if (!url) {
            return (
              <div key={id} className="bg-warm aspect-[4/5] w-full animate-pulse rounded-b-3xl" />
            )
          }
          // 1 枚目は LCP 候補なので priority、 2 枚目以降は lazy。
          // ADR-0013 (改訂): Vercel Image Optimization で WebP/AVIF + resize を担う
          //   (Supabase Free plan は transformation 未対応)。
          return (
            <Image
              key={id}
              src={url}
              alt=""
              width={1024}
              height={1280}
              sizes="(max-width: 480px) 100vw, 480px"
              priority={idx === 0}
              className="aspect-[4/5] w-full rounded-b-3xl object-cover"
            />
          )
        })}

        <article className="px-6 pt-8">
          <p className="meta-label">{metaParts.join(' ・ ')}</p>
          <h1 className="text-ink mt-3 font-serif text-[26px] font-medium leading-tight tracking-tight">
            {memory.title}
          </h1>
          {memory.body ? (
            <p className="text-ink leading-bookish mt-6 font-serif text-[17px]">{memory.body}</p>
          ) : null}

          {child && ageLabel ? (
            <p className="text-ink-secondary border-hairline mx-auto mt-8 max-w-xs border-y px-4 py-4 text-center font-serif text-sm italic">
              {child.name} ちゃん、{ageLabel}
            </p>
          ) : null}

          <div className="mt-12 flex items-center justify-around">
            <ActionGlyph
              label={memory.is_favorite ? 'おきにいり' : 'おきにいり'}
              filled={memory.is_favorite}
              disabled={favPending}
              onClick={toggleFavorite}
              glyph={memory.is_favorite ? '❀' : '❀'}
            />
            <ActionGlyph label="ことばを なおす" glyph="✎" disabled onClick={() => undefined} />
            <ActionGlyph
              label="けす"
              glyph="⋯"
              onClick={() => setDeleteDialog({ open: true, pending: false })}
            />
          </div>

          <p className="text-ink-tertiary mt-2 text-center text-xs">
            「ことばを なおす」は ちかぢか たいおう します。
          </p>
        </article>
      </div>

      {deleteDialog.open ? (
        <DeleteConfirmDialog
          childName={child?.name ?? ''}
          pending={deleteDialog.pending}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteDialog({ open: false, pending: false })}
        />
      ) : null}
    </main>
  )
}

function ActionGlyph({
  label,
  glyph,
  filled,
  disabled,
  onClick,
}: {
  label: string
  glyph: string
  filled?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-ink-secondary disabled:text-ink-tertiary flex flex-col items-center gap-1.5 px-3 py-2 disabled:cursor-not-allowed"
    >
      <span className={`text-2xl ${filled ? 'text-sakura' : ''}`} aria-hidden="true">
        {glyph}
      </span>
      <span className="text-xs">{label}</span>
    </button>
  )
}

function DeleteConfirmDialog({
  childName,
  pending,
  onConfirm,
  onCancel,
}: {
  childName: string
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 py-6 sm:items-center"
    >
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <CardTitle className="font-serif text-xl">このページを、けしますか</CardTitle>
          <CardDescription className="leading-narrative mt-2">
            {childName ? `${childName} ちゃんの こ` : 'こ'}のページは、けしてから 7にちは
            もどせます。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onConfirm}
            disabled={pending}
            className="text-amber w-full"
          >
            {pending ? 'けしています…' : 'けす'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onCancel}
            disabled={pending}
            className="w-full"
          >
            やめる
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function ErrorShell({ title, description }: { title: string; description: string }) {
  return (
    <main className="bg-canvas flex min-h-dvh items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <CardTitle className="font-serif text-xl">{title}</CardTitle>
          <CardDescription className="mt-2">{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="lg" className="w-full">
            <Link href="/album">アルバムへ もどる</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
