import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// service_role キーを持つ Supabase クライアント。
// **絶対にブラウザに渡さない**。CLAUDE.md §7 / ADR-0009 §3 に従いサーバ閉じ込め。
//
// 用途は **Storage 操作** に限定する (bucket Policy が未設定の Phase 1 で必要):
//   - createSignedUploadUrl (presigned URL 発行)
//   - createSignedUrl (signed download URL 発行)
//
// 認証 (auth.users / session) や user 表現には使わない。
// 認可 (user_id ベース) は Route Handler 層で先に済ませてから本 client を呼ぶ。

let cached: SupabaseClient | null = null

export function createSupabaseAdminClient(): SupabaseClient {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  cached = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return cached
}
