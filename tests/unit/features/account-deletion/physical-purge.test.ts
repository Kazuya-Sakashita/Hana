import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  deletionFindMany: vi.fn(),
  deletionUpdateMany: vi.fn(),
  deletionCount: vi.fn(),
  deletionDelete: vi.fn(),
  profileFindUnique: vi.fn(),
  profileDeleteMany: vi.fn(),
  imageFindMany: vi.fn(),
  imageCount: vi.fn(),
  aiUpdateMany: vi.fn(),
  storageList: vi.fn(),
  storageRemove: vi.fn(),
  deleteUser: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    accountDeletionRequest: {
      findMany: mocks.deletionFindMany,
      updateMany: mocks.deletionUpdateMany,
      count: mocks.deletionCount,
    },
    profile: { findUnique: mocks.profileFindUnique },
    image: { findMany: mocks.imageFindMany, count: mocks.imageCount },
    aiGeneration: { updateMany: mocks.aiUpdateMany },
    $transaction: mocks.transaction,
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({ remove: mocks.storageRemove, list: mocks.storageList }),
    },
  }),
}))

vi.mock('@/lib/supabase/auth-admin', () => ({
  createSupabaseAuthAdminClient: () => ({
    auth: { admin: { deleteUser: mocks.deleteUser } },
  }),
}))

import {
  inspectAccountPhysicalPurge,
  processAccountPhysicalPurges,
} from '@/features/account-deletion/server/physical-purge'

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440000'
const ORIGINAL_KEY = 'uploads/3933181cf32d61a0/202606/550e8400-e29b-41d4-a716-446655440000.jpg'
const dueDate = new Date('2026-06-01T00:00:00Z')
const candidate = {
  id: REQUEST_ID,
  userId: USER_ID,
  purgeAfter: dueDate,
  purgeAttempts: 0,
  purgeStage: 'storage',
  storageDeletedAt: null,
  authDeletedAt: null,
  authRevocationStatus: 'succeeded',
}

function setupDueCandidate() {
  mocks.deletionFindMany.mockResolvedValue([candidate])
  mocks.deletionUpdateMany.mockResolvedValue({ count: 1 })
  mocks.profileFindUnique.mockResolvedValue({
    accessBlockedAt: dueDate,
    deletionRequestedAt: dueDate,
    purgeAfter: dueDate,
  })
  mocks.imageFindMany.mockResolvedValue([{ storageKey: ORIGINAL_KEY }])
  mocks.storageList.mockResolvedValue({ data: [], error: null })
  mocks.storageRemove.mockResolvedValue({ data: [], error: null })
  mocks.aiUpdateMany.mockResolvedValue({ count: 1 })
  mocks.deleteUser.mockResolvedValue({ data: {}, error: null })
  mocks.profileDeleteMany.mockResolvedValue({ count: 1 })
  mocks.deletionDelete.mockResolvedValue({})
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      profile: { deleteMany: mocks.profileDeleteMany },
      accountDeletionRequest: {
        findFirst: async () => ({ id: REQUEST_ID }),
        delete: mocks.deletionDelete,
      },
    }),
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('inspectAccountPhysicalPurge', () => {
  it('returns redacted counts only', async () => {
    mocks.deletionFindMany.mockResolvedValue([{ userId: USER_ID }])
    mocks.imageCount.mockResolvedValue(2)
    mocks.deletionCount.mockResolvedValue(1)
    mocks.storageList.mockResolvedValue({ data: [], error: null })

    await expect(inspectAccountPhysicalPurge()).resolves.toEqual({
      eligibleAccounts: 1,
      leasedAccounts: 1,
      imageRows: 2,
      dbExpectedObjects: 6,
      listedStorageObjects: 0,
      storageListingFailures: 0,
      failedAccounts: 1,
    })
    expect(JSON.stringify(await inspectAccountPhysicalPurge())).not.toContain(USER_ID)
  })
})

