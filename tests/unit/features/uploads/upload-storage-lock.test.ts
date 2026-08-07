import type { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { tryAcquireUploadStorageLock } from '@/features/uploads/server/upload-storage-lock'

describe('upload storage lock', () => {
  it.each([true, false])('returns the nonblocking advisory lock result %s', async (locked) => {
    const queryRaw = vi.fn().mockResolvedValue([{ locked }])
    const transaction = { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient

    await expect(tryAcquireUploadStorageLock(transaction, 'synthetic-key')).resolves.toBe(locked)
    expect(queryRaw).toHaveBeenCalledOnce()
    expect(queryRaw.mock.calls[0]?.[1]).toBe('hana:upload-storage:synthetic-key')
  })
})
