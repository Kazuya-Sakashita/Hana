'use client'

import Image from 'next/image'
import Link from 'next/link'
import { BookOpen, Camera, Heart } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { QuietIconButton } from '@/components/product/icons'
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
import { formatAlbumMonth, type MemoryDateRange } from '@/features/memories/month'
import { signInPath } from '@/lib/auth/safe-redirect'

const ALBUM_LIMIT = 50

export function AlbumList({
  initialData,
  month,
  dateRange,
  hasAnyMemory,
}: {
  initialData: MemoryListResponse
  month: string
  dateRange: MemoryDateRange
  hasAnyMemory: boolean
}) {
  const query = useInfiniteMemoriesQuery({ limit: ALBUM_LIMIT, dateRange, initialData })
  const items = query.data?.pages.flatMap((page) => page.data) ?? []
  const [loadMoreStatus, setLoadMoreStatus] = useState('')
  const statusRef = useRef<HTMLParagraphElement>(null)
  const itemLinkRefs = useRef(new Map<string, HTMLAnchorElement>())

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
    const firstAddedItem = nextItems[beforeCount]
    const lastPage = pages[pages.length - 1]
    const hasMore = !!lastPage?.page.next_cursor
    setLoadMoreStatus(albumLoadMoreStatus(addedCount, hasMore))

    if (!hasMore) {
      window.requestAnimationFrame(() => {
        statusRef.current?.focus({ preventScroll: true })
      })
    } else if (firstAddedItem) {
      window.requestAnimationFrame(() => {
        itemLinkRefs.current.get(firstAddedItem.id)?.focus({ preventScroll: true })
      })
    }
  }

  function setItemLinkRef(memoryId: string, node: HTMLAnchorElement | null) {
    if (node) {
      itemLinkRefs.current.set(memoryId, node)
      return
    }
    itemLinkRefs.current.delete(memoryId)
  }

  if (items.length === 0) {
    return <EmptyState monthLabel={formatAlbumMonth(month)} hasAnyMemory={hasAnyMemory} />
  }

  return (
    <section aria-labelledby="album-private-shelf" className="flex flex-col gap-6">
      <div data-testid="album-shelf-heading">
        <div className="min-w-0">
          <p className="meta-label">{formatAlbumMonth(month)}のページ</p>
          <h2 id="album-private-shelf" className="mt-1 font-serif text-lg">
            この月のページ
          </h2>
        </div>
      </div>
      <ul className="flex flex-col gap-3" data-testid="album-shelf-list">
        {items.map((memory) => (
          <AlbumListItem
            key={memory.id}
            memory={memory}
            linkRef={(node) => setItemLinkRef(memory.id, node)}
          />
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
    </section>
  )
}

function AlbumListItem({
  memory,
  linkRef,
}: {
  memory: Memory
  linkRef: (node: HTMLAnchorElement | null) => void
}) {
  const isOptimistic = memory.id.startsWith('optimistic-')
  const recordedAt = memory.recorded_at.replaceAll('-', '.')
  const titleId = `album-memory-title-${memory.id}`
  const dateId = `album-memory-date-${memory.id}`

  return (
    <li data-testid="album-shelf-item">
      <div className="paper-surface rounded-[var(--radius-paper-slip)] p-3">
        <div className="flex items-start gap-3">
          {isOptimistic ? (
            <div className="flex min-w-0 flex-1 gap-4 opacity-80">
              <Thumbnail url={memory.cover_thumbnail_url ?? null} />
              <MemoryText
                memory={memory}
                recordedAt={recordedAt}
                titleId={titleId}
                dateId={dateId}
              />
            </div>
          ) : (
            <Link
              ref={linkRef}
              href={`/memory/${memory.id}`}
              aria-labelledby={`${titleId} ${dateId}`}
              className="ease-organic flex min-w-0 flex-1 gap-4 rounded-[var(--radius-photo-mat)] transition-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
            >
              <Thumbnail url={memory.cover_thumbnail_url ?? null} />
              <MemoryText
                memory={memory}
                recordedAt={recordedAt}
                titleId={titleId}
                dateId={dateId}
              />
            </Link>
          )}

          <AlbumFavoriteButton memory={memory} disabled={isOptimistic} />
        </div>
      </div>
    </li>
  )
}

function MemoryText({
  memory,
  recordedAt,
  titleId,
  dateId,
}: {
  memory: Memory
  recordedAt: string
  titleId: string
  dateId: string
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 break-words [overflow-wrap:anywhere]">
      <div className="meta-label">
        <span id={dateId}>{recordedAt}</span>
        {memory.weather ? <span aria-hidden="true">{` ・ ${memory.weather}`}</span> : null}
      </div>
      <h3 id={titleId} className="line-clamp-2 font-serif text-base leading-tight">
        {memory.title}
      </h3>
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
        router.push(signInPath(`${window.location.pathname}${window.location.search}`))
        return
      }
      showToast({
        title: quietStateCopy.album.favoriteFailedTitle,
        description: quietStateCopy.album.favoriteFailedDescription,
      })
    }
  }

  return (
    <QuietIconButton
      onClick={toggleFavorite}
      disabled={disabled || updateMemoryMutation.isPending}
      aria-pressed={memory.is_favorite}
      icon={Heart}
      label={`${memory.title} の しるし`}
      tone="favorite"
      active={memory.is_favorite}
      className="mt-1"
    />
  )
}

