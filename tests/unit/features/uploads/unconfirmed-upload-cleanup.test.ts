import { describe, expect, it, vi } from 'vitest'
import type { UploadReservation } from '@prisma/client'
import {
  runUnconfirmedUploadCleanup,
  type CleanupDatabase,
  type CleanupStorage,
  type ObjectTimestamp,
} from '@/features/uploads/server/unconfirmed-upload-cleanup'

const NOW = new Date('2026-07-31T12:00:00.000Z')
const USER_ID = '10000000-0000-4000-8000-000000000001'
const KEY = 'uploads/576f18824476444f/202607/10000000-0000-4000-8000-000000000002.jpg'

function reservation(overrides: Partial<UploadReservation> = {}): UploadReservation {
  return {
    id: '10000000-0000-4000-8000-000000000003',
    userId: USER_ID,
    storageKey: KEY,
    candidateKind: 'original',
    issuedAt: new Date('2026-07-28T10:00:00.000Z'),
    signedUrlExpiresAt: new Date('2026-07-28T12:00:00.000Z'),
    cleanupAfter: new Date('2026-07-30T10:00:00.000Z'),
    status: 'pending',
    attempts: 0,
    nextAttemptAt: new Date('2026-07-30T10:00:00.000Z'),
    claimToken: null,
    claimedAt: null,
    failureReason: null,
    createdAt: new Date('2026-07-28T10:00:00.000Z'),
    updatedAt: new Date('2026-07-28T10:00:00.000Z'),
    ...overrides,
  }
}

function fixtures(options: {
  candidate?: UploadReservation
  imageExists?: boolean
  timestamps?: ObjectTimestamp[]
  removeResult?: boolean
  profileActive?: boolean
}) {
  let current: UploadReservation | null = options.candidate ?? reservation()
  const mutations = vi.fn()
  const remove = vi.fn().mockResolvedValue(options.removeResult ?? true)
  const timestamps = [...(options.timestamps ?? [new Date('2026-07-29T00:00:00.000Z')])]
  const timestamp = vi.fn().mockImplementation(async () => timestamps.shift() ?? 'missing')
  const queryRaw = vi
    .fn()
    .mockResolvedValue(options.profileActive === false ? [] : [{ id: USER_ID }])
  const transaction = {
    $queryRaw: queryRaw,
    profile: {
      findFirst: vi
        .fn()
        .mockResolvedValue(options.profileActive === false ? null : { id: USER_ID }),
    },
    image: {
      findUnique: vi.fn().mockResolvedValue(options.imageExists ? { id: 'image-id' } : null),
      findFirst: vi.fn().mockResolvedValue(options.imageExists ? { id: 'image-id' } : null),
    },
    uploadReservation: {
      findUnique: vi.fn().mockImplementation(async () => current),
      update: vi.fn().mockImplementation(async ({ data }) => {
        mutations()
        current = current ? { ...current, ...data } : null
        return current
      }),
      updateMany: vi.fn().mockImplementation(async ({ data }) => {
        mutations()
        current = current ? { ...current, ...data } : null
        return { count: current ? 1 : 0 }
      }),
      delete: vi.fn().mockImplementation(async () => {
        mutations()
        current = null
      }),
      deleteMany: vi.fn().mockImplementation(async () => {
        mutations()
        current = null
        return { count: 1 }
      }),
    },
  }
  const database = {
    uploadReservation: { findMany: vi.fn().mockResolvedValue(current ? [current] : []) },
    image: transaction.image,
    profile: transaction.profile,
    $transaction: vi.fn().mockImplementation(async (callback) => callback(transaction)),
  } as unknown as CleanupDatabase
  const storage: CleanupStorage = { timestamp, remove }
  return { database, storage, transaction, mutations, remove, timestamp, getCurrent: () => current }
}

