import { NextResponse } from 'next/server'
import { requireUser } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { generateStorageKey } from '@/features/uploads/server/storage-key'
import { parsePresignedUploadRequest, readJsonBody } from '@/features/uploads/server/parse'

export const dynamic = 'force-dynamic'

const BUCKET = 'images'
// Supabase の signed upload URL は現状約 2 時間有効。情報提供として expires_at を返す。
const SIGNED_UPLOAD_TTL_MS = 2 * 60 * 60 * 1000

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const raw = await readJsonBody(request)
    const input = parsePresignedUploadRequest(raw)

    const storageKey = generateStorageKey(user.id, input.contentType)
    // 認可は requireUser() で済んでいるため、Storage への発行は service_role で行う
    // (Storage Policy は Phase 2 で導入予定・ADR-0009 §3)
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storageKey)

    if (error || !data) {
      // 詳細はサーバログのみ。クライアントには 500 (internal_server_error) を返す
      console.error('createSignedUploadUrl failed', {
        reason: error?.message ?? 'no_data',
      })
      throw new Error('Storage signed upload URL failed')
    }

    const expiresAt = new Date(Date.now() + SIGNED_UPLOAD_TTL_MS).toISOString()
    return NextResponse.json({
      presigned_url: data.signedUrl,
      storage_key: storageKey,
      expires_at: expiresAt,
    })
  } catch (e) {
    return toProblemResponse(e)
  }
}