function EmptyState({ monthLabel, hasAnyMemory }: { monthLabel: string; hasAnyMemory: boolean }) {
  return (
    <section
      aria-labelledby="album-empty-state-title"
      className="photo-mat rounded-[var(--radius-photo-mat)] px-5 py-8 text-center"
      data-testid="album-month-empty-state"
    >
      <div
        className="bg-paper-slip border-hairline mx-auto flex h-14 w-14 items-center justify-center rounded-[var(--radius-photo-mat)] border"
        aria-hidden="true"
      >
        <BookOpen className="text-sakura-deep size-6" />
      </div>
      <p className="meta-label mt-5">{monthLabel}</p>
      {hasAnyMemory ? (
        <>
          <h2 id="album-empty-state-title" className="mt-3 font-serif text-xl leading-snug">
            この月は、
            <br />
            静かな余白です
          </h2>
          <p className="text-ink-secondary mx-auto mt-3 max-w-[18rem] text-sm leading-7">
            月を移すと、これまでにしまったページを見返せます。
          </p>
        </>
      ) : (
        <>
          <h2 id="album-empty-state-title" className="mt-3 font-serif text-xl leading-snug">
            まだ、ページは
            <br />
            ありません
          </h2>
          <p className="text-ink-secondary mx-auto mt-3 max-w-[18rem] text-sm leading-7">
            残しておきたい日があったら、最初の1まいをここにしまえます。
          </p>
          <Button asChild size="lg" className="mt-6 w-full">
            <Link href="/record" prefetch={false}>
              <Camera className="size-4" aria-hidden="true" />
              最初のページをつくる
            </Link>
          </Button>
        </>
      )}
    </section>
  )
}

function Thumbnail({ url }: { url: string | null }) {
  if (typeof url === 'string') {
    return (
      <div className="photo-mat aspect-[4/5] w-24 shrink-0 rounded-[var(--radius-photo-mat)] p-1">
        <Image
          src={url}
          alt=""
          width={96}
          height={120}
          className="aspect-[4/5] w-full rounded-[var(--radius-photo-inner)] object-cover"
          sizes="96px"
        />
      </div>
    )
  }
  return (
    <div
      className="photo-mat text-sakura-deep flex aspect-[4/5] w-24 shrink-0 items-center justify-center rounded-[var(--radius-photo-mat)]"
      aria-hidden="true"
    >
      <BookOpen className="size-7" />
    </div>
  )
}
