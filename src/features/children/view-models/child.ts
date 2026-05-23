import type { components } from '@/lib/api/generated/schema'

type ChildResponse = components['schemas']['Child']

// Prisma の Child row の型 (依存を切るために構造的に定義)
export interface ChildRow {
  id: string
  userId: string
  name: string
  birthdate: Date
  avatarUrl: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

function toDateOnly(date: Date): string {
  // YYYY-MM-DD (UTC) を返す。Prisma の @db.Date は時刻情報を持たない。
  return date.toISOString().slice(0, 10)
}

export function toChildResponse(row: ChildRow): ChildResponse {
  return {
    id: row.id,
    name: row.name,
    birthdate: toDateOnly(row.birthdate),
    avatar_url: row.avatarUrl,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}
