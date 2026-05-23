import type { components } from '@/lib/api/generated/schema'

type ImageResponse = components['schemas']['Image']
type ContentType = ImageResponse['content_type']

// Prisma の Image row の型 (依存を切るために構造的に定義)
export interface ImageRow {
  id: string
  userId: string
  memoryId: string | null
  storageKey: string
  contentType: string
  width: number
  height: number
  fileSize: number
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

// API レスポンスに storage_key / user_id / deleted_at を **含めない**:
//   - storage_key: PII 扱い (CLAUDE.md §7 ログ禁止リスト)
//   - user_id: 自明 (認証ユーザー)
//   - deleted_at: 内部詳細
export function toImageResponse(row: ImageRow): ImageResponse {
  // content_type は parse / confirm の段階で許可リスト検証済みなので、
  // OpenAPI 由来の union 型に安全にキャストできる
  return {
    id: row.id,
    memory_id: row.memoryId,
    content_type: row.contentType as ContentType,
    width: row.width,
    height: row.height,
    file_size: row.fileSize,
    created_at: row.createdAt.toISOString(),
  }
}
