import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  deleteUser: vi.fn(),
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    accountDeletionRequest: {
      findMany: mocks.findMany,
      updateMany: mocks.updateMany,
    },
  },
}))

vi.mock('@/lib/supabase/auth-admin', () => ({
  createSupabaseAuthAdminClient: () => ({
    auth: { admin: { deleteUser: mocks.deleteUser } },
  }),
}))

import { processAccountDeletionAuthRevocations } from '@/features/account-deletion/server/auth-revocation'

afterEach(() => {
  vi.clearAllMocks()
})

describe('processAccountDeletionAuthRevocations', () => {
  it('claims a due request and marks a provider success as succeeded', async () => {
    mocks.findMany.mockResolvedValue([
      { id: 'request-id', userId: 'user-id', authRevocationAttempts: 0 },
    ])
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 })
    mocks.deleteUser.mockResolvedValue({ data: {}, error: null })

    await expect(processAccountDeletionAuthRevocations()).resolves.toEqual({
      claimed: 1,
      succeeded: 1,
      failed: 0,
    })
    expect(mocks.deleteUser).toHaveBeenCalledWith('user-id', true)
    expect(mocks.updateMany.mock.calls[1]?.[0].data).toMatchObject({
      authRevocationStatus: 'succeeded',
      authRevocationAttempts: 1,
      authClaimedAt: null,
      lastAuthFailureReason: null,
    })
  })

  it('treats an already deleted provider identity as success', async () => {
    mocks.findMany.mockResolvedValue([
      { id: 'request-id', userId: 'user-id', authRevocationAttempts: 2 },
    ])
    mocks.updateMany.mockResolvedValue({ count: 1 })
    mocks.deleteUser.mockResolvedValue({
      data: null,
      error: { status: 404, message: 'private provider message' },
    })

    const result = await processAccountDeletionAuthRevocations()

    expect(result.succeeded).toBe(1)
    expect(mocks.updateMany.mock.calls[1]?.[0].data.lastAuthFailureReason).toBeNull()
  })

  it('releases a failed claim with a future retry and an allowlisted reason', async () => {
    mocks.findMany.mockResolvedValue([
      { id: 'request-id', userId: 'user-id', authRevocationAttempts: 1 },
    ])
    mocks.updateMany.mockResolvedValue({ count: 1 })
    mocks.deleteUser.mockRejectedValue(new Error('private provider detail'))

    const result = await processAccountDeletionAuthRevocations()

    expect(result).toEqual({ claimed: 1, succeeded: 0, failed: 0 })
    const failure = mocks.updateMany.mock.calls[1]?.[0].data
    expect(failure).toMatchObject({
      authRevocationAttempts: 2,
      authClaimedAt: null,
      lastAuthFailureReason: 'provider_unavailable',
    })
    expect(failure.nextAuthAttemptAt).toBeInstanceOf(Date)
    expect(JSON.stringify(failure)).not.toContain('private provider detail')
  })

  it('does not call the provider when another worker wins the lease', async () => {
    mocks.findMany.mockResolvedValue([
      { id: 'request-id', userId: 'user-id', authRevocationAttempts: 0 },
    ])
    mocks.updateMany.mockResolvedValue({ count: 0 })

    await expect(processAccountDeletionAuthRevocations()).resolves.toEqual({
      claimed: 0,
      succeeded: 0,
      failed: 0,
    })
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('marks the tenth provider failure as terminal without lifting the access block', async () => {
    mocks.findMany.mockResolvedValue([
      { id: 'request-id', userId: 'user-id', authRevocationAttempts: 9 },
    ])
    mocks.updateMany.mockResolvedValue({ count: 1 })
    mocks.deleteUser.mockRejectedValue(new Error('provider unavailable'))

    await expect(processAccountDeletionAuthRevocations()).resolves.toEqual({
      claimed: 1,
      succeeded: 0,
      failed: 1,
    })

    expect(mocks.updateMany.mock.calls[1]?.[0].data).toMatchObject({
      authRevocationStatus: 'failed',
      authRevocationAttempts: 10,
      lastAuthFailureReason: 'provider_unavailable',
    })
  })

  it('can recover after Auth succeeds but the DB success marker fails', async () => {
    const candidate = { id: 'request-id', userId: 'user-id', authRevocationAttempts: 0 }
    mocks.findMany.mockResolvedValue([candidate])
    mocks.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error('db marker unavailable'))
    mocks.deleteUser.mockResolvedValueOnce({ data: {}, error: null })

    await expect(processAccountDeletionAuthRevocations()).rejects.toThrow('db marker unavailable')

    mocks.findMany.mockResolvedValue([
      { ...candidate, authRevocationAttempts: 0, authClaimedAt: new Date(0) },
    ])
    mocks.updateMany.mockResolvedValue({ count: 1 })
    mocks.deleteUser.mockResolvedValue({
      data: null,
      error: { status: 404, message: 'unstable provider wording' },
    })

    await expect(processAccountDeletionAuthRevocations()).resolves.toEqual({
      claimed: 1,
      succeeded: 1,
      failed: 0,
    })
    expect(mocks.updateMany.mock.calls.at(-1)?.[0].data.authRevocationStatus).toBe('succeeded')
  })
})
