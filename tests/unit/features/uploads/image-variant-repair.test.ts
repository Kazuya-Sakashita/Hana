import type { Image, PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/uploads/server/image-access-lock', () => ({
  lockImageAccess: vi.fn(),
}))

import {
  runImageVariantRepairs,
  VariantRepairError,
  type ImageVariantRepairStorage,
} from '@/features/uploads/server/image-variant-repair'

const NOW = new Date('2026-07-31T12:00:00.000Z')
const STORAGE_KEY = 'uploads/hash/202607/11111111-1111-4111-8111-111111111111.jpg'

function image(overrides: Partial<Image> = {}): Image {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    userId: '33333333-3333-4333-8333-333333333333',
    memoryId: null,
    memoryPosition: null,
    storageKey: STORAGE_KEY,
    contentType: 'image/jpeg',
    width: 800,
    height: 600,
    fileSize: 1000,
    metadataSanitizedAt: NOW,
    originalVariantStatus: 'unknown',
    thumbnailVariantStatus: 'unknown',
    previewVariantStatus: 'unknown',
    variantRepairStatus: 'pending',
    variantRepairAttempts: 0,
    variantRepairNextAt: new Date(NOW.getTime() - 1),
    variantRepairClaimToken: null,
    variantRepairClaimedAt: null,
    variantRepairFailureReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  }
}

function harness(initial = image(), beforeTransaction?: (row: Image) => void) {
  const row = { ...initial }
  const candidate = { ...initial }
  const transaction = {
    $executeRaw: vi.fn(),
    image: {
      findUnique: vi.fn(async () => ({ ...row })),
      update: vi.fn(async ({ data }: { data: Partial<Image> }) => Object.assign(row, data)),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { variantRepairClaimToken?: string }
          data: Partial<Image>
        }) => {
          if (
            where.variantRepairClaimToken !== undefined &&
            row.variantRepairClaimToken !== where.variantRepairClaimToken
          ) {
            return { count: 0 }
          }
          Object.assign(row, data)
          return { count: 1 }
        },
      ),
    },
  }
  const prisma = {
    image: {
      count: vi.fn(async ({ where }: { where: { variantRepairStatus?: string } }) =>
        where.variantRepairStatus === 'dead_letter' ? 0 : 1,
      ),
      findMany: vi.fn(async () => [candidate]),
    },
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => {
      beforeTransaction?.(row)
      return callback(transaction)
    }),
  } as unknown as PrismaClient
  return { prisma, row, transaction }
}

function storage() {
  return {
    exists: vi.fn(async (_key: string) => true),
    loadOriginal: vi.fn(async (_image: Image) => Buffer.from('original')),
    generate: vi.fn(
      async (
        _storageKey: string,
        _original: Buffer,
        _requested: { thumbnail: boolean; preview: boolean },
      ) => ({ thumbnail: 'ready' as const, preview: 'ready' as const }),
    ),
  } satisfies ImageVariantRepairStorage
}

beforeEach(() => vi.clearAllMocks())

