import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  thumbnail: vi.fn(),
  preview: vi.fn(),
  upload: vi.fn(),
}))

vi.mock('@/features/uploads/server/variants', () => ({
  generateThumbnailVariant: mocks.thumbnail,
  generatePreviewVariant: mocks.preview,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    storage: { from: () => ({ upload: mocks.upload }) },
  }),
}))

import { generateMissingVariants } from '@/features/uploads/server/variant-generation'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.thumbnail.mockResolvedValue({ buffer: Buffer.from('thumbnail'), contentType: 'image/webp' })
  mocks.preview.mockResolvedValue({ buffer: Buffer.from('preview'), contentType: 'image/webp' })
  mocks.upload.mockResolvedValue({ data: {}, error: null })
})

describe('generateMissingVariants', () => {
  it('waits for every requested upload to settle before reporting a failure', async () => {
    let releasePreview!: () => void
    const previewUpload = new Promise<{ data: object; error: null }>((resolve) => {
      releasePreview = () => resolve({ data: {}, error: null })
    })
    mocks.upload.mockImplementation(async (key: string) => {
      if (key.endsWith('_thumb.webp')) {
        return { data: null, error: { message: 'synthetic storage failure' } }
      }
      return previewUpload
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let settled = false

    const generation = generateMissingVariants(
      'uploads/hash/202607/11111111-1111-4111-8111-111111111111.jpg',
      Buffer.from('original'),
      { thumbnail: true, preview: true },
      { failOnError: true },
    ).finally(() => {
      settled = true
    })
    void generation.catch(() => {})
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(settled).toBe(false)

    releasePreview()
    await expect(generation).rejects.toMatchObject({ reason: 'storage_unavailable' })
    spy.mockRestore()
  })

  it('distinguishes image generation failures', async () => {
    mocks.thumbnail.mockRejectedValue(new Error('synthetic sharp failure'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      generateMissingVariants(
        'uploads/hash/202607/11111111-1111-4111-8111-111111111111.jpg',
        Buffer.from('original'),
        { thumbnail: true, preview: false },
        { failOnError: true },
      ),
    ).rejects.toMatchObject({ reason: 'variant_generation_failed' })
    spy.mockRestore()
  })

  it('distinguishes Storage upload failures', async () => {
    mocks.upload.mockResolvedValue({ data: null, error: { message: 'synthetic storage failure' } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      generateMissingVariants(
        'uploads/hash/202607/11111111-1111-4111-8111-111111111111.jpg',
        Buffer.from('original'),
        { thumbnail: true, preview: false },
        { failOnError: true },
      ),
    ).rejects.toMatchObject({ reason: 'storage_unavailable' })
    spy.mockRestore()
  })

  it('does not generate an existing variant', async () => {
    const result = await generateMissingVariants(
      'uploads/hash/202607/11111111-1111-4111-8111-111111111111.jpg',
      Buffer.from('original'),
      { thumbnail: true, preview: false },
      { failOnError: true },
    )

    expect(result).toEqual({ thumbnail: 'ready', preview: 'ready' })
    expect(mocks.thumbnail).toHaveBeenCalledOnce()
    expect(mocks.preview).not.toHaveBeenCalled()
    expect(mocks.upload).toHaveBeenCalledOnce()
  })
})
