import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  CONFIRMED_UNLINKED_CLEANUP_LEASE_MS,
  CONFIRMED_UNLINKED_CLEANUP_MAX_ATTEMPTS,
  CONFIRMED_UNLINKED_RETENTION_MS,
  runConfirmedUnlinkedCleanup,
  type ConfirmedUnlinkedCleanupStorage,
} from '@/features/uploads/server/confirmed-unlinked-cleanup'
import { lockImageAccess } from '@/features/uploads/server/image-access-lock'
import { deriveVariantKey } from '@/features/uploads/server/signed-url'

const qaEnabled = process.env.ISSUE_155_CLEANUP_QA === '1'
const NOW = new Date('2026-08-07T12:00:00.000Z')
const userId = '00000000-0000-4000-8000-000000000155'

function assertSyntheticDatabase(environment: NodeJS.ProcessEnv): void {
  if (environment.ISSUE_155_CLEANUP_QA !== '1') throw new Error('qa_opt_in_required')
  for (const name of ['DATABASE_URL', 'DIRECT_URL'] as const) {
    const value = environment[name]
    if (!value) throw new Error(`${name.toLowerCase()}_required`)
    const url = new URL(value)
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/hana_ci') {
      throw new Error(`${name.toLowerCase()}_synthetic_local_database_required`)
    }
  }
}

function keys(storageKey: string): string[] {
  return [
    storageKey,
    deriveVariantKey(storageKey, 'thumbnail'),
    deriveVariantKey(storageKey, 'preview'),
  ]
}

function storageFixture(
  initialKeys: string[],
  remove: (keys: string[], call: number) => Promise<boolean>,
) {
  const objects = new Set(initialKeys)
  let calls = 0
  const storage: ConfirmedUnlinkedCleanupStorage = {
    remove: vi.fn(async (requested: string[]) => {
      calls += 1
      const removed = await remove(requested, calls)
      if (removed) requested.forEach((key: string) => objects.delete(key))
      return removed
    }),
  }
  return { objects, storage }
}