describe('unconfirmed upload cleanup', () => {
  it('keeps dry-run read-only and reports only counts', async () => {
    const fixture = fixtures({})

    const result = await runUnconfirmedUploadCleanup(fixture.database, fixture.storage, {
      apply: false,
      now: NOW,
    })

    expect(result).toEqual({
      mode: 'dry-run',
      scanned: 1,
      eligible: 1,
      protected: 0,
      skippedRecent: 0,
      invalid: 0,
      deleted: 0,
      retried: 0,
      failed: 0,
    })
    expect(fixture.database.$transaction).not.toHaveBeenCalled()
    expect(fixture.remove).not.toHaveBeenCalled()
    expect(fixture.mutations).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain(KEY)
    expect(JSON.stringify(result)).not.toContain(USER_ID)
  })

  it('deletes only the exact expired original and two known variants, then verifies absence', async () => {
    const fixture = fixtures({
      timestamps: [
        new Date('2026-07-29T00:00:00.000Z'),
        'missing',
        'missing',
        'missing',
        'missing',
        'missing',
      ],
    })

    const result = await runUnconfirmedUploadCleanup(fixture.database, fixture.storage, {
      apply: true,
      now: NOW,
    })

    expect(result.deleted).toBe(1)
    expect(fixture.remove).toHaveBeenCalledWith([
      KEY,
      KEY.replace('.jpg', '_thumb.webp'),
      KEY.replace('.jpg', '_preview.webp'),
    ])
    expect(fixture.getCurrent()).toBeNull()
  })

  it('rechecks Image under the shared lock and never calls Storage for a confirmed image', async () => {
    const fixture = fixtures({ imageExists: true })

    const result = await runUnconfirmedUploadCleanup(fixture.database, fixture.storage, {
      apply: true,
      now: NOW,
    })

    expect(result.protected).toBe(1)
    expect(fixture.transaction.$queryRaw).toHaveBeenCalledTimes(2)
    expect(fixture.remove).not.toHaveBeenCalled()
  })

  it('fails closed for an invalid owner prefix and a future object timestamp', async () => {
    const wrongOwner = fixtures({
      candidate: reservation({ userId: '20000000-0000-4000-8000-000000000001' }),
    })
    const future = fixtures({ timestamps: [new Date('2026-08-01T00:00:00.000Z')] })

    const invalidOwnerResult = await runUnconfirmedUploadCleanup(
      wrongOwner.database,
      wrongOwner.storage,
      { apply: true, now: NOW },
    )
    const futureResult = await runUnconfirmedUploadCleanup(future.database, future.storage, {
      apply: true,
      now: NOW,
    })

    expect(invalidOwnerResult.invalid).toBe(1)
    expect(wrongOwner.remove).not.toHaveBeenCalled()
    expect(wrongOwner.getCurrent()?.status).toBe('failed')
    expect(wrongOwner.getCurrent()?.failureReason).toBe('invalid_reservation')
    expect(futureResult.retried).toBe(1)
    expect(future.remove).not.toHaveBeenCalled()
    expect(future.getCurrent()?.failureReason).toBe('invalid_metadata')
  })

  it('reconsiders an object 48 hours after its latest Storage update', async () => {
    const updated = new Date('2026-07-30T00:00:00.000Z')
    const fixture = fixtures({
      timestamps: [
        updated,
        'missing',
        'missing',
        updated,
        'missing',
        'missing',
        'missing',
        'missing',
        'missing',
      ],
    })

    const first = await runUnconfirmedUploadCleanup(fixture.database, fixture.storage, {
      apply: true,
      now: NOW,
    })
    const second = await runUnconfirmedUploadCleanup(fixture.database, fixture.storage, {
      apply: true,
      now: new Date('2026-08-02T12:00:00.000Z'),
    })

    expect(first.skippedRecent).toBe(1)
    expect(second.deleted).toBe(1)
    expect(fixture.remove).toHaveBeenCalledOnce()
  })

  it('locks every possible original and protects a confirmed variant-only legacy group', async () => {
    const fixture = fixtures({
      candidate: reservation({ candidateKind: 'variant_only' }),
      imageExists: true,
    })

    const result = await runUnconfirmedUploadCleanup(fixture.database, fixture.storage, {
      apply: true,
      now: NOW,
    })

    expect(result.protected).toBe(1)
    expect(fixture.transaction.$queryRaw).toHaveBeenCalledTimes(5)
    expect(fixture.remove).not.toHaveBeenCalled()
  })

  it('protects Storage when the profile becomes blocked after legacy discovery', async () => {
    const fixture = fixtures({ profileActive: false })

    const result = await runUnconfirmedUploadCleanup(fixture.database, fixture.storage, {
      apply: true,
      now: NOW,
    })

    expect(result.protected).toBe(1)
    expect(fixture.remove).not.toHaveBeenCalled()
    expect(fixture.getCurrent()).toBeNull()
    expect(
      fixture.transaction.$queryRaw.mock.calls.some(([strings]) =>
        Array.from(strings as TemplateStringsArray)
          .join('')
          .includes('FOR UPDATE'),
      ),
    ).toBe(true)
  })

  it('retries a partial deletion and preserves the reservation', async () => {
    const fixture = fixtures({
      removeResult: true,
      timestamps: [
        new Date('2026-07-29T00:00:00.000Z'),
        'missing',
        'missing',
        'missing',
        new Date('2026-07-29T00:00:00.000Z'),
        'missing',
      ],
    })

    const result = await runUnconfirmedUploadCleanup(fixture.database, fixture.storage, {
      apply: true,
      now: NOW,
    })

    expect(result.retried).toBe(1)
    expect(fixture.getCurrent()?.status).toBe('pending')
    expect(fixture.getCurrent()?.failureReason).toBe('object_still_present')
  })
})
