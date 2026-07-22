'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Heart } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  memoriesQueryKey,
  useMemoriesQuery,
  useUpdateMemoryMutation,
  type Memory,
  type MemoryListResponse,
} from '@/features/memories/client/use-memories'
import { optimisticUpdateMemoryInLists } from '@/lib/perf/optimistic'
import { isApiProblemError } from '@/lib/api/error'
import { useToast } from '@/components/ui/toast'

const ALBUM_LIMIT = 50

export function AlbumList({ initialData }: { initialData: MemoryListResponse }) {
  const query = useMemoriesQuery({ limit: ALBUM_LIMIT, initialData })
  const items = query.data?.data ?? []

  if (items.length === 0) {
    return <EmptyState />
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((memory) => (
        <AlbumListItem key={memory.id} memory={memory} />
      ))}
    </ul>
  )
}

function AlbumListItem({ memory }: { memory: Memory }) {
  const isOptimistic = memory.id.startsWith('optimistic-')
  const recordedAt = memory.recorded_at.replaceAll('-', '.')

  return (
    <li>
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          {isOptimistic ? (
            <div className="flex min-w-0 flex-1 gap-4 opacity-80">
              <Thumbnail url={memory.cover_thumbnail_url ?? null} alt={memory.title} />
              <MemoryText memory={memory} recordedAt={recordedAt} />
            </div>
          ) : (
            <Link
              href={`/memory/${memory.id}`}
              className="ease-organic flex min-w-0 flex-1 gap-4 transition-transform active:scale-[0.98]"
            >
              <Thumbnail url={memory.cover_thumbnail_url ?? null} alt={memory.title} />
              <MemoryText memory={memory} recordedAt={recordedAt} />
            </Link>
          )}

          <AlbumFavoriteButton memory={memory} disabled={isOptimistic} />
        </CardContent>
      </Card>
    </li>
  )
}

function MemoryText({ memory, recordedAt }: { memory: Memory; recordedAt: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="meta-label">
        {recordedAt}
        {memory.weather ? ` ・ ${memory.weather}` : ''}
      </div>
      <h2 className="font-serif text-base leading-tight">{memory.title}</h2>
      {memory.body ? (
        <p className="text-ink-secondary leading-narrative line-clamp-2 text-sm">{memory.body}</p>
      ) : null}
    </div>
  )
}

function AlbumFavoriteButton({ memory, disabled }: { memory: Memory; disabled: boolean }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const updateMemoryMutation = useUpdateMemoryMutation()
  const { showToast } = useToast()

  async function toggleFavorite() {
    const next = !memory.is_favorite
    await queryClient.cancelQueries({ queryKey: memoriesQueryKey })
    const rollback = optimisticUpdateMemoryInLists(queryClient, memory.id, (current) => ({
      ...current,
      is_favorite: next,
      updated_at: new Date().toISOString(),
    }))

    try {
      await updateMemoryMutation.mutateAsync({
        memoryId: memory.id,
        body: { is_favorite: next },
      })
      router.refresh()
    } catch (e) {
      rollback()
      void queryClient.invalidateQueries({ queryKey: memoriesQueryKey })
      if (isApiProblemError(e) && e.reason === 'unauthorized') {
        router.push('/sign-in')
        return
      }
      showToast({
        title: 'おきにいりを かえられませんでした',
        description: 'もういちど ためしてみてください。',
      })
    }
  }

  return (
    <button
      type="button"
      onClick={toggleFavorite}
      disabled={disabled || updateMemoryMutation.isPending}
      aria-pressed={memory.is_favorite}
      aria-label={memory.is_favorite ? 'おきにいりを はずす' : 'おきにいりに する'}
      className="text-ink-tertiary hover:text-sakura disabled:text-ink-tertiary flex size-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50"
    >
      <Heart
        className="size-5"
        fill={memory.is_favorite ? 'currentColor' : 'none'}
        aria-hidden="true"
      />
    </button>
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