describe('runImageVariantRepairs', () => {
  it('counts candidates without claiming or touching Storage in dry-run mode', async () => {
    const { prisma, transaction } = harness()
    const store = storage()

    const result = await runImageVariantRepairs(prisma, store, { apply: false, now: NOW })

    expect(result).toEqual({
      mode: 'dry-run',
      eligibleTotal: 1,
      deadLetterTotal: 0,
      scanned: 1,
      repaired: 0,
      alreadyReady: 0,
      protected: 0,
      retried: 0,
      deadLetter: 0,
      failed: 0,
    })
    expect(transaction.image.update).not.toHaveBeenCalled()
    expect(store.exists).not.toHaveBeenCalled()
  })

  it('marks all three files ready without regenerating existing variants', async () => {
    const { prisma, row } = harness()
    const store = storage()

    const result = await runImageVariantRepairs(prisma, store, { apply: true, now: NOW })

    expect(result.alreadyReady).toBe(1)
    expect(store.exists).toHaveBeenCalledTimes(3)
    expect(store.loadOriginal).not.toHaveBeenCalled()
    expect(store.generate).not.toHaveBeenCalled()
    expect(row).toMatchObject({
      originalVariantStatus: 'ready',
      thumbnailVariantStatus: 'ready',
      previewVariantStatus: 'ready',
      variantRepairStatus: 'complete',
      variantRepairAttempts: 0,
    })
  })

  it('regenerates and verifies only a missing thumbnail', async () => {
    const { prisma, row } = harness()
    const store = storage()
    const thumbnailKey = STORAGE_KEY.replace(/\.jpg$/, '_thumb.webp')
    let thumbnailChecks = 0
    store.exists.mockImplementation(async (key: string) => {
      if (key !== thumbnailKey) return true
      thumbnailChecks += 1
      return thumbnailChecks > 1
    })

    const result = await runImageVariantRepairs(prisma, store, { apply: true, now: NOW })

    expect(result.repaired).toBe(1)
    expect(store.loadOriginal).toHaveBeenCalledOnce()
    expect(store.generate).toHaveBeenCalledWith(STORAGE_KEY, Buffer.from('original'), {
      thumbnail: true,
      preview: false,
    })
    expect(row.variantRepairStatus).toBe('complete')
  })

  it('recovers idempotently after a temporary Storage failure', async () => {
    const { prisma, row } = harness()
    const store = storage()
    store.exists.mockRejectedValueOnce(new VariantRepairError('storage_unavailable'))

    const first = await runImageVariantRepairs(prisma, store, { apply: true, now: NOW })

    expect(first.retried).toBe(1)
    expect(row).toMatchObject({
      variantRepairStatus: 'pending',
      variantRepairAttempts: 1,
      variantRepairFailureReason: 'storage_unavailable',
    })

    row.variantRepairNextAt = new Date(NOW.getTime() + 2 * 60_000)
    const second = await runImageVariantRepairs(prisma, store, {
      apply: true,
      now: new Date(NOW.getTime() + 3 * 60_000),
    })

    expect(second.alreadyReady).toBe(1)
    expect(row.variantRepairStatus).toBe('complete')
    expect(row.variantRepairAttempts).toBe(0)
  })

  it('records a missing original without attempting generation', async () => {
    const { prisma, row } = harness()
    const store = storage()
    store.exists.mockImplementation(async (key: string) => key !== STORAGE_KEY)

    const result = await runImageVariantRepairs(prisma, store, { apply: true, now: NOW })

    expect(result.retried).toBe(1)
    expect(store.loadOriginal).not.toHaveBeenCalled()
    expect(store.generate).not.toHaveBeenCalled()
    expect(row).toMatchObject({
      originalVariantStatus: 'missing',
      variantRepairFailureReason: 'original_missing',
    })
  })

  it('marks an invalid original and stops after the maximum attempt', async () => {
    const { prisma, row } = harness(image({ variantRepairAttempts: 9 }))
    const store = storage()
    store.exists.mockImplementation(async (key: string) => key === STORAGE_KEY)
    store.loadOriginal.mockRejectedValue(new VariantRepairError('original_invalid'))

    const result = await runImageVariantRepairs(prisma, store, { apply: true, now: NOW })

    expect(result.deadLetter).toBe(1)
    expect(row).toMatchObject({
      originalVariantStatus: 'invalid',
      variantRepairStatus: 'dead_letter',
      variantRepairAttempts: 10,
      variantRepairFailureReason: 'original_invalid',
    })
  })

  it('retries when a generated variant cannot be verified in Storage', async () => {
    const { prisma, row } = harness()
    const store = storage()
    const thumbnailKey = STORAGE_KEY.replace(/\.jpg$/, '_thumb.webp')
    store.exists.mockImplementation(async (key: string) => key !== thumbnailKey)

    const result = await runImageVariantRepairs(prisma, store, { apply: true, now: NOW })

    expect(result.retried).toBe(1)
    expect(row.variantRepairFailureReason).toBe('variant_verification_failed')
  })

  it('protects an image deleted after candidate selection', async () => {
    const { prisma } = harness(image(), (row) => {
      row.deletedAt = NOW
    })
    const store = storage()

    const result = await runImageVariantRepairs(prisma, store, { apply: true, now: NOW })

    expect(result.protected).toBe(1)
    expect(store.exists).not.toHaveBeenCalled()
  })
})
