import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'

// 画像 signed URL 生成の共通モジュール (ADR-0012 / ISSUE-031)。
// - /v1/uploads/{imageId}/url (個別取得) と
// - /v1/memories (BFF で list レスポンスに cover を含める)
// の両方から利用する。

const BUCKET = 'images'

export const SIGNED_URL_TTL_SECONDS = 1800 // 30 分 (ADR-0009 §5)

export const SIZES = ['thumbnail', 'preview', 'original'] as const
export type ImageSize = (typeof SIZES)[number]

/**
 * Variant の派生 key を計算する (ISSUE-031)。
 * 例: `uploads/abc/202606/uuid.jpg` →
 *  - thumbnail: `uploads/abc/202606/uuid_thumb.webp`
 *  - preview:   `uploads/abc/202606/uuid_preview.webp`
 *
 * Supabase Free plan で transformation が使えないため、 アップロード時に
 * sharp で事前生成した variant ファイルの key を返す。
 */
export function deriveVariantKey(originalKey: string, size: ImageSize): string {
  if (size === 'original') return originalKey
  const lastDot = originalKey.lastIndexOf('.')
  const base = lastDot >= 0 ? originalKey.substring(0, lastDot) : originalKey
  const suffix = size === 'thumbnail' ? 'thumb' : 'preview'
  return `${base}_${suffix}.webp`
}

/**
 * Supabase Storage の signed download URL を発行する。
 * - size に応じた variant key (ISSUE-031 で事前生成) の URL を返す
 * - 失敗時は null を返す (呼び出し側でフォールバック処理)
 * - URL はログに残さない (認証情報を含むため)
 */
export async function generateSignedImageUrl(
  storageKey: string,
  size: ImageSize,
): Promise<string | null> {
  const supabase = createSupabaseAdminClient()
  const key = deriveVariantKey(storageKey, size)
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(key, SIGNED_URL_TTL_SECONDS)

  if (error || !data) {
    // 詳細はサーバログのみ
    console.error('createSignedUrl failed', { reason: error?.message ?? 'no_data' })
    return null
  }
  return data.signedUrl
}
