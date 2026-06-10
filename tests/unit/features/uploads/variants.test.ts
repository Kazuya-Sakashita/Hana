import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  _internals,
  generatePreviewVariant,
  generateThumbnailVariant,
} from '@/features/uploads/server/variants'

// 4000×3000 のテスト用元画像 (景色っぽいグラデを sharp で生成)
async function makeOriginal(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 180, b: 160 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer()
}

describe('variants helper (ISSUE-031)', () => {
  it('generateThumbnailVariant: WebP / max width 320px', async () => {
    const original = await makeOriginal(4000, 3000)
    const result = await generateThumbnailVariant(original)
    expect(result.contentType).toBe('image/webp')
    const meta = await sharp(result.buffer).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.width).toBe(_internals.THUMBNAIL_WIDTH) // 320
    // 高さは aspect 維持 (4000:3000 = 4:3) で 240
    expect(meta.height).toBe(240)
  })

  it('generatePreviewVariant: WebP / max width 1024px', async () => {
    const original = await makeOriginal(4000, 3000)
    const result = await generatePreviewVariant(original)
    expect(result.contentType).toBe('image/webp')
    const meta = await sharp(result.buffer).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.width).toBe(_internals.PREVIEW_WIDTH) // 1024
    expect(meta.height).toBe(768)
  })

  it('preserves portrait aspect ratio (3:4)', async () => {
    const original = await makeOriginal(3000, 4000)
    const result = await generateThumbnailVariant(original)
    const meta = await sharp(result.buffer).metadata()
    // resize(320, null, fit: 'inside') は **width を 320** に固定して height を比率算出。
    // 3000:4000 (3:4 portrait) → 320:N where N = 320 × (4000/3000) ≈ 427
    expect(meta.width).toBe(320)
    expect(meta.height).toBeGreaterThan(320) // portrait なので height が width より大きい
    expect(meta.height).toBeLessThanOrEqual(440) // ~427 程度を期待
  })

  it('does not enlarge images smaller than target width', async () => {
    const original = await makeOriginal(200, 150)
    const result = await generateThumbnailVariant(original)
    const meta = await sharp(result.buffer).metadata()
    // 320 まで拡大しない (withoutEnlargement)
    expect(meta.width).toBe(200)
    expect(meta.height).toBe(150)
  })

  it('thumbnail is significantly smaller than preview', async () => {
    const original = await makeOriginal(4000, 3000)
    const [thumb, preview] = await Promise.all([
      generateThumbnailVariant(original),
      generatePreviewVariant(original),
    ])
    expect(thumb.buffer.length).toBeLessThan(preview.buffer.length)
  })
})
