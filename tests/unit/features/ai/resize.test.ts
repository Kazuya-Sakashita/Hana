import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { resizeForClaude, _internals } from '@/features/ai/server/resize'

// 単色画像で大きい画像を合成して、resize が機能していることを確認する。
// 実際の Anthropic 5 MB 上限ぴったりは大きすぎるので、ロジックの分岐だけ検証する。

async function makeJpeg(width: number, height: number, color = { r: 200, g: 100, b: 100 }) {
  return sharp({
    create: { width, height, channels: 3, background: color },
  })
    .jpeg({ quality: 100 })
    .toBuffer()
}

describe('resizeForClaude', () => {
  it('returns image/jpeg media type', async () => {
    const input = await makeJpeg(800, 600)
    const out = await resizeForClaude(input)
    expect(out.mediaType).toBe('image/jpeg')
  })

  it('does not upscale small images', async () => {
    const input = await makeJpeg(800, 600)
    const out = await resizeForClaude(input)
    const meta = await sharp(out.buffer).metadata()
    expect(meta.width).toBe(800)
    expect(meta.height).toBe(600)
  })

  it('downscales when longest edge > 1568', async () => {
    const input = await makeJpeg(3000, 2000)
    const out = await resizeForClaude(input)
    const meta = await sharp(out.buffer).metadata()
    const longest = Math.max(meta.width ?? 0, meta.height ?? 0)
    expect(longest).toBeLessThanOrEqual(_internals.TARGET_MAX_EDGE)
  })

  it('preserves aspect ratio on downscale', async () => {
    const input = await makeJpeg(4032, 3024) // iPhone 12MP
    const out = await resizeForClaude(input)
    const meta = await sharp(out.buffer).metadata()
    const ratio = (meta.width ?? 0) / (meta.height ?? 0)
    expect(ratio).toBeCloseTo(4032 / 3024, 1)
  })

  it('produces under 5 MB output for high-res JPEG', async () => {
    const input = await makeJpeg(6000, 4000)
    const out = await resizeForClaude(input)
    expect(out.buffer.length).toBeLessThanOrEqual(_internals.TARGET_MAX_BYTES)
  })

  it('converts PNG input to JPEG output', async () => {
    const input = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 0, g: 200, b: 0 } },
    })
      .png()
      .toBuffer()
    const out = await resizeForClaude(input)
    const meta = await sharp(out.buffer).metadata()
    expect(meta.format).toBe('jpeg')
    expect(out.mediaType).toBe('image/jpeg')
  })

  it('exposes Anthropic-recommended max edge constant (1568)', () => {
    expect(_internals.TARGET_MAX_EDGE).toBe(1568)
  })
})
