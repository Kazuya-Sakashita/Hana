import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  aiGenerationCount: vi.fn(),
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    aiGeneration: { count: mocks.aiGenerationCount },
  },
}))

import {
  checkMonthlyQuota,
  MONTHLY_QUOTA_FREE,
  startOfUtcMonth,
  startOfNextUtcMonth,
} from '@/features/ai/server/quota'

afterEach(() => vi.clearAllMocks())

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

  it('queries with succeeded=true and createdAt >= since', async () => {
    mocks.aiGenerationCount.mockResolvedValue(0)
    await checkMonthlyQuota('user-1')
    const callArgs = mocks.aiGenerationCount.mock.calls[0]?.[0] as
      | { where: { succeeded?: boolean; createdAt?: { gte?: Date } } }
      | undefined
    expect(callArgs?.where.succeeded).toBe(true)
    expect(callArgs?.where.createdAt?.gte).toBeInstanceOf(Date)
  })
})
