import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'

// 画像 signed URL 生成の共通モジュール (ADR-0012)。
// - /v1/uploads/{imageId}/url (個別取得) と
// - /v1/memories (BFF で list レスポンスに cover を含める)
// の両方から利用する。

const BUCKET = 'images'

export const SIGNED_URL_TTL_SECONDS = 1800 // 30 分 (ADR-0009 §5)

export const SIZES = ['thumbnail', 'preview', 'original'] as const
export type ImageSize = (typeof SIZES)[number]

// resize: 'contain' を明示する理由 (ISSUE-019 検証で判明):
//   Supabase image transformation の既定 resize は 'cover' だが、
//   width だけ指定すると非アスペクト保持のクロップを返す挙動がある。
//   'contain' を明示するとアスペクト比保持の縮小のみになる。
const TRANSFORMS: Record<
  Exclude<ImageSize, 'original'>,
  { width: number; resize: 'contain'; quality: number }
> = {
  thumbnail: { width: 320, resize: 'contain', quality: 70 },
  preview: { width: 1024, resize: 'contain', quality: 80 },
}

/**
 * Supabase Storage の signed download URL を発行する。
 * - 失敗時は null を返す (呼び出し側でフォールバック処理)
 * - URL はログに残さない (認証情報を含むため)
 */
export async function generateSignedImageUrl(
  storageKey: string,
  size: ImageSize,
): Promise<string | null> {
  const supabase = createSupabaseAdminClient()
  const options = size === 'original' ? undefined : { transform: TRANSFORMS[size] }
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storageKey, SIGNED_URL_TTL_SECONDS, options)

  if (error || !data) {
    // 詳細はサーバログのみ
    console.error('createSignedUrl failed', { reason: error?.message ?? 'no_data' })
    return null
  }
  return data.signedUrl
}