describe('processAccountPhysicalPurges', () => {
  it('does nothing when no account has reached the deadline', async () => {
    mocks.deletionFindMany.mockResolvedValue([])

    await expect(processAccountPhysicalPurges()).resolves.toEqual({
      claimed: 0,
      purged: 0,
      failed: 0,
    })
    expect(mocks.storageRemove).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('deletes all image variants before Auth and DB', async () => {
    setupDueCandidate()

    await expect(processAccountPhysicalPurges()).resolves.toEqual({
      claimed: 1,
      purged: 1,
      failed: 0,
    })
    expect(mocks.imageFindMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      select: { storageKey: true },
    })
    expect(mocks.storageRemove).toHaveBeenCalledWith([
      ORIGINAL_KEY,
      'uploads/3933181cf32d61a0/202606/550e8400-e29b-41d4-a716-446655440000_thumb.webp',
      'uploads/3933181cf32d61a0/202606/550e8400-e29b-41d4-a716-446655440000_preview.webp',
    ])
    expect(mocks.aiUpdateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: { userId: null, childId: null, anonymizedAt: expect.any(Date) },
    })
    expect(mocks.deleteUser).toHaveBeenCalledWith(USER_ID, false)
    expect(mocks.storageRemove.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteUser.mock.invocationCallOrder[0] as number,
    )
    expect(mocks.deleteUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.transaction.mock.invocationCallOrder[0] as number,
    )
  })

  it('does not delete Auth or DB when Storage fails', async () => {
    setupDueCandidate()
    mocks.storageRemove.mockResolvedValue({
      data: null,
      error: { status: 503, message: 'private provider detail' },
    })

    await expect(processAccountPhysicalPurges()).resolves.toEqual({
      claimed: 1,
      purged: 0,
      failed: 0,
    })
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(
      mocks.deletionUpdateMany.mock.calls.find(
        (call) => call[0].data.lastPurgeFailureStage === 'storage',
      )?.[0].data,
    ).toMatchObject({
      purgeStatus: 'pending',
      lastPurgeFailureStage: 'storage',
      lastPurgeFailureReason: 'provider_unavailable',
    })
    expect(JSON.stringify(mocks.deletionUpdateMany.mock.calls)).not.toContain(
      'private provider detail',
    )
  })

  it('rejects an account whose Profile is not blocked', async () => {
    setupDueCandidate()
    mocks.profileFindUnique.mockResolvedValue({
      accessBlockedAt: null,
      deletionRequestedAt: dueDate,
      purgeAfter: dueDate,
    })

    await expect(processAccountPhysicalPurges()).resolves.toEqual({
      claimed: 1,
      purged: 0,
      failed: 1,
    })
    expect(mocks.storageRemove).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(
      mocks.deletionUpdateMany.mock.calls.find(
        (call) => call[0].data.lastPurgeFailureStage === 'state',
      )?.[0].data.purgeStatus,
    ).toBe('failed')
  })

  it('converges when Storage and Auth were already deleted', async () => {
    setupDueCandidate()
    mocks.profileFindUnique.mockResolvedValue(null)
    mocks.imageFindMany.mockResolvedValue([])
    mocks.deleteUser.mockResolvedValue({ data: null, error: { status: 404 } })

    await expect(processAccountPhysicalPurges()).resolves.toEqual({
      claimed: 1,
      purged: 1,
      failed: 0,
    })
    expect(mocks.transaction).toHaveBeenCalledOnce()
  })

  it('does not process a candidate when another worker owns the lease', async () => {
    setupDueCandidate()
    mocks.deletionUpdateMany.mockResolvedValue({ count: 0 })

    await expect(processAccountPhysicalPurges()).resolves.toEqual({
      claimed: 0,
      purged: 0,
      failed: 0,
    })
    expect(mocks.profileFindUnique).not.toHaveBeenCalled()
  })

  it('stops before Storage when an Image row points to another owner prefix', async () => {
    setupDueCandidate()
    mocks.imageFindMany.mockResolvedValue([
      {
        storageKey: 'uploads/aaaaaaaaaaaaaaaa/202606/550e8400-e29b-41d4-a716-446655440000.jpg',
      },
    ])

    await expect(processAccountPhysicalPurges()).resolves.toEqual({
      claimed: 1,
      purged: 0,
      failed: 1,
    })
    expect(mocks.storageList).not.toHaveBeenCalled()
    expect(mocks.storageRemove).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('deletes an unconfirmed orphan discovered under the owned prefix', async () => {
    setupDueCandidate()
    const orphan = 'uploads/3933181cf32d61a0/202607/123e4567-e89b-42d3-a456-426614174000.jpg'
    mocks.storageList
      .mockResolvedValueOnce({ data: [{ id: null, name: '202607' }], error: null })
      .mockResolvedValueOnce({
        data: [{ id: 'object-id', name: '123e4567-e89b-42d3-a456-426614174000.jpg' }],
        error: null,
      })

    await processAccountPhysicalPurges()

    expect(mocks.storageRemove).toHaveBeenCalledWith(expect.arrayContaining([orphan]))
  })

  it('resumes from the Auth stage without repeating Storage deletion', async () => {
    setupDueCandidate()
    mocks.deletionFindMany.mockResolvedValue([
      { ...candidate, purgeStage: 'auth', storageDeletedAt: dueDate },
    ])

    await expect(processAccountPhysicalPurges()).resolves.toMatchObject({ purged: 1 })
    expect(mocks.imageFindMany).not.toHaveBeenCalled()
    expect(mocks.storageList).not.toHaveBeenCalled()
    expect(mocks.storageRemove).not.toHaveBeenCalled()
    expect(mocks.deleteUser).toHaveBeenCalledOnce()
  })

  it('resumes the DB stage after hard Auth deletion removed the Profile', async () => {
    setupDueCandidate()
    mocks.deletionFindMany.mockResolvedValue([
      {
        ...candidate,
        purgeStage: 'database',
        storageDeletedAt: dueDate,
        authDeletedAt: dueDate,
        authRevocationStatus: 'failed',
      },
    ])
    mocks.profileFindUnique.mockResolvedValue(null)

    await expect(processAccountPhysicalPurges()).resolves.toMatchObject({ purged: 1 })
    expect(mocks.storageRemove).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.transaction).toHaveBeenCalledOnce()
  })

  it('stops an expired worker before Auth when its fencing token is replaced', async () => {
    setupDueCandidate()
    mocks.deletionUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    await expect(processAccountPhysicalPurges()).resolves.toEqual({
      claimed: 1,
      purged: 0,
      failed: 0,
    })
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('marks the tenth Storage failure terminal', async () => {
    setupDueCandidate()
    mocks.deletionFindMany.mockResolvedValue([{ ...candidate, purgeAttempts: 9 }])
    mocks.storageRemove.mockResolvedValue({ data: null, error: { status: 503 } })

    await expect(processAccountPhysicalPurges()).resolves.toEqual({
      claimed: 1,
      purged: 0,
      failed: 1,
    })
    expect(
      mocks.deletionUpdateMany.mock.calls.find(
        (call) => call[0].data.lastPurgeFailureStage === 'storage',
      )?.[0].data.purgeStatus,
    ).toBe('failed')
  })

  it('does not advance when post-delete listing still finds an object', async () => {
    setupDueCandidate()
    mocks.storageList.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({
      data: [
        {
          id: 'remaining-object',
          name: '550e8400-e29b-41d4-a716-446655440000_preview.webp',
        },
      ],
      error: null,
    })

    await expect(processAccountPhysicalPurges()).resolves.toMatchObject({ purged: 0 })
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(
      mocks.deletionUpdateMany.mock.calls.some(
        (call) => call[0].data.lastPurgeFailureStage === 'storage',
      ),
    ).toBe(true)
  })

  it('stops before Auth when the fencing token changes during AI anonymization', async () => {
    setupDueCandidate()
    let anonymized = false
    mocks.aiUpdateMany.mockImplementation(async () => {
      anonymized = true
      return { count: 1 }
    })
    mocks.deletionUpdateMany.mockImplementation(async ({ data }) => {
      if (anonymized && data.purgeClaimedAt && !data.purgeStage) return { count: 0 }
      return { count: 1 }
    })

    await expect(processAccountPhysicalPurges()).resolves.toMatchObject({ purged: 0 })
    expect(mocks.aiUpdateMany).toHaveBeenCalledOnce()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('does not run the DB transaction when hard Auth deletion fails', async () => {
    setupDueCandidate()
    mocks.deleteUser.mockResolvedValue({ data: null, error: { status: 503 } })

    await expect(processAccountPhysicalPurges()).resolves.toMatchObject({ purged: 0 })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(
      mocks.deletionUpdateMany.mock.calls.some(
        (call) => call[0].data.lastPurgeFailureStage === 'auth',
      ),
    ).toBe(true)
  })
})
