import 'server-only'

import type { MemoryCreateInput } from '@/features/memories/server/parse'
import { sortMemoryImages } from '@/features/memories/view-models/memory'
import { problems } from '@/server/api/problems'
import { canonicalizeBareUuid } from '@/lib/uuid'

export interface IdempotentMemory {
  childId: string
  title: string
  body: string | null
  recordedAt: Date
  weather: string | null
  aiGenerated: boolean
  deletedAt: Date | null
  images: Array<{ id: string; createdAt: Date; memoryPosition: number | null }>
}

export function parseMemoryIdempotencyKey(request: Request): string {
  const value = request.headers.get('Idempotency-Key')
  if (!value) {
    throw problems.validation([
      {
        path: 'header.Idempotency-Key',
        reason: 'required',
        message: 'Idempotency-Key ヘッダーが必要です',
      },
    ])
  }
  const canonicalValue = canonicalizeBareUuid(value)
  if (!canonicalValue) {
    throw problems.validation([
      {
        path: 'header.Idempotency-Key',
        reason: 'invalid_format',
        message: 'Idempotency-Key は UUID 形式で指定してください',
      },
    ])
  }
  return canonicalValue
}

export function memoryMatchesCreateInput(
  memory: IdempotentMemory,
  input: MemoryCreateInput,
): boolean {
  if (memory.deletedAt) return false
  const imageIds = sortMemoryImages(memory.images).map((image) => image.id)

  return (
    memory.childId === input.childId &&
    memory.title === input.title &&
    memory.body === input.body &&
    memory.recordedAt.toISOString().slice(0, 10) === input.recordedAt.toISOString().slice(0, 10) &&
    memory.weather === input.weather &&
    memory.aiGenerated === input.aiGenerated &&
    imageIds.length === input.imageIds.length &&
    imageIds.every((imageId, index) => imageId === input.imageIds[index])
  )
}
