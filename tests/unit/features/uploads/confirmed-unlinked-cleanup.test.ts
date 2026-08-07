import type { Image, PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import {
  CONFIRMED_UNLINKED_CLEANUP_LEASE_MS,
  CONFIRMED_UNLINKED_CLEANUP_MAX_ATTEMPTS,
  CONFIRMED_UNLINKED_RETENTION_MS,
  runConfirmedUnlinkedCleanup,
} from '@/features/uploads/server/confirmed-unlinked-cleanup'

const NOW = new Date('2026-08-07T12:00:00.000Z')
const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'

function image(index: number, overrides: Partial<Image> = {}): Image {
  const suffix = String(index).padStart(12, '0')
  return {
    id: `550e8400-e29b-41d4-a716-${suffix}`,
    userId: USER_ID,
    memoryId: null,
    memoryPosition: null,
    storageKey: `uploads/0123456789abcdef/202608/550e8400-e29b-41d4-a716-${suffix}.jpg`,
    contentType: 'image/jpeg',
    width: 1,
    height: 1,
    fileSize: 4,
    metadataSanitizedAt: NOW,
    originalVariantStatus: 'ready',
    thumbnailVariantStatus: 'ready',
    previewVariantStatus: 'ready',
    variantRepairStatus: 'complete',
    variantRepairAttempts: 0,
    variantRepairNextAt: NOW,
    variantRepairClaimToken: null,
    variantRepairClaimedAt: null,
    variantRepairFailureReason: null,
    confirmedCleanupStatus: 'pending',
    confirmedCleanupAttempts: 0,
    confirmedCleanupNextAt: new Date(NOW.getTime() - 1),
    confirmedCleanupClaimToken: null,
    confirmedCleanupClaimedAt: null,
    confirmedCleanupFailureReason: null,
    createdAt: new Date(NOW.getTime() - CONFIRMED_UNLINKED_RETENTION_MS - 1),
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  }
}

function isRetainedCandidate(row: Image): boolean {
  return (
    row.memoryId === null &&
    (row.deletedAt !== null ||
      row.createdAt <= new Date(NOW.getTime() - CONFIRMED_UNLINKED_RETENTION_MS))
  )
}

function isDue(row: Image): boolean {
  const staleBefore = new Date(NOW.getTime() - CONFIRMED_UNLINKED_CLEANUP_LEASE_MS)
  return (
    isRetainedCandidate(row) &&
    row.confirmedCleanupNextAt <= NOW &&
    (row.confirmedCleanupStatus === 'pending' ||
      (row.confirmedCleanupStatus === 'claimed' &&
        row.confirmedCleanupClaimedAt !== null &&
        row.confirmedCleanupClaimedAt <= staleBefore))
  )
}

function harness(
  initial: Image[],
  options: {
    activeProfile?: boolean
    busyImageIds?: string[]
    beforeTransaction?: (transactionNumber: number, rows: Map<string, Image>) => void
    failTransaction?: number
  } = {},
) {
  const rows = new Map(initial.map((row) => [row.id, { ...row }]))
  let transactionNumber = 0
  const busyImageIds = new Set(options.busyImageIds ?? [])
  const transaction = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(async (query: TemplateStringsArray, ...values: unknown[]) => {
      if (query.join('').includes('pg_try_advisory_xact_lock')) {
        const lockKey = String(values[0])
        return [{ locked: ![...busyImageIds].some((imageId) => lockKey.endsWith(imageId)) }]
      }
      return options.activeProfile === false ? [] : [{ id: USER_ID }]
    }),
    image: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = rows.get(where.id)
        return row ? { ...row } : null
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Image> }) => {
        const row = rows.get(where.id)
        if (!row) throw new Error('synthetic_missing_image')
        Object.assign(row, data)
        return { ...row }
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; confirmedCleanupClaimToken?: string }
          data: Partial<Image>
        }) => {
          const row = rows.get(where.id)
          if (
            !row ||
            (where.confirmedCleanupClaimToken !== undefined &&
              row.confirmedCleanupClaimToken !== where.confirmedCleanupClaimToken)
          ) {
            return { count: 0 }
          }
          Object.assign(row, data)
          return { count: 1 }
        },
      ),
      deleteMany: vi.fn(
        async ({ where }: { where: { id: string; confirmedCleanupClaimToken?: string } }) => {
          const row = rows.get(where.id)
          if (
            !row ||
            (where.confirmedCleanupClaimToken !== undefined &&
              row.confirmedCleanupClaimToken !== where.confirmedCleanupClaimToken)
          ) {
            return { count: 0 }
          }
          rows.delete(where.id)
          return { count: 1 }
        },
      ),
    },
  }
  const prisma = {
    image: {
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const current = [...rows.values()]
        if (where.confirmedCleanupStatus === 'dead_letter') {
          return current.filter(
            (row) => row.memoryId === null && row.confirmedCleanupStatus === 'dead_letter',
          ).length
        }
        if (
          typeof where.confirmedCleanupStatus === 'object' &&
          where.confirmedCleanupStatus !== null &&
          'in' in where.confirmedCleanupStatus
        ) {
          return current.filter(
            (row) =>
              isRetainedCandidate(row) &&
              ['pending', 'claimed'].includes(row.confirmedCleanupStatus),
          ).length
        }
        return current.filter(isDue).length
      }),
      findMany: vi.fn(async ({ where, take }: { where: { AND?: unknown[] }; take: number }) => {
        const current = [...rows.values()].filter(isDue).sort((left, right) => {
          const nextAt =
            left.confirmedCleanupNextAt.getTime() - right.confirmedCleanupNextAt.getTime()
          return nextAt !== 0 ? nextAt : left.id.localeCompare(right.id)
        })
        const pageStart = Array.isArray(where.AND) && where.AND.length === 2 ? 50 : 0
        return current.slice(pageStart, pageStart + take).map((row) => ({ ...row }))
      }),
    },
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => {
      transactionNumber += 1
      options.beforeTransaction?.(transactionNumber, rows)
      if (options.failTransaction === transactionNumber) {
        throw new Error('synthetic_transaction_failure')
      }
      return callback(transaction)
    }),
  } as unknown as PrismaClient
  return { prisma, rows, transaction }
}

