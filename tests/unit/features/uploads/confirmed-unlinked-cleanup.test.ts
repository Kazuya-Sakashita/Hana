import type { Image, PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import {
  CONFIRMED_UNLINKED_RETENTION_MS,
  runConfirmedUnlinkedCleanup,
} from '@/features/uploads/server/confirmed-unlinked-cleanup'

const NOW = new Date('2026-08-01T12:00:00.000Z')
const IMAGE_ID = '550e8400-e29b-41d4-a716-446655440000'
const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
const STORAGE_KEY = 'uploads/0123456789abcdef/202607/550e8400-e29b-41d4-a716-446655440000.jpg'

function image(overrides: Partial<Image> = {}): Image {
  return {
    id: IMAGE_ID,
    userId: USER_ID,
    memoryId: null,
    memoryPosition: null,
    storageKey: STORAGE_KEY,
    contentType: 'image/jpeg',
    width: 1,
    height: 1,
    fileSize: 4,
    metadataSanitizedAt: NOW,
    createdAt: new Date(NOW.getTime() - CONFIRMED_UNLINKED_RETENTION_MS - 1),
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  }
}

function harness(row = image(), activeProfile = true) {
  const mutable = { ...row }
  let exists = true
  const transaction = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(async () => (activeProfile ? [{ id: USER_ID }] : [])),
    image: {
      findUnique: vi.fn(async () => (exists ? { ...mutable } : null)),
      updateMany: vi.fn(async ({ data }: { data: Partial<Image> }) => {
        Object.assign(mutable, data)
        return { count: 1 }
      }),
      deleteMany: vi.fn(async () => {
        const count = exists ? 1 : 0
        exists = false
        return { count }
      }),
    },
  }
  const prisma = {
    image: {
      findMany: vi.fn(async () => (exists ? [{ ...row }] : [])),
      count: vi.fn(async () => (exists ? 1 : 0)),
    },
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
    ),
  } as unknown as PrismaClient
  return { prisma, mutable, transaction, exists: () => exists }
}

describe('confirmed unlinked image cleanup', () => {
  it('is count-only and Storage read-only in dry-run', async () => {
    const { prisma } = harness()
    const remove = vi.fn()
    const result = await runConfirmedUnlinkedCleanup(prisma, { remove }, { apply: false, now: NOW })
    expect(result).toEqual({
      mode: 'dry-run',
      scanned: 1,
      deleted: 0,
      protected: 0,
      failed: 0,
      pending: 1,
    })
    expect(remove).not.toHaveBeenCalled()
  })

  it('deletes only after the lock-bound 48 hour and active-owner recheck', async () => {
    const { prisma, mutable, transaction, exists } = harness()
    const remove = vi.fn(async () => true)
    const result = await runConfirmedUnlinkedCleanup(prisma, { remove }, { apply: true, now: NOW })
    expect(result.deleted).toBe(1)
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(2)
    expect(transaction.$queryRaw).toHaveBeenCalledOnce()
    expect(mutable.deletedAt).toEqual(NOW)
    expect(exists()).toBe(false)
    expect(result.pending).toBe(0)
  })

  it('protects linked, recent, and blocked-owner images without Storage access', async () => {
    for (const [row, active] of [
      [image({ memoryId: '77777777-7777-4777-8777-777777777777' }), true],
      [image({ createdAt: NOW }), true],
      [image(), false],
    ] as const) {
      const { prisma } = harness(row, active)
      const remove = vi.fn(async () => true)
      const result = await runConfirmedUnlinkedCleanup(
        prisma,
        { remove },
        { apply: true, now: NOW },
      )
      expect(result.protected).toBe(1)
      expect(remove).not.toHaveBeenCalled()
    }
  })

  it('keeps the row retryable when Storage removal fails', async () => {
    const { prisma, mutable } = harness()
    const result = await runConfirmedUnlinkedCleanup(
      prisma,
      { remove: vi.fn(async () => false) },
      { apply: true, now: NOW },
    )
    expect(result.failed).toBe(1)
    expect(mutable.deletedAt).toEqual(NOW)
    expect(result.pending).toBe(1)
  })

  it('retries an existing deleted claim and hard-deletes it after Storage succeeds', async () => {
    const { prisma, transaction, exists } = harness(image({ deletedAt: NOW }))
    const remove = vi.fn(async () => true)

    const result = await runConfirmedUnlinkedCleanup(prisma, { remove }, { apply: true, now: NOW })

    expect(result.deleted).toBe(1)
    expect(transaction.image.updateMany).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledOnce()
    expect(exists()).toBe(false)
    expect(result.pending).toBe(0)
  })

  it('does not touch Storage when the durable claim transaction rolls back', async () => {
    const { prisma } = harness()
    const remove = vi.fn(async () => true)
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error('synthetic_claim_rollback'))

    const result = await runConfirmedUnlinkedCleanup(prisma, { remove }, { apply: true, now: NOW })

    expect(result.failed).toBe(1)
    expect(remove).not.toHaveBeenCalled()
    expect(result.pending).toBe(1)
  })

  it('recovers a durable claim when final hard-delete transaction fails', async () => {
    const { prisma, mutable, transaction, exists } = harness()
    const transactions = vi.mocked(prisma.$transaction)
    transactions
      .mockImplementationOnce(async (callback) => callback(transaction as never))
      .mockRejectedValueOnce(new Error('synthetic_finalize_rollback'))
    const remove = vi.fn(async () => true)

    const first = await runConfirmedUnlinkedCleanup(prisma, { remove }, { apply: true, now: NOW })

    expect(first.failed).toBe(1)
    expect(first.pending).toBe(1)
    expect(mutable.deletedAt).toEqual(NOW)
    expect(exists()).toBe(true)

    const second = await runConfirmedUnlinkedCleanup(prisma, { remove }, { apply: true, now: NOW })

    expect(second.deleted).toBe(1)
    expect(second.pending).toBe(0)
    expect(remove).toHaveBeenCalledTimes(2)
  })
})
