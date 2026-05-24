import 'server-only'

import sharp from 'sharp'

// Anthropic Claude Messages API の image 上限:
//   - base64 size: 5,242,880 bytes (5 MB)
//   - 推奨 longest edge: 1568 px (Anthropic vision docs)
//     → これより大きい画像はサーバ側で自動 downscale されるので、
//       我々が事前に縮めて送ると帯域と input トークンを節約できる。
//
// Storage 側 (ADR-0009) は 10 MiB を許容する。
// 元写真は Hana の「10 年後の宝物」公約のためフル品質で Storage に保管し、
// Claude に渡すときだけ **コピーを縮める** のがこの関数の責務。

const TARGET_MAX_EDGE = 1568
// Anthropic の 5 MB 上限より少し余裕を見て 5 MB - 240 KB
const TARGET_MAX_BYTES = 5 * 1024 * 1024 - 240 * 1024
const JPEG_QUALITY_PRIMARY = 85
const JPEG_QUALITY_FALLBACK = 70
const FALLBACK_MAX_EDGE = 1280

export interface ResizedImage {
  buffer: Buffer
  mediaType: 'image/jpeg'
}

/**
 * 画像 buffer を Claude API に送れるサイズに整形する。
 *   1. 長辺が 1568px 超なら 1568px に縮める (fit: inside で短辺は比率維持)
 *   2. JPEG 85% で encode
 *   3. それでも 5 MB を超えるなら 1280px × quality 70 にフォールバック
 * 出力は常に image/jpeg。
 */
export async function resizeForClaude(buffer: Buffer): Promise<ResizedImage> {
  const meta = await sharp(buffer).metadata()
  const longest = Math.max(meta.width ?? 0, meta.height ?? 0)

  const primary = await sharp(buffer)
    .rotate() // EXIF orientation を反映 (回転)。ADR-0009 で EXIF はクライアント Canvas で削除済の想定だが、安全のため
    .resize({
      width: longest > TARGET_MAX_EDGE ? TARGET_MAX_EDGE : undefined,
      height: longest > TARGET_MAX_EDGE ? TARGET_MAX_EDGE : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY_PRIMARY })
    .toBuffer()

  if (primary.length <= TARGET_MAX_BYTES) {
    return { buffer: primary, mediaType: 'image/jpeg' }
  }

  const fallback = await sharp(buffer)
    .rotate()
    .resize({
      width: FALLBACK_MAX_EDGE,
      height: FALLBACK_MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY_FALLBACK })
    .toBuffer()

  return { buffer: fallback, mediaType: 'image/jpeg' }
}

// 定数を test から参照する用
export const _internals = {
  TARGET_MAX_EDGE,
  TARGET_MAX_BYTES,
  JPEG_QUALITY_PRIMARY,
  JPEG_QUALITY_FALLBACK,
  FALLBACK_MAX_EDGE,
}
