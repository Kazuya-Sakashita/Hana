import { randomUUID } from 'node:crypto'
import type { Prisma, UploadReservation } from '@prisma/client'
import { deriveVariantKey } from '@/features/uploads/server/signed-url'
import { isValidStorageKey, storageKeyBelongsToUser } from '@/features/uploads/server/storage-key'
import { acquireUploadStorageLock } from '@/features/uploads/server/upload-storage-lock'
import {
  CLEANUP_CLAIM_LEASE_MS,
  CLEANUP_MAX_ATTEMPTS,
  UNCONFIRMED_UPLOAD_RETENTION_MS,
} from '@/features/uploads/server/upload-reservation-policy'

export type ObjectTimestamp = Date | 'missing' | 'invalid'

export interface CleanupStorage {
  timestamp(key: string): Promise<ObjectTimestamp>
  remove(keys: string[]): Promise<boolean>
}

export interface CleanupDatabase {
  uploadReservation: {
    findMany(args: unknown): Promise<UploadReservation[]>
  }
  image: {
    findUnique(args: unknown): Promise<{ id: string } | null>
    findFirst(args: unknown): Promise<{ id: string } | null>
  }
  profile: {
    findFirst(args: unknown): Promise<{ id: string } | null>
  }
  $transaction<T>(
    callback: (transaction: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>
}

export interface UnconfirmedUploadCleanupResult {
  mode: 'dry-run' | 'apply'
  scanned: number
  eligible: number
  protected: number
  skippedRecent: number
  invalid: number
  deleted: number
  retried: number
  failed: number
}

function originalKeysFor(reservation: UploadReservation): string[] {
  if (reservation.candidateKind !== 'variant_only') return [reservation.storageKey]
  const base = reservation.storageKey.slice(0, reservation.storageKey.lastIndexOf('.'))
  return ['jpg', 'png', 'webp', 'heic'].map((extension) => `${base}.${extension}`)
}

function keysFor(reservation: UploadReservation): string[] {
  const originals = originalKeysFor(reservation)
  return [
    ...originals,
    deriveVariantKey(reservation.storageKey, 'thumbnail'),
    deriveVariantKey(reservation.storageKey, 'preview'),
  ]
}

function retryAt(now: Date, attempts: number): Date {
  const minutes = Math.min(24 * 60, 2 ** Math.min(attempts, 10))
  return new Date(now.getTime() + minutes * 60_000)
}

async function inspectStorage(
  storage: CleanupStorage,
  keys: string[],
  cutoff: Date,
  now: Date,
): Promise<'eligible' | 'missing' | 'recent' | 'invalid'> {
  const timestamps = await Promise.all(keys.map((key) => storage.timestamp(key)))
  if (timestamps.some((value) => value === 'invalid')) return 'invalid'
  const present = timestamps.filter((value): value is Date => value instanceof Date)
  if (present.length === 0) return 'missing'
  if (present.some((value) => value.getTime() > now.getTime())) return 'invalid'
  return present.some((value) => value.getTime() > cutoff.getTime()) ? 'recent' : 'eligible'
}

async function markRetry(
  transaction: Prisma.TransactionClient,
  reservation: UploadReservation,
  claimToken: string,
  now: Date,
  reason: 'storage_unavailable' | 'object_still_present' | 'invalid_metadata',
): Promise<'retried' | 'failed'> {
  const attempts = reservation.attempts + 1
  const failed = attempts >= CLEANUP_MAX_ATTEMPTS
  await transaction.uploadReservation.updateMany({
    where: { id: reservation.id, claimToken },
    data: {
      status: failed ? 'failed' : 'pending',
      attempts,
      nextAttemptAt: retryAt(now, attempts),
      claimToken: null,
      claimedAt: null,
      failureReason: reason,
    },
  })
  return failed ? 'failed' : 'retried'
}

async function lockActiveProfile(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<boolean> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM profiles
    WHERE id = ${userId}::uuid
      AND access_blocked_at IS NULL
      AND deletion_requested_at IS NULL
    FOR UPDATE
  `
  return rows.length === 1
}

export async function runUnconfirmedUploadCleanup(
  database: CleanupDatabase,
  storage: CleanupStorage,
  options: { apply: boolean; now?: Date; limit?: number },
): Promise<UnconfirmedUploadCleanupResult> {
  const now = options.now ?? new Date()
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const staleClaimBefore = new Date(now.getTime() - CLEANUP_CLAIM_LEASE_MS)
  const objectCutoff = new Date(now.getTime() - UNCONFIRMED_UPLOAD_RETENTION_MS)
  const reservations = await database.uploadReservation.findMany({
    where: {
      cleanupAfter: { lte: now },
      nextAttemptAt: { lte: now },
      OR: [{ status: 'pending' }, { status: 'claimed', claimedAt: { lte: staleClaimBefore } }],
    },
    orderBy: [{ cleanupAfter: 'asc' }, { id: 'asc' }],
    take: limit,
  })
  const result: UnconfirmedUploadCleanupResult = {
    mode: options.apply ? 'apply' : 'dry-run',
    scanned: reservations.length,
    eligible: 0,
    protected: 0,
    skippedRecent: 0,
    invalid: 0,
    deleted: 0,
    retried: 0,
    failed: 0,
  }

  for (const reservation of reservations) {
    const keys = keysFor(reservation)
    const originalKeys = originalKeysFor(reservation)
    if (
      !isValidStorageKey(reservation.storageKey) ||
      !storageKeyBelongsToUser(reservation.storageKey, reservation.userId)
    ) {
      result.invalid += 1
      if (options.apply) {
        await database.$transaction(async (transaction) => {
          await transaction.uploadReservation.updateMany({
            where: { id: reservation.id, status: { in: ['pending', 'claimed'] } },
            data: {
              status: 'failed',
              attempts: CLEANUP_MAX_ATTEMPTS,
              claimToken: null,
              claimedAt: null,
              failureReason: 'invalid_reservation',
            },
          })
        })
      }
      continue
    }

    if (!options.apply) {
      if (
        !(await database.profile.findFirst({
          where: {
            id: reservation.userId,
            accessBlockedAt: null,
            deletionRequestedAt: null,
          },
          select: { id: true },
        }))
      ) {
        result.protected += 1
        continue
      }
      if (await database.image.findFirst({ where: { storageKey: { in: originalKeys } } })) {
        result.protected += 1
        continue
      }
      const state = await inspectStorage(storage, keys, objectCutoff, now)
      if (state === 'eligible' || state === 'missing') result.eligible += 1
      else if (state === 'recent') result.skippedRecent += 1
      else result.invalid += 1
      continue
    }

    const outcome = await database.$transaction(
      async (transaction) => {
        for (const originalKey of originalKeys) {
          await acquireUploadStorageLock(transaction, originalKey)
        }
        const current = await transaction.uploadReservation.findUnique({
          where: { id: reservation.id },
        })
        if (
          !current ||
          current.cleanupAfter > now ||
          current.nextAttemptAt > now ||
          (current.status !== 'pending' &&
            !(
              current.status === 'claimed' &&
              current.claimedAt &&
              current.claimedAt <= staleClaimBefore
            ))
        ) {
          return 'protected' as const
        }
        if (!(await lockActiveProfile(transaction, current.userId))) {
          await transaction.uploadReservation.delete({ where: { id: current.id } })
          return 'protected' as const
        }
        const image = await transaction.image.findFirst({
          where: { storageKey: { in: originalKeys } },
          select: { id: true },
        })
        if (image) {
          await transaction.uploadReservation.delete({ where: { id: current.id } })
          return 'protected' as const
        }

        const claimToken = randomUUID()
        await transaction.uploadReservation.update({
          where: { id: current.id },
          data: { status: 'claimed', claimToken, claimedAt: now, failureReason: null },
        })
        let state: Awaited<ReturnType<typeof inspectStorage>>
        try {
          state = await inspectStorage(storage, keys, objectCutoff, now)
        } catch {
          return markRetry(transaction, current, claimToken, now, 'storage_unavailable')
        }
        if (state === 'invalid') {
          return markRetry(transaction, current, claimToken, now, 'invalid_metadata')
        }
        if (state === 'recent') {
          await transaction.uploadReservation.updateMany({
            where: { id: current.id, claimToken },
            data: {
              status: 'pending',
              nextAttemptAt: retryAt(now, 1),
              claimToken: null,
              claimedAt: null,
              failureReason: null,
            },
          })
          return 'recent' as const
        }
        if (state === 'eligible') {
          let removed = false
          try {
            removed = await storage.remove(keys)
          } catch {
            removed = false
          }
          if (!removed) {
            return markRetry(transaction, current, claimToken, now, 'storage_unavailable')
          }
          let after: Awaited<ReturnType<typeof inspectStorage>>
          try {
            after = await inspectStorage(storage, keys, objectCutoff, now)
          } catch {
            return markRetry(transaction, current, claimToken, now, 'storage_unavailable')
          }
          if (after !== 'missing') {
            return markRetry(transaction, current, claimToken, now, 'object_still_present')
          }
        }
        await transaction.uploadReservation.deleteMany({
          where: { id: current.id, claimToken },
        })
        return 'deleted' as const
      },
      { maxWait: 5_000, timeout: 30_000 },
    )
    result.eligible += outcome === 'recent' || outcome === 'protected' ? 0 : 1
    if (outcome === 'protected') result.protected += 1
    else if (outcome === 'recent') result.skippedRecent += 1
    else if (outcome === 'deleted') result.deleted += 1
    else if (outcome === 'retried') result.retried += 1
    else result.failed += 1
  }
  return result
}