describe.skipIf(!qaEnabled)('ISSUE-155 confirmed cleanup PostgreSQL and Storage recovery', () => {
  let prisma: PrismaClient

  beforeAll(async () => {
    assertSyntheticDatabase(process.env)
    ;({ prisma } = await import('@/server/db/prisma'))
    await prisma.profile.deleteMany({ where: { id: userId } })
    await prisma.profile.create({ data: { id: userId } })
  })

  beforeEach(async () => {
    await prisma.image.deleteMany({ where: { userId } })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.profile.deleteMany({ where: { id: userId } })
    await prisma.$disconnect()
  })

  async function createImage(
    overrides: Partial<{
      confirmedCleanupStatus: string
      confirmedCleanupAttempts: number
      confirmedCleanupNextAt: Date
      confirmedCleanupClaimToken: string | null
      confirmedCleanupClaimedAt: Date | null
      confirmedCleanupFailureReason: string | null
      createdAt: Date
      deletedAt: Date | null
    }> = {},
  ) {
    const id = randomUUID()
    const storageKey = `uploads/0123456789abcdef/202608/${id}.jpg`
    await prisma.image.create({
      data: {
        id,
        userId,
        storageKey,
        contentType: 'image/jpeg',
        width: 1,
        height: 1,
        fileSize: 4,
        createdAt: new Date(NOW.getTime() - CONFIRMED_UNLINKED_RETENTION_MS - 1),
        confirmedCleanupNextAt: new Date(NOW.getTime() - 1),
        ...overrides,
      },
    })
    return { id, storageKey, keys: keys(storageKey) }
  }

  it('allows only one concurrent worker to process a fresh lease', async () => {
    const fixture = await createImage()
    let releaseStorage!: () => void
    let storageStarted!: () => void
    const release = new Promise<void>((resolve) => {
      releaseStorage = resolve
    })
    const started = new Promise<void>((resolve) => {
      storageStarted = resolve
    })
    const store = storageFixture(fixture.keys, async () => {
      storageStarted()
      await release
      return true
    })

    const first = runConfirmedUnlinkedCleanup(prisma, store.storage, {
      apply: true,
      now: NOW,
      limit: 1,
    })
    await started
    const second = await runConfirmedUnlinkedCleanup(prisma, store.storage, {
      apply: true,
      now: NOW,
      limit: 1,
    })
    releaseStorage()
    const firstResult = await first

    expect(firstResult.deleted).toBe(1)
    expect(second).toMatchObject({ eligibleTotal: 0, scanned: 0, deleted: 0 })
    expect(store.storage.remove).toHaveBeenCalledOnce()
    expect(await prisma.image.findUnique({ where: { id: fixture.id } })).toBeNull()
    expect(store.objects.size).toBe(0)
  })

  it('backs off a Storage failure and succeeds after the scheduled retry', async () => {
    const fixture = await createImage()
    const store = storageFixture(fixture.keys, async (_keys, call) => call > 1)

    const failed = await runConfirmedUnlinkedCleanup(prisma, store.storage, {
      apply: true,
      now: NOW,
      limit: 1,
    })
    const queued = await prisma.image.findUniqueOrThrow({ where: { id: fixture.id } })

    expect(failed).toMatchObject({
      retried: 1,
      deadLetter: 0,
      failureReasons: { storage_unavailable: 1 },
    })
    expect(queued).toMatchObject({
      deletedAt: NOW,
      confirmedCleanupStatus: 'pending',
      confirmedCleanupAttempts: 1,
      confirmedCleanupFailureReason: 'storage_unavailable',
    })
    expect(store.objects.size).toBe(3)

    const tooEarly = await runConfirmedUnlinkedCleanup(prisma, store.storage, {
      apply: true,
      now: new Date(queued.confirmedCleanupNextAt.getTime() - 1),
      limit: 1,
    })
    expect(tooEarly.scanned).toBe(0)

    const recovered = await runConfirmedUnlinkedCleanup(prisma, store.storage, {
      apply: true,
      now: queued.confirmedCleanupNextAt,
      limit: 1,
    })
    expect(recovered.deleted).toBe(1)
    expect(await prisma.image.findUnique({ where: { id: fixture.id } })).toBeNull()
    expect(store.objects.size).toBe(0)
  })

  it('backs off an expired lease, then recovers without exposing identifiers', async () => {
    const fixture = await createImage({
      deletedAt: new Date(NOW.getTime() - 1),
      confirmedCleanupStatus: 'claimed',
      confirmedCleanupClaimToken: randomUUID(),
      confirmedCleanupClaimedAt: new Date(NOW.getTime() - CONFIRMED_UNLINKED_CLEANUP_LEASE_MS - 1),
    })
    const store = storageFixture(fixture.keys, async () => true)

    const result = await runConfirmedUnlinkedCleanup(prisma, store.storage, {
      apply: true,
      now: NOW,
      limit: 1,
    })

    expect(result).toMatchObject({
      retried: 1,
      deleted: 0,
      failureReasons: { processing_timeout: 1 },
    })
    expect(store.storage.remove).not.toHaveBeenCalled()
    const queued = await prisma.image.findUniqueOrThrow({ where: { id: fixture.id } })
    expect(queued).toMatchObject({
      confirmedCleanupStatus: 'pending',
      confirmedCleanupAttempts: 1,
      confirmedCleanupClaimToken: null,
      confirmedCleanupClaimedAt: null,
      confirmedCleanupFailureReason: 'processing_timeout',
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(userId)
    expect(serialized).not.toContain(fixture.id)
    expect(serialized).not.toContain('uploads/')

    const recovered = await runConfirmedUnlinkedCleanup(prisma, store.storage, {
      apply: true,
      now: queued.confirmedCleanupNextAt,
      limit: 1,
    })
    expect(recovered.deleted).toBe(1)
    expect(await prisma.image.findUnique({ where: { id: fixture.id } })).toBeNull()
  })

  it('fences the old worker when its lease expires during Storage processing', async () => {
    const fixture = await createImage()
    let releaseStorage!: () => void
    let storageStarted!: () => void
    const release = new Promise<void>((resolve) => {
      releaseStorage = resolve
    })
    const started = new Promise<void>((resolve) => {
      storageStarted = resolve
    })
    const store = storageFixture(fixture.keys, async () => {
      storageStarted()
      await release
      return true
    })

    const oldWorker = runConfirmedUnlinkedCleanup(prisma, store.storage, {
      apply: true,
      now: NOW,
      limit: 1,
    })
    await started
    const leaseRecovery = await runConfirmedUnlinkedCleanup(prisma, store.storage, {
      apply: true,
      now: new Date(NOW.getTime() + CONFIRMED_UNLINKED_CLEANUP_LEASE_MS + 1),
      limit: 1,
    })
    releaseStorage()
    const oldWorkerResult = await oldWorker

    expect(leaseRecovery).toMatchObject({ retried: 1, deleted: 0 })
    expect(oldWorkerResult).toMatchObject({ protected: 1, deleted: 0 })
    expect(store.storage.remove).toHaveBeenCalledOnce()
    expect(await prisma.image.findUniqueOrThrow({ where: { id: fixture.id } })).toMatchObject({
      confirmedCleanupStatus: 'pending',
      confirmedCleanupAttempts: 1,
      confirmedCleanupClaimToken: null,
      confirmedCleanupFailureReason: 'processing_timeout',
    })
  })

  it('dead-letters a tenth expired lease without calling Storage', async () => {
    const fixture = await createImage({
      deletedAt: new Date(NOW.getTime() - 1),
      confirmedCleanupStatus: 'claimed',
      confirmedCleanupAttempts: CONFIRMED_UNLINKED_CLEANUP_MAX_ATTEMPTS - 1,
      confirmedCleanupClaimToken: randomUUID(),
      confirmedCleanupClaimedAt: new Date(NOW.getTime() - CONFIRMED_UNLINKED_CLEANUP_LEASE_MS - 1),
    })
    const store = storageFixture(fixture.keys, async () => true)

    const result = await runConfirmedUnlinkedCleanup(prisma, store.storage, {
      apply: true,
      now: NOW,
      limit: 1,
    })

    expect(result).toMatchObject({
      deadLetter: 1,
      deadLetterTotal: 1,
      failureReasons: { processing_timeout: 1 },
    })
    expect(store.storage.remove).not.toHaveBeenCalled()
    expect(await prisma.image.findUniqueOrThrow({ where: { id: fixture.id } })).toMatchObject({
      confirmedCleanupStatus: 'dead_letter',
      confirmedCleanupAttempts: CONFIRMED_UNLINKED_CLEANUP_MAX_ATTEMPTS,
      confirmedCleanupClaimToken: null,
      confirmedCleanupClaimedAt: null,
      confirmedCleanupFailureReason: 'processing_timeout',
    })
  })

  it('skips a contended head candidate and deletes the next image', async () => {
    const busy = await createImage({
      createdAt: new Date(NOW.getTime() - CONFIRMED_UNLINKED_RETENTION_MS - 2),
    })
    const healthy = await createImage()
    const store = storageFixture([...busy.keys, ...healthy.keys], async () => true)
    let releaseLock!: () => void
    let lockStarted!: () => void
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve
    })
    const started = new Promise<void>((resolve) => {
      lockStarted = resolve
    })
    const blocker = prisma.$transaction(async (transaction) => {
      await lockImageAccess(transaction, [busy.id])
      lockStarted()
      await release
    })
    await started

    try {
      const result = await runConfirmedUnlinkedCleanup(prisma, store.storage, {
        apply: true,
        now: NOW,
        limit: 1,
      })

      expect(result).toMatchObject({ scanned: 2, protected: 1, deleted: 1 })
      expect(await prisma.image.findUnique({ where: { id: busy.id } })).not.toBeNull()
      expect(await prisma.image.findUnique({ where: { id: healthy.id } })).toBeNull()
    } finally {
      releaseLock()
      await blocker
    }
  })

  it('keyset-scans past 50 contended rows even when created-at has microseconds', async () => {
    const baseCreatedAt = new Date(NOW.getTime() - CONFIRMED_UNLINKED_RETENTION_MS - 1_000)
    const rows = Array.from({ length: 51 }, (_, index) => {
      const id = `00000000-0000-4000-8000-${String(500 + index).padStart(12, '0')}`
      const storageKey = `uploads/0123456789abcdef/202608/${id}.jpg`
      return {
        id,
        userId,
        storageKey,
        contentType: 'image/jpeg',
        width: 1,
        height: 1,
        fileSize: 4,
        createdAt: baseCreatedAt,
        confirmedCleanupNextAt: new Date(NOW.getTime() - 1),
      }
    })
    await prisma.image.createMany({ data: rows })
    await prisma.$executeRaw`
      WITH ranked AS (
        SELECT id, row_number() OVER (ORDER BY id) AS position
        FROM images
        WHERE user_id = ${userId}::uuid
      )
      UPDATE images AS image
      SET created_at = ${baseCreatedAt}::timestamptz
        + ranked.position::double precision * INTERVAL '1 microsecond'
      FROM ranked
      WHERE image.id = ranked.id
    `
    const [precision] = await prisma.$queryRaw<Array<{ hasMicroseconds: boolean }>>`
      SELECT bool_or(created_at <> date_trunc('milliseconds', created_at)) AS "hasMicroseconds"
      FROM images
      WHERE user_id = ${userId}::uuid
    `
    expect(precision?.hasMicroseconds).toBe(true)

    const busyIds = rows.slice(0, 50).map((row) => row.id)
    const healthy = rows[50]!
    const store = storageFixture(
      rows.flatMap((row) => keys(row.storageKey)),
      async () => true,
    )
    let releaseLock!: () => void
    let lockStarted!: () => void
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve
    })
    const started = new Promise<void>((resolve) => {
      lockStarted = resolve
    })
    const blocker = prisma.$transaction(
      async (transaction) => {
        await lockImageAccess(transaction, busyIds)
        lockStarted()
        await release
      },
      { timeout: 10_000 },
    )
    await started

    try {
      const result = await runConfirmedUnlinkedCleanup(prisma, store.storage, {
        apply: true,
        now: NOW,
        limit: 1,
      })

      expect(result).toMatchObject({ scanned: 51, protected: 50, deleted: 1 })
      expect(await prisma.image.findUnique({ where: { id: healthy.id } })).toBeNull()
    } finally {
      releaseLock()
      await blocker
    }
  })

  it('dead-letters a poison item while deleting another candidate in the batch', async () => {
    const poison = await createImage({
      confirmedCleanupAttempts: CONFIRMED_UNLINKED_CLEANUP_MAX_ATTEMPTS - 1,
    })
    const healthy = await createImage()
    const store = storageFixture([...poison.keys, ...healthy.keys], async (requested) => {
      return requested[0] !== poison.storageKey
    })

    const result = await runConfirmedUnlinkedCleanup(prisma, store.storage, {
      apply: true,
      now: NOW,
      limit: 2,
    })

    expect(result).toMatchObject({ deleted: 1, deadLetter: 1, deadLetterTotal: 1 })
    expect(await prisma.image.findUnique({ where: { id: healthy.id } })).toBeNull()
    expect(await prisma.image.findUniqueOrThrow({ where: { id: poison.id } })).toMatchObject({
      confirmedCleanupStatus: 'dead_letter',
      confirmedCleanupAttempts: CONFIRMED_UNLINKED_CLEANUP_MAX_ATTEMPTS,
      confirmedCleanupFailureReason: 'storage_unavailable',
    })
    expect(store.objects.has(poison.storageKey)).toBe(true)
  })

  it('rejects unknown failure reasons and incomplete claims at the database boundary', async () => {
    const fixture = await createImage()

    await expect(
      prisma.image.update({
        where: { id: fixture.id },
        data: { confirmedCleanupFailureReason: 'raw_storage_error' },
      }),
    ).rejects.toThrow()
    await expect(
      prisma.image.update({
        where: { id: fixture.id },
        data: {
          confirmedCleanupStatus: 'dead_letter',
          confirmedCleanupFailureReason: 'storage_unavailable',
        },
      }),
    ).rejects.toThrow()
    await expect(
      prisma.image.update({
        where: { id: fixture.id },
        data: { confirmedCleanupAttempts: CONFIRMED_UNLINKED_CLEANUP_MAX_ATTEMPTS },
      }),
    ).rejects.toThrow()
    await expect(
      prisma.image.update({
        where: { id: fixture.id },
        data: { confirmedCleanupStatus: 'claimed' },
      }),
    ).rejects.toThrow()

    expect(await prisma.image.findUniqueOrThrow({ where: { id: fixture.id } })).toMatchObject({
      confirmedCleanupStatus: 'pending',
      confirmedCleanupClaimToken: null,
      confirmedCleanupClaimedAt: null,
      confirmedCleanupFailureReason: null,
    })
  })
})
