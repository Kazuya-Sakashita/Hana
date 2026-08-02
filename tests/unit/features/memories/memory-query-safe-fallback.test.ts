import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  memoryFindFirst: vi.fn(),
  createSignedUrl: vi.fn(),
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: { memory: { findFirst: mocks.memoryFindFirst } },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) },
  }),
}))

import { fetchMemoryWithPreviews } from '@/features/memories/server/queries'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const MEMORY_ID = '22222222-2222-4222-8222-222222222222'

function memory(
  metadataSanitizedAt: Date | null,
  originalVariantStatus: 'unknown' | 'ready' | 'missing' | 'invalid' = 'unknown',
) {
  return {
    id: MEMORY_ID,
    userId: USER_ID,
    childId: '33333333-3333-4333-8333-333333333333',
    title: '合成記録',
    body: null,
    recordedAt: new Date('2026-07-31T00:00:00.000Z'),
    weather: null,
    isFavorite: false,
    aiGenerated: false,
    idempotencyKey: null,
    requestFingerprint: null,
    createdAt: new Date('2026-07-31T00:00:00.000Z'),
    updatedAt: new Date('2026-07-31T00:00:00.000Z'),
    deletedAt: null,
    images: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        createdAt: new Date('2026-07-31T00:00:00.000Z'),
        memoryPosition: 0,
        storageKey: 'uploads/hash/202607/55555555-5555-4555-8555-555555555555.jpg',
        metadataSanitizedAt,
        originalVariantStatus,
      },
    ],
  }
}

afterEach(() => vi.clearAllMocks())

describe('memory detail image fallback', () => {
  it('returns a placeholder URL value instead of an unsanitized original', async () => {
    mocks.memoryFindFirst.mockResolvedValue(memory(null))
    mocks.createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: 'variant missing' },
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await fetchMemoryWithPreviews({ memoryId: MEMORY_ID, userId: USER_ID })

    expect(result?.imagesWithPreviews).toEqual([
      { id: '44444444-4444-4444-8444-444444444444', previewUrl: null },
    ])
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('keeps the sanitized original fallback available during repair', async () => {
    mocks.memoryFindFirst.mockResolvedValue(memory(new Date('2026-07-31T00:00:00.000Z'), 'ready'))
    mocks.createSignedUrl
      .mockResolvedValueOnce({ data: null, error: { message: 'variant missing' } })
      .mockResolvedValueOnce({
        data: { signedUrl: 'https://example.com/synthetic-original' },
        error: null,
      })

    const result = await fetchMemoryWithPreviews({ memoryId: MEMORY_ID, userId: USER_ID })

    expect(result?.imagesWithPreviews[0]?.previewUrl).toBe('https://example.com/synthetic-original')
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(2)
  })

  it.each(['missing', 'invalid'] as const)(
    'does not fall back to an original whose repair status is %s',
    async (originalVariantStatus) => {
      mocks.memoryFindFirst.mockResolvedValue(
        memory(new Date('2026-07-31T00:00:00.000Z'), originalVariantStatus),
      )
      mocks.createSignedUrl.mockResolvedValue({
        data: null,
        error: { message: 'variant missing' },
      })
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await fetchMemoryWithPreviews({ memoryId: MEMORY_ID, userId: USER_ID })

      expect(result?.imagesWithPreviews[0]?.previewUrl).toBeNull()
      expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1)
      spy.mockRestore()
    },
  )
})
