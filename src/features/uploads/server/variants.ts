import 'server-only'

import sharp from 'sharp'

// 画像 variant (thumbnail / preview) の事前生成 (ISSUE-031)。
// アップロード時に Storage に保存し、 配信時は variant key の signed URL を返す。
// Supabase Free plan で Image Transformation が使えないための対応策。

const THUMBNAIL_WIDTH = 320
const THUMBNAIL_QUALITY = 70
const PREVIEW_WIDTH = 1024
const PREVIEW_QUALITY = 80

export interface VariantBuffer {
  buffer: Buffer
  contentType: 'image/webp'
}

/**
 * 320px wide / WebP q70 のサムネを生成する (一覧表示用)。
 * .rotate() で EXIF orientation を反映 (画像が回転して見えるのを防ぐ)。
 * 元画像が 320px 未満なら拡大しない (withoutEnlargement)。
 */
export async function generateThumbnailVariant(original: Buffer): Promise<VariantBuffer> {
  const buffer = await sharp(original)
    .rotate()
    .resize(THUMBNAIL_WIDTH, null, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: THUMBNAIL_QUALITY })
    .toBuffer()
  return { buffer, contentType: 'image/webp' }
}

/**
 * 1024px wide / WebP q80 のプレビューを生成する (詳細表示用)。
 */
export async function generatePreviewVariant(original: Buffer): Promise<VariantBuffer> {
  const buffer = await sharp(original)
    .rotate()
    .resize(PREVIEW_WIDTH, null, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: PREVIEW_QUALITY })
    .toBuffer()
  return { buffer, contentType: 'image/webp' }
}

// 定数を test から参照する用
export const _internals = {
  THUMBNAIL_WIDTH,
  THUMBNAIL_QUALITY,
  PREVIEW_WIDTH,
  PREVIEW_QUALITY,
}
