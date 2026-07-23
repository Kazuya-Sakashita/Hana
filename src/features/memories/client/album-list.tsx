'use client'

import Image from 'next/image'
import Link from 'next/link'
import { BookOpen, Camera, Heart } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  memoriesQueryKey,
  useInfiniteMemoriesQuery,
  useUpdateMemoryMutation,
  type Memory,
  type MemoryListResponse,
} from '@/features/memories/client/use-memories'
import { optimisticUpdateMemoryInLists } from '@/lib/perf/optimistic'
import { isApiProblemError } from '@/lib/api/error'
import { useToast } from '@/components/ui/toast'
import { albumLoadMoreStatus, quietStateCopy } from '@/lib/ui/quiet-state-copy'

const ALBUM_LIMIT = 50

export function AlbumList({ initialData }: { initialData: MemoryListResponse }) {
  const query = useInfiniteMemoriesQuery({ limit: ALBUM_LIMIT, initialData })
  const items = query.data?.pages.flatMap((page) => page.data) ?? []
  const [loadMoreStatus, setLoadMoreStatus] = useState('')
  const statusRef = useRef<HTMLParagraphElement>(null)

  async function onLoadMore() {
    const beforeCount = items.length
    const result = await query.fetchNextPage()
    if (result.isError) {
      setLoadMoreStatus(quietStateCopy.album.loadMoreFailed)
      return
    }

    const pages = result.data?.pages ?? query.data?.pages ?? []
    const nextItems = pages.flatMap((page) => page.data)
    const addedCount = Math.max(nextItems.length - beforeCount, 0)
    const lastPage = pages[pages.length - 1]
    const hasMore = !!lastPage?.page.next_cursor
    setLoadMoreStatus(albumLoadMoreStatus(addedCount, hasMore))

    if (!hasMore) {
      window.requestAnimationFrame(() => {
        statusRef.current?.focus({ preventScroll: true })
      })
    }
  }

  if (items.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-4">
        {items.map((memory) => (
          <AlbumListItem key={memory.id} memory={memory} />
        ))}
      </ul>

      {query.isError ? (
        <p role="alert" className="text-amber text-center text-sm">
          {quietStateCopy.album.loadMoreFailed}
        </p>
      ) : null}

      {loadMoreStatus ? (
        <p
          ref={statusRef}
          role="status"
          aria-live="polite"
          tabIndex={-1}
          className="text-ink-tertiary text-center text-sm focus:outline-none"
        >
          {loadMoreStatus}
        </p>
      ) : null}

      {query.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => void onLoadMore()}
          disabled={query.isFetchingNextPage}
          className="w-full"
        >
          {query.isFetchingNextPage
            ? quietStateCopy.album.loadMorePending
            : quietStateCopy.album.loadMoreButton}
        </Button>
      ) : null}
    </div>
  )
}

function AlbumListItem({ memory }: { memory: Memory }) {
  const isOptimistic = memory.id.startsWith('optimistic-')
  const recordedAt = memory.recorded_at.replaceAll('-', '.')

  return (
    <li>
      <div className="paper-surface rounded-[20px] p-3">
        <div className="flex items-start gap-3">
          {isOptimistic ? (
            <div className="flex min-w-0 flex-1 gap-4 opacity-80">
              <Thumbnail url={memory.cover_thumbnail_url ?? null} />
              <MemoryText memory={memory} recordedAt={recordedAt} />
            </div>
          ) : (
            <Link
              href={`/memory/${memory.id}`}
              className="ease-organic flex min-w-0 flex-1 gap-4 rounded-[16px] transition-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
            >
              <Thumbnail url={memory.cover_thumbnail_url ?? null} />
              <MemoryText memory={memory} recordedAt={recordedAt} />
            </Link>
          )}

          <AlbumFavoriteButton memory={memory} disabled={isOptimistic} />
        </div>
      </div>
    </li>
  )
}

function MemoryText({ memory, recordedAt }: { memory: Memory; recordedAt: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 break-words [overflow-wrap:anywhere]">
      <div className="meta-label">
        {recordedAt}
        {memory.weather ? ` ・ ${memory.weather}` : ''}
      </div>
      <h2 className="line-clamp-2 font-serif text-base leading-tight">{memory.title}</h2>
      {memory.body ? (
        <p className="text-ink-secondary line-clamp-1 text-sm leading-6">{memory.body}</p>
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
        title: quietStateCopy.album.favoriteFailedTitle,
        description: quietStateCopy.album.favoriteFailedDescription,
      })
    }
  }

  return (
    <button
      type="button"
      onClick={toggleFavorite}
      disabled={disabled || updateMemoryMutation.isPending}
      aria-pressed={memory.is_favorite}
      aria-label={memory.is_favorite ? 'しるしを はずす' : 'しるしを つける'}
      className="text-ink-tertiary hover:text-sakura disabled:text-ink-tertiary tap-target flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50"
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
    <section className="photo-mat rounded-[var(--radius)] px-5 py-8 text-center">
      <div
        className="bg-paper-slip border-hairline mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border"
        aria-hidden="true"
      >
        <BookOpen className="text-sakura-deep size-6" />
      </div>
      <p className="meta-label mt-5">はじめのページ</p>
      <h2 className="mt-3 font-serif text-xl leading-snug">
        最初のページを、
        <br />
        ここにしまえます
      </h2>
      <p className="text-ink-secondary mx-auto mt-3 max-w-[18rem] text-sm leading-7">
        {quietStateCopy.album.emptyDescription}
      </p>
      <Button asChild size="lg" className="mt-6 w-full">
        <Link href="/record" prefetch={false}>
          <Camera className="size-4" aria-hidden="true" />
          写真から のこす
        </Link>
      </Button>
    </section>
  )
}

function Thumbnail({ url }: { url: string | null }) {
  if (typeof url === 'string') {
    return (
      <div className="photo-mat aspect-[4/5] w-24 shrink-0 rounded-[16px] p-1">
        <Image
          src={url}
          alt=""
          width={96}
          height={120}
          className="aspect-[4/5] w-full rounded-[12px] object-cover"
          sizes="96px"
        />
      </div>
    )
  }
  return (
    <div
      className="photo-mat text-sakura-deep flex aspect-[4/5] w-24 shrink-0 items-center justify-center rounded-[16px]"
      aria-hidden="true"
    >
      <BookOpen className="size-7" />
    </div>
  )
}
