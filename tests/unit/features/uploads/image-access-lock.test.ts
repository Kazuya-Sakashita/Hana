import type { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { lockImageAccess, tryLockImageAccess } from '@/features/uploads/server/image-access-lock'

describe('lockImageAccess', () => {
  it('locks unique image ids in deterministic order', async () => {
    const executeRaw = vi.fn().mockResolvedValue(1)
    const transaction = {
      $executeRaw: executeRaw,
    } as unknown as Prisma.TransactionClient

    await lockImageAccess(transaction, ['image-b', 'image-a', 'image-b'])

    expect(executeRaw).toHaveBeenCalledTimes(2)
    expect(executeRaw.mock.calls.map((call) => call[1])).toEqual([
      'hana:image:image-a',
      'hana:image:image-b',
    ])
  })

  it('does not acquire a lock when the memory has no active images', async () => {
    const executeRaw = vi.fn().mockResolvedValue(1)
    const transaction = {
      $executeRaw: executeRaw,
    } as unknown as Prisma.TransactionClient

    await lockImageAccess(transaction, [])

    expect(executeRaw).not.toHaveBeenCalled()
  })

  it('returns whether the image advisory lock was acquired without waiting', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ locked: false }])
    const transaction = { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient

    await expect(tryLockImageAccess(transaction, 'image-a')).resolves.toBe(true)
    await expect(tryLockImageAccess(transaction, 'image-b')).resolves.toBe(false)
    expect(queryRaw.mock.calls.map((call) => call[1])).toEqual([
      'hana:image:image-a',
      'hana:image:image-b',
    ])
  })
})
