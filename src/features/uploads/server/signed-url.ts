import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { logStorageError } from '@/features/uploads/server/storage-error-log'

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
 * - **variant key が存在しない場合は original key にフォールバック** (ISSUE-031 既存データ救済)
 * - 失敗時は null を返す (呼び出し側でフォールバック処理)
 * - URL はログに残さない (認証情報を含むため)
 */
export async function generateSignedImageUrl(
  storageKey: string,
  size: ImageSize,
  options?: { signal?: AbortSignal },
): Promise<string | null> {
  const signal = options?.signal
  signal?.throwIfAborted()
  const supabase = createSupabaseAdminClient({ signal })
  const key = deriveVariantKey(storageKey, size)
  const primary = await supabase.storage.from(BUCKET).createSignedUrl(key, SIGNED_URL_TTL_SECONDS)
  signal?.throwIfAborted()

  if (primary.data) return primary.data.signedUrl

  // variant が存在しない (ISSUE-031 以前のデータ) → original にフォールバック
  if (size !== 'original') {
    signal?.throwIfAborted()
    const fallback = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storageKey, SIGNED_URL_TTL_SECONDS)
    signal?.throwIfAborted()
    if (fallback.data) return fallback.data.signedUrl

    logStorageError('storage_sign_fallback_failed')
    return null
  }

  // size=original で失敗 → 救済不能
  logStorageError('storage_sign_failed')
  return null
}
