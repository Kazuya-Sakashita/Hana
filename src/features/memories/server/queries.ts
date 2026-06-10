import 'server-only'

import { prisma } from '@/server/db/prisma'
import { generateSignedImageUrl } from '@/features/uploads/server/signed-url'
import type { MemoryWithImages } from '@/features/memories/view-models/memory'

// ISSUE-026: memory list の取得 (BFF cover URL 付き) を Route Handler と
// Server Component で共有するため、 ここに抽出。
// もとは src/app/v1/memories/route.ts に inline で書かれていたロジック。

export interface MemoryListItem extends MemoryWithImages {
  coverThumbnailUrl: string | null
}

export interface FetchMemoriesOptions {
  userId: string
  limit: number
  cursorId?: string | null
}

export interface FetchMemoriesResult {
  items: MemoryListItem[]
  hasMore: boolean
}

/**
 * 現在ユーザーの memory を新しい順で取得し、 最初の画像の thumbnail signed URL
 * (= `cover_thumbnail_url`) を **並列発行** して同梱する。
 *
 * - `limit + 1` 件取って `hasMore` 判定
 * - cursor 指定時は `{ id: cursorId }` で skip+1
 * - 画像が無い memory は `coverThumbnailUrl: null`
 * - signed URL 発行に失敗しても memory は返す (失敗時 null)
 */
export async function fetchMemoriesWithCovers(
  opts: FetchMemoriesOptions,
): Promise<FetchMemoriesResult> {
  const rows = await prisma.memory.findMany({
    where: { userId: opts.userId, deletedAt: null },
    orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
    take: opts.limit + 1,
    ...(opts.cursorId ? { cursor: { id: opts.cursorId }, skip: 1 } : {}),
    include: {
      images: {
        where: { deletedAt: null },
        select: { id: true, createdAt: true, storageKey: true },
      },
    },
  })

  const hasMore = rows.length > opts.limit
  const page = hasMore ? rows.slice(0, opts.limit) : rows

  const items = await Promise.all(
    page.map(async (m): Promise<MemoryListItem> => {
      const sortedImages = [...m.images].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      )
      const first = sortedImages[0]
      const coverThumbnailUrl = first
        ? await generateSignedImageUrl(first.storageKey, 'thumbnail')
        : null
      return { ...m, coverThumbnailUrl }
    }),
  )

  return { items, hasMore }
}
