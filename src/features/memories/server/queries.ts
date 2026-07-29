import 'server-only'

import type { Prisma } from '@prisma/client'
import { prisma } from '@/server/db/prisma'
import { problems } from '@/server/api/problems'
import { generateSignedImageUrl } from '@/features/uploads/server/signed-url'
import { isUuid } from '@/features/memories/server/parse'
import { sortMemoryImages, type MemoryWithImages } from '@/features/memories/view-models/memory'

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
  recordedFrom?: Date | null
  recordedBefore?: Date | null
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
  if (opts.cursorId) {
    const cursor = await prisma.memory.findFirst({
      where: { ...memoryListWhere(opts), id: opts.cursorId },
      select: { id: true },
    })
    if (!cursor) {
      throw problems.validation([
        {
          path: 'query.cursor',
          reason: 'cursor_out_of_scope',
          message: '指定した絞り込み条件では利用できないカーソルです',
        },
      ])
    }
  }

  const rows = await prisma.memory.findMany({
    where: memoryListWhere(opts),
    orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
    take: opts.limit + 1,
    ...(opts.cursorId ? { cursor: { id: opts.cursorId }, skip: 1 } : {}),
    include: {
      images: {
        where: { deletedAt: null },
        select: { id: true, createdAt: true, memoryPosition: true, storageKey: true },
      },
    },
  })

  const hasMore = rows.length > opts.limit
  const page = hasMore ? rows.slice(0, opts.limit) : rows

  const items = await Promise.all(
    page.map(async (m): Promise<MemoryListItem> => {
      const sortedImages = sortMemoryImages(m.images)
      const first = sortedImages[0]
      const coverThumbnailUrl = first
        ? await generateSignedImageUrl(first.storageKey, 'thumbnail')
        : null
      return { ...m, coverThumbnailUrl }
    }),
  )

  return { items, hasMore }
}

export function countMemories(opts: Omit<FetchMemoriesOptions, 'limit' | 'cursorId'>) {
  return prisma.memory.count({ where: memoryListWhere(opts) })
}

function memoryListWhere(opts: {
  userId: string
  recordedFrom?: Date | null
  recordedBefore?: Date | null
}): Prisma.MemoryWhereInput {
  return {
    userId: opts.userId,
    deletedAt: null,
    ...(opts.recordedFrom && opts.recordedBefore
      ? {
          recordedAt: {
            gte: opts.recordedFrom,
            lt: opts.recordedBefore,
          },
        }
      : {}),
  }
}

// === ISSUE-027: memory 詳細 SC化用 ===

export interface MemoryDetailImage {
  id: string
  previewUrl: string | null
}

export interface MemoryDetail extends MemoryWithImages {
  imagesWithPreviews: MemoryDetailImage[]
}

/**
 * 単一の memory を取得し、 各画像の preview signed URL (1024px) を並列発行する。
 * - memoryId が不正 / 存在しない / 他ユーザー所有 のいずれも `null` を返す
 *   (情報漏洩防止のため not_found と forbidden を区別しない)
 * - 認可成立後の場合のみ画像の preview URL 発行に進む
 */
export async function fetchMemoryWithPreviews(opts: {
  memoryId: string
  userId: string
}): Promise<MemoryDetail | null> {
  if (!isUuid(opts.memoryId)) return null

  const memory = await prisma.memory.findFirst({
    where: { id: opts.memoryId, deletedAt: null },
    include: {
      images: {
        where: { deletedAt: null },
        select: { id: true, createdAt: true, memoryPosition: true, storageKey: true },
      },
    },
  })
  if (!memory) return null
  if (memory.userId !== opts.userId) return null

  const sortedImages = sortMemoryImages(memory.images)
  const imagesWithPreviews = await Promise.all(
    sortedImages.map(async (img): Promise<MemoryDetailImage> => {
      const previewUrl = await generateSignedImageUrl(img.storageKey, 'preview')
      return { id: img.id, previewUrl }
    }),
  )

  return { ...memory, imagesWithPreviews }
}