const emptyFailureReasons = {
  storage_unavailable: 0,
  finalize_failed: 0,
  processing_timeout: 0,
  claim_failed: 0,
  retry_state_unavailable: 0,
}

describe('confirmed unlinked image cleanup', () => {
  it('returns count-only queue metrics without claiming or touching Storage in dry-run', async () => {
    const { prisma, transaction } = harness([image(1)])
    const remove = vi.fn()

    const result = await runConfirmedUnlinkedCleanup(prisma, { remove }, { apply: false, now: NOW })

    expect(result).toEqual({
      mode: 'dry-run',
      eligibleTotal: 1,
      deadLetterTotal: 0,
      scanned: 1,
      deleted: 0,
      protected: 0,
      retried: 0,
      deadLetter: 0,
      failed: 0,
      pending: 1,
      failureReasons: emptyFailureReasons,
    })
    expect(transaction.image.update).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('durably claims an eligible image and deletes all variants before finalizing the row', async () => {
    const row = image(2)
    const { prisma, rows, transaction } = harness([row])
    const remove = vi.fn(async () => true)

    const result = await runConfirmedUnlinkedCleanup(prisma, { remove }, { apply: true, now: NOW })

    expect(result.deleted).toBe(1)
    expect(result.pending).toBe(0)
    expect(remove).toHaveBeenCalledWith([
      row.storageKey,
      row.storageKey.replace(/\.jpg$/, '_thumb.webp'),
      row.storageKey.replace(/\.jpg$/, '_preview.webp'),
    ])
    expect(transaction.image.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deletedAt: NOW,
          confirmedCleanupStatus: 'claimed',
          confirmedCleanupClaimToken: expect.any(String),
        }),
      }),
    )
    expect(rows.size).toBe(0)
  })

  it('rechecks linked, recent, and blocked-owner images under the claim lock', async () => {
    for (const [row, active] of [
      [image(3, { memoryId: '77777777-7777-4777-8777-777777777777' }), true],
      [image(4, { createdAt: NOW }), true],
      [image(5), false],
    ] as const) {
      const { prisma } = harness([row], { activeProfile: active })
      const remove = vi.fn(async () => true)
      const result = await runConfirmedUnlinkedCleanup(
        prisma,
        { remove },
        { apply: true, now: NOW },
      )

      if (active) expect(result.scanned).toBe(0)
      else expect(result.protected).toBe(1)
      expect(remove).not.toHaveBeenCalled()
    }
  })

  it('backs off a temporary Storage failure and keeps only fixed-reason metrics', async () => {
    const row = image(6)
    const { prisma, rows } = harness([row])

    const result = await runConfirmedUnlinkedCleanup(
      prisma,
      { remove: vi.fn(async () => false) },
      { apply: true, now: NOW },
    )

    expect(result).toMatchObject({
      retried: 1,
      deadLetter: 0,
      failed: 0,
      pending: 1,
      failureReasons: { ...emptyFailureReasons, storage_unavailable: 1 },
    })
    expect(rows.get(row.id)).toMatchObject({
      deletedAt: NOW,
      confirmedCleanupStatus: 'pending',
      confirmedCleanupAttempts: 1,
      confirmedCleanupClaimToken: null,
      confirmedCleanupClaimedAt: null,
      confirmedCleanupFailureReason: 'storage_unavailable',
    })
    expect(rows.get(row.id)?.confirmedCleanupNextAt.getTime()).toBeGreaterThan(NOW.getTime())
  })

  it('moves a poison image to dead-letter without blocking the next candidate', async () => {
    const poison = image(7, {
      confirmedCleanupAttempts: CONFIRMED_UNLINKED_CLEANUP_MAX_ATTEMPTS - 1,
    })
    const healthy = image(8)
    const { prisma, rows } = harness([poison, healthy])
    const remove = vi.fn(async (keys: string[]) => !keys[0]?.includes(poison.id))

    const result = await runConfirmedUnlinkedCleanup(
      prisma,
      { remove },
      { apply: true, now: NOW, limit: 2 },
    )

    expect(result).toMatchObject({
      deleted: 1,
      retried: 0,
      deadLetter: 1,
      deadLetterTotal: 1,
      pending: 0,
      failureReasons: { ...emptyFailureReasons, storage_unavailable: 1 },
    })
    expect(rows.get(poison.id)).toMatchObject({
      confirmedCleanupStatus: 'dead_letter',
      confirmedCleanupAttempts: CONFIRMED_UNLINKED_CLEANUP_MAX_ATTEMPTS,
      confirmedCleanupFailureReason: 'storage_unavailable',
    })
    expect(rows.has(healthy.id)).toBe(false)
  })

  it('backs off an expired lease and rejects a concurrent fresh claim token', async () => {
    const expired = image(9, {
      deletedAt: new Date(NOW.getTime() - 1),
      confirmedCleanupStatus: 'claimed',
      confirmedCleanupClaimToken: '11111111-1111-4111-8111-111111111111',
      confirmedCleanupClaimedAt: new Date(NOW.getTime() - CONFIRMED_UNLINKED_CLEANUP_LEASE_MS - 1),
    })
    const expiredHarness = harness([expired])
    const expiredRemove = vi.fn(async () => true)

    const recovered = await runConfirmedUnlinkedCleanup(
      expiredHarness.prisma,
      { remove: expiredRemove },
      { apply: true, now: NOW },
    )

    expect(recovered).toMatchObject({
      retried: 1,
      deadLetter: 0,
      failureReasons: { ...emptyFailureReasons, processing_timeout: 1 },
    })
    expect(expiredRemove).not.toHaveBeenCalled()
    expect(expiredHarness.rows.get(expired.id)).toMatchObject({
      confirmedCleanupStatus: 'pending',
      confirmedCleanupAttempts: 1,
      confirmedCleanupClaimToken: null,
      confirmedCleanupClaimedAt: null,
      confirmedCleanupFailureReason: 'processing_timeout',
    })

    const pending = image(10)
    const concurrent = harness([pending], {
      beforeTransaction: (transactionNumber, rows) => {
        if (transactionNumber !== 1) return
        Object.assign(rows.get(pending.id)!, {
          deletedAt: NOW,
          confirmedCleanupStatus: 'claimed',
          confirmedCleanupClaimToken: '22222222-2222-4222-8222-222222222222',
          confirmedCleanupClaimedAt: NOW,
        })
      },
    })
    const concurrentRemove = vi.fn(async () => true)

    const protectedResult = await runConfirmedUnlinkedCleanup(
      concurrent.prisma,
      { remove: concurrentRemove },
      { apply: true, now: NOW },
    )

    expect(protectedResult.protected).toBe(1)
    expect(concurrentRemove).not.toHaveBeenCalled()
  })

  it('dead-letters the tenth expired lease without touching Storage', async () => {
    const expired = image(13, {
      deletedAt: new Date(NOW.getTime() - 1),
      confirmedCleanupStatus: 'claimed',
      confirmedCleanupAttempts: CONFIRMED_UNLINKED_CLEANUP_MAX_ATTEMPTS - 1,
      confirmedCleanupClaimToken: '33333333-3333-4333-8333-333333333333',
      confirmedCleanupClaimedAt: new Date(NOW.getTime() - CONFIRMED_UNLINKED_CLEANUP_LEASE_MS - 1),
    })
    const expiredHarness = harness([expired])
    const remove = vi.fn(async () => true)

    const result = await runConfirmedUnlinkedCleanup(
      expiredHarness.prisma,
      { remove },
      { apply: true, now: NOW },
    )

    expect(result).toMatchObject({
      retried: 0,
      deadLetter: 1,
      deadLetterTotal: 1,
      failureReasons: { ...emptyFailureReasons, processing_timeout: 1 },
    })
    expect(remove).not.toHaveBeenCalled()
    expect(expiredHarness.rows.get(expired.id)).toMatchObject({
      confirmedCleanupStatus: 'dead_letter',
      confirmedCleanupAttempts: CONFIRMED_UNLINKED_CLEANUP_MAX_ATTEMPTS,
      confirmedCleanupClaimToken: null,
      confirmedCleanupClaimedAt: null,
      confirmedCleanupFailureReason: 'processing_timeout',
    })
  })

  it('skips a contended head candidate and processes the next image within the limit', async () => {
    const busy = image(14)
    const healthy = image(15)
    const queue = harness([busy, healthy], { busyImageIds: [busy.id] })
    const remove = vi.fn(async () => true)

    const result = await runConfirmedUnlinkedCleanup(
      queue.prisma,
      { remove },
      { apply: true, now: NOW, limit: 1 },
    )

    expect(result).toMatchObject({ scanned: 2, protected: 1, deleted: 1 })
    expect(queue.rows.has(busy.id)).toBe(true)
    expect(queue.rows.has(healthy.id)).toBe(false)
  })

  it('keyset-scans beyond a fully contended page without starving the next image', async () => {
    const busy = Array.from({ length: 50 }, (_, index) => image(100 + index))
    const healthy = image(150)
    const queue = harness([...busy, healthy], { busyImageIds: busy.map((row) => row.id) })
    const remove = vi.fn(async () => true)

    const result = await runConfirmedUnlinkedCleanup(
      queue.prisma,
      { remove },
      { apply: true, now: NOW, limit: 1 },
    )

    expect(result).toMatchObject({ scanned: 51, protected: 50, deleted: 1 })
    expect(queue.prisma.image.findMany).toHaveBeenCalledTimes(2)
    expect(queue.rows.has(healthy.id)).toBe(false)
  })

  it('does not start another claim when the route deadline lacks one item budget', async () => {
    const first = image(16)
    const second = image(17)
    const queue = harness([first, second])
    let clock = 1_000
    const now = vi.spyOn(Date, 'now').mockImplementation(() => clock)
    const remove = vi.fn(async () => {
      clock = 10_000
      return true
    })

    try {
      const result = await runConfirmedUnlinkedCleanup(
        queue.prisma,
        { remove },
        {
          apply: true,
          now: NOW,
          limit: 2,
          deadlineAt: 20_000,
          minimumItemBudgetMs: 11_000,
        },
      )

      expect(result).toMatchObject({ scanned: 1, deleted: 1, pending: 1 })
      expect(remove).toHaveBeenCalledOnce()
    } finally {
      now.mockRestore()
    }
  })

  it('records a finalize failure for retry and leaves a recoverable lease if retry state fails', async () => {
    const finalizeRow = image(11)
    const finalizeHarness = harness([finalizeRow], { failTransaction: 2 })

    const finalizeResult = await runConfirmedUnlinkedCleanup(
      finalizeHarness.prisma,
      { remove: vi.fn(async () => true) },
      { apply: true, now: NOW },
    )

    expect(finalizeResult).toMatchObject({
      retried: 1,
      failed: 0,
      failureReasons: { ...emptyFailureReasons, finalize_failed: 1 },
    })
    expect(finalizeHarness.rows.get(finalizeRow.id)).toMatchObject({
      confirmedCleanupStatus: 'pending',
      confirmedCleanupFailureReason: 'finalize_failed',
    })

    const retryStateRow = image(12)
    const retryStateHarness = harness([retryStateRow], { failTransaction: 2 })
    const retryStateResult = await runConfirmedUnlinkedCleanup(
      retryStateHarness.prisma,
      { remove: vi.fn(async () => false) },
      { apply: true, now: NOW },
    )

    expect(retryStateResult).toMatchObject({
      retried: 0,
      failed: 1,
      failureReasons: {
        ...emptyFailureReasons,
        storage_unavailable: 1,
        retry_state_unavailable: 1,
      },
    })
    expect(retryStateHarness.rows.get(retryStateRow.id)).toMatchObject({
      confirmedCleanupStatus: 'claimed',
      confirmedCleanupClaimToken: expect.any(String),
      confirmedCleanupClaimedAt: NOW,
    })
  })
})
