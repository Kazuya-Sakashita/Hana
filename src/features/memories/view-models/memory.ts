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
  images: Array<{ id: string; createdAt: Date }>
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function toMemoryResponse(row: MemoryWithImages): MemoryResponse {
  // 画像は created_at 昇順 (= アップロード順 = 表示順) で並べる
  const sorted = [...row.images].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  return {
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
}
