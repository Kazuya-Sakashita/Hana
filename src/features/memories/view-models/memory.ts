import type { components } from '@/lib/api/generated/schema'

type MemoryResponse = components['schemas']['Memory']

export interface MemoryRow {
  id: string
  userId: string
  childId: string
  title: string
  body: string | null
  recordedAt: Date
  weather: string | null
  isFavorite: boolean
  aiGenerated: boolean
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export interface MemoryWithImages extends MemoryRow {
  images: Array<{ id: string; createdAt: Date; memoryPosition?: number | null }>
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Prisma row を API レスポンスに変換する。
 *
 * `coverThumbnailUrl` を渡すと `cover_thumbnail_url` フィールドが付加される。
 * list endpoint (BFF、 ADR-0012) で利用し、 詳細/作成/更新では渡さない
 * (フィールド自体が optional なので省略される)。
 */
export function toMemoryResponse(
  row: MemoryWithImages,
  options?: { coverThumbnailUrl: string | null },
): MemoryResponse {
  const sorted = sortMemoryImages(row.images)
  const base: MemoryResponse = {
    id: row.id,
    child_id: row.childId,
    title: row.title,
    body: row.body,
    recorded_at: toDateOnly(row.recordedAt),
    weather: row.weather,
    is_favorite: row.isFavorite,
    ai_generated: row.aiGenerated,
    image_ids: sorted.map((img) => img.id),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
  if (options) {
    return { ...base, cover_thumbnail_url: options.coverThumbnailUrl }
  }
  return base
}

export function sortMemoryImages<T extends { createdAt: Date; memoryPosition?: number | null }>(
  images: T[],
): T[] {
  return [...images].sort((a, b) => {
    const aPosition = a.memoryPosition
    const bPosition = b.memoryPosition
    if (aPosition !== null && aPosition !== undefined) {
      if (bPosition === null || bPosition === undefined) return -1
      if (aPosition !== bPosition) return aPosition - bPosition
    } else if (bPosition !== null && bPosition !== undefined) {
      return 1
    }
    return a.createdAt.getTime() - b.createdAt.getTime()
  })
}
