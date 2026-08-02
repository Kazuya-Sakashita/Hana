import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  aiGenerationCount: vi.fn(),
  aiGenerationCreate: vi.fn(),
  aiGenerationUpdateMany: vi.fn(),
  advisoryLock: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
    aiGeneration: {
      count: mocks.aiGenerationCount,
      create: mocks.aiGenerationCreate,
      updateMany: mocks.aiGenerationUpdateMany,
    },
  },
}))

import {
  checkMonthlyQuota,
  MONTHLY_QUOTA_FREE,
  reservationLeaseExpiresAt,
  reserveMonthlyAiQuota,
  startOfUtcMonth,
  startOfNextUtcMonth,
} from '@/features/ai/server/quota'

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('startOfUtcMonth', () => {
  it('returns Jan 1 UTC for a January date', () => {
    const out = startOfUtcMonth(new Date('2026-01-15T12:34:56Z'))
    expect(out.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('returns May 1 UTC for a May date', () => {
    const out = startOfUtcMonth(new Date('2026-05-23T20:00:00Z'))
    expect(out.toISOString()).toBe('2026-05-01T00:00:00.000Z')
  })
})

describe('startOfNextUtcMonth', () => {
  it('rolls over Dec → Jan of next year', () => {
    const out = startOfNextUtcMonth(new Date('2026-12-31T23:59:59Z'))
    expect(out.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
})

describe('reservationLeaseExpiresAt', () => {
  it('uses the normal thirty second lease away from a UTC month boundary', () => {
    const now = new Date('2026-08-01T12:00:00Z')
    expect(reservationLeaseExpiresAt(now).toISOString()).toBe('2026-08-01T12:00:30.000Z')
  })

  it('does not let a reserved capacity row cross the next UTC month boundary', () => {
    const now = new Date('2026-08-31T23:59:50Z')
    expect(reservationLeaseExpiresAt(now).toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })
})

describe('checkMonthlyQuota', () => {
  it('returns ok when used < limit', async () => {
    mocks.aiGenerationCount.mockResolvedValue(5)
    const q = await checkMonthlyQuota('user-1')
    expect(q.used).toBe(5)
    expect(q.limit).toBe(MONTHLY_QUOTA_FREE)
    expect(q.ok).toBe(true)
  })

  it('returns ok=false when used = limit', async () => {
    mocks.aiGenerationCount.mockResolvedValue(MONTHLY_QUOTA_FREE)
    const q = await checkMonthlyQuota('user-1')
    expect(q.ok).toBe(false)
  })

  it('returns resetAt as start of next UTC month', async () => {
    mocks.aiGenerationCount.mockResolvedValue(0)
    const q = await checkMonthlyQuota('user-1')
    expect(q.resetAt.getUTCDate()).toBe(1)
    expect(q.resetAt.getUTCHours()).toBe(0)
  })

  it('counts every vendor-attempted request since the UTC month boundary', async () => {
    mocks.aiGenerationCount.mockResolvedValue(0)
    await checkMonthlyQuota('user-1')
    const callArgs = mocks.aiGenerationCount.mock.calls[0]?.[0] as
      | { where: { succeeded?: boolean; createdAt?: { gte?: Date } } }
      | undefined
    expect(callArgs?.where.succeeded).toBeUndefined()
    expect(callArgs?.where).toMatchObject({
      OR: [
        { countsTowardQuota: true, quotaCountedAt: { gte: expect.any(Date) } },
        { status: 'reserved', leaseExpiresAt: { gt: expect.any(Date) } },
      ],
    })
    expect(callArgs?.where).not.toHaveProperty('createdAt')
  })
})

describe('reserveMonthlyAiQuota', () => {
  function mockTransaction() {
    mocks.advisoryLock.mockResolvedValue(1)
    mocks.aiGenerationCreate.mockResolvedValue({ id: 'reservation-1' })
    mocks.aiGenerationUpdateMany.mockResolvedValue({ count: 0 })
    mocks.transaction.mockImplementation(
      async (
        callback: (transaction: {
          $executeRaw: typeof mocks.advisoryLock
          aiGeneration: {
            count: typeof mocks.aiGenerationCount
            create: typeof mocks.aiGenerationCreate
            updateMany: typeof mocks.aiGenerationUpdateMany
          }
        }) => Promise<unknown>,
      ) =>
        callback({
          $executeRaw: mocks.advisoryLock,
          aiGeneration: {
            count: mocks.aiGenerationCount,
            create: mocks.aiGenerationCreate,
            updateMany: mocks.aiGenerationUpdateMany,
          },
        }),
    )
  }

  it('serializes the per-user check and reserves a non-charged capacity row', async () => {
    mockTransaction()
    mocks.aiGenerationCount.mockResolvedValue(19)

    await expect(
      reserveMonthlyAiQuota({
        userId: 'user-1',
        childId: 'child-1',
        model: 'model-1',
        promptVersion: 'v1',
      }),
    ).resolves.toEqual({ id: 'reservation-1', claimToken: expect.any(String) })

    expect(mocks.advisoryLock).toHaveBeenCalledTimes(1)
    expect(mocks.aiGenerationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        status: 'reserved',
        countsTowardQuota: false,
        claimToken: expect.any(String),
        leaseExpiresAt: expect.any(Date),
        succeeded: false,
        errorReason: 'in_progress',
      }),
      select: { id: true },
    })
  })

  it('rejects atomically without creating a reservation at the limit', async () => {
    mockTransaction()
    mocks.aiGenerationCount.mockResolvedValue(MONTHLY_QUOTA_FREE)

    await expect(
      reserveMonthlyAiQuota({
        userId: 'user-1',
        childId: 'child-1',
        model: 'model-1',
        promptVersion: 'v1',
      }),
    ).rejects.toMatchObject({ reason: 'ai_quota_exceeded' })
    expect(mocks.aiGenerationCreate).not.toHaveBeenCalled()
  })

  it('recovers expired reserved and processing leases before counting capacity', async () => {
    mockTransaction()
    mocks.aiGenerationCount.mockResolvedValue(0)

    await reserveMonthlyAiQuota({
      userId: 'user-1',
      childId: 'child-1',
      model: 'model-1',
      promptVersion: 'v1',
    })

    expect(mocks.aiGenerationUpdateMany).toHaveBeenNthCalledWith(1, {
      where: {
        userId: 'user-1',
        status: 'reserved',
        leaseExpiresAt: { lte: expect.any(Date) },
      },
      data: expect.objectContaining({
        status: 'failed',
        countsTowardQuota: false,
        errorReason: 'reservation_lease_expired',
      }),
    })
    expect(mocks.aiGenerationUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        userId: 'user-1',
        status: 'processing',
        leaseExpiresAt: { lte: expect.any(Date) },
      },
      data: expect.objectContaining({
        status: 'failed',
        countsTowardQuota: true,
        errorReason: 'processing_lease_expired',
      }),
    })
    expect(mocks.aiGenerationCount).toHaveBeenCalledAfter(mocks.aiGenerationUpdateMany)
  })
})
