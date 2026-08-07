import { randomUUID } from 'node:crypto'
import { Prisma, type Image, type PrismaClient } from '@prisma/client'
import { lockImageAccess, tryLockImageAccess } from '@/features/uploads/server/image-access-lock'
import { deriveVariantKey } from '@/features/uploads/server/signed-url'
import { acquireUploadStorageLock } from '@/features/uploads/server/upload-storage-lock'
import { isValidStorageKey, storageKeyBelongsToUser } from '@/features/uploads/server/storage-key'

export const CONFIRMED_UNLINKED_RETENTION_MS = 48 * 60 * 60 * 1000
export const CONFIRMED_UNLINKED_CLEANUP_LEASE_MS = 10 * 60 * 1000
export const CONFIRMED_UNLINKED_CLEANUP_MAX_ATTEMPTS = 10
export const CONFIRMED_UNLINKED_CLEANUP_ROUTE_BUDGET_MS = 25_000
export const CONFIRMED_UNLINKED_CLEANUP_MINIMUM_ITEM_BUDGET_MS = 22_000

const CONFIRMED_UNLINKED_CLEANUP_SCAN_LIMIT = 50
const CONFIRMED_UNLINKED_CLEANUP_TRANSACTION_MAX_WAIT_MS = 1_000
const CONFIRMED_UNLINKED_CLEANUP_TRANSACTION_TIMEOUT_MS = 3_000

export type ConfirmedUnlinkedCleanupFailureReason =
  | 'storage_unavailable'
  | 'finalize_failed'
  | 'processing_timeout'
  | 'invalid_storage_key'

type ConfirmedUnlinkedCleanupMetricReason =
  | ConfirmedUnlinkedCleanupFailureReason
  | 'claim_failed'
  | 'retry_state_unavailable'

export interface ConfirmedUnlinkedCleanupStorage {
  remove(keys: string[]): Promise<boolean>
}

export interface ConfirmedUnlinkedCleanupResult {
  mode: 'dry-run' | 'apply'
  eligibleTotal: number
  deadLetterTotal: number
  scanned: number
  deleted: number
  protected: number
  retried: number
  deadLetter: number
  failed: number
  pending: number
  failureReasons: Record<ConfirmedUnlinkedCleanupMetricReason, number>
}

type ClaimImageResult =
  | { kind: 'claimed'; image: Image; token: string }
  | { kind: 'busy' }
  | { kind: 'retried' | 'dead_letter' }

function storageKeys(storageKey: string): string[] {
  return [
    storageKey,
    deriveVariantKey(storageKey, 'thumbnail'),
    deriveVariantKey(storageKey, 'preview'),
  ]
}

function retryAt(now: Date, attempts: number): Date {
  const minutes = Math.min(24 * 60, 2 ** Math.min(attempts, 10))
  return new Date(now.getTime() + minutes * 60_000)
}

function transactionFailureReason(error: unknown): ConfirmedUnlinkedCleanupFailureReason {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028'
    ? 'processing_timeout'
    : 'finalize_failed'
}

function failureReasonCounts(): Record<ConfirmedUnlinkedCleanupMetricReason, number> {
  return {
    storage_unavailable: 0,
    finalize_failed: 0,
    processing_timeout: 0,
    invalid_storage_key: 0,
    claim_failed: 0,
    retry_state_unavailable: 0,
  }
}

function retentionWhere(cutoff: Date): Prisma.ImageWhereInput {
  return {
    memoryId: null,
    user: { accessBlockedAt: null, deletionRequestedAt: null },
    OR: [{ deletedAt: { not: null } }, { deletedAt: null, createdAt: { lte: cutoff } }],
  }
}

function dueWhere(now: Date, cutoff: Date, staleClaimBefore: Date): Prisma.ImageWhereInput {
  return {
    ...retentionWhere(cutoff),
    confirmedCleanupNextAt: { lte: now },
    AND: [
      {
        OR: [
          { confirmedCleanupStatus: 'pending' },
          {
            confirmedCleanupStatus: 'claimed',
            confirmedCleanupClaimedAt: { lte: staleClaimBefore },
          },
        ],
      },
    ],
  }
}

function queueWhere(cutoff: Date): Prisma.ImageWhereInput {
  return {
    ...retentionWhere(cutoff),
    confirmedCleanupStatus: { in: ['pending', 'claimed'] },
  }
}

function afterCandidate(candidate: Image): Prisma.ImageWhereInput {
  return {
    OR: [
      { confirmedCleanupNextAt: { gt: candidate.confirmedCleanupNextAt } },
      {
        confirmedCleanupNextAt: candidate.confirmedCleanupNextAt,
        id: { gt: candidate.id },
      },
    ],
  }
}

function candidatePage(
  prisma: PrismaClient,
  candidateWhere: Prisma.ImageWhereInput,
  cursor?: Image,
): Promise<Image[]> {
  return prisma.image.findMany({
    where: cursor ? { AND: [candidateWhere, afterCandidate(cursor)] } : candidateWhere,
    orderBy: [{ confirmedCleanupNextAt: 'asc' }, { id: 'asc' }],
    take: CONFIRMED_UNLINKED_CLEANUP_SCAN_LIMIT,
  })
}

function isDueForClaim(image: Image, now: Date, cutoff: Date, staleClaimBefore: Date): boolean {
  return (
    image.memoryId === null &&
    (image.deletedAt !== null || image.createdAt <= cutoff) &&
    image.confirmedCleanupNextAt <= now &&
    (image.confirmedCleanupStatus === 'pending' ||
      (image.confirmedCleanupStatus === 'claimed' &&
        image.confirmedCleanupClaimedAt !== null &&
        image.confirmedCleanupClaimedAt <= staleClaimBefore))
  )
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

async function claimImage(
  prisma: PrismaClient,
  imageId: string,
  now: Date,
  cutoff: Date,
  staleClaimBefore: Date,
): Promise<ClaimImageResult | null> {
  return prisma.$transaction(
    async (transaction) => {
      const candidate = await transaction.image.findUnique({
        where: { id: imageId },
        select: { storageKey: true },
      })
      if (!candidate) return null
      await acquireUploadStorageLock(transaction, candidate.storageKey)
      if (!(await tryLockImageAccess(transaction, imageId))) return { kind: 'busy' }
      const image = await transaction.image.findUnique({ where: { id: imageId } })
      if (!image || !isDueForClaim(image, now, cutoff, staleClaimBefore)) return null
      if (!(await lockActiveProfile(transaction, image.userId))) return null

      if (image.confirmedCleanupStatus === 'claimed') {
        const attempts = image.confirmedCleanupAttempts + 1
        const deadLetter = attempts >= CONFIRMED_UNLINKED_CLEANUP_MAX_ATTEMPTS
        await transaction.image.update({
          where: { id: image.id },
          data: {
            confirmedCleanupStatus: deadLetter ? 'dead_letter' : 'pending',
            confirmedCleanupAttempts: attempts,
            confirmedCleanupNextAt: retryAt(now, attempts),
            confirmedCleanupClaimToken: null,
            confirmedCleanupClaimedAt: null,
            confirmedCleanupFailureReason: 'processing_timeout',
          },
        })
        return { kind: deadLetter ? 'dead_letter' : 'retried' }
      }

      const token = randomUUID()
      const deletedAt = image.deletedAt ?? now
      await transaction.image.update({
        where: { id: image.id },
        data: {
          deletedAt,
          confirmedCleanupStatus: 'claimed',
          confirmedCleanupClaimToken: token,
          confirmedCleanupClaimedAt: now,
          confirmedCleanupFailureReason: null,
        },
      })
      return { kind: 'claimed', image: { ...image, deletedAt }, token }
    },
    {
      maxWait: CONFIRMED_UNLINKED_CLEANUP_TRANSACTION_MAX_WAIT_MS,
      timeout: CONFIRMED_UNLINKED_CLEANUP_TRANSACTION_TIMEOUT_MS,
    },
  )
}

async function finalizeClaim(
  prisma: PrismaClient,
  imageId: string,
  token: string,
): Promise<'deleted' | 'protected'> {
  return prisma.$transaction(
    async (transaction) => {
      await lockImageAccess(transaction, [imageId])
      const image = await transaction.image.findUnique({ where: { id: imageId } })
      if (
        !image ||
        image.memoryId !== null ||
        image.deletedAt === null ||
        image.confirmedCleanupStatus !== 'claimed' ||
        image.confirmedCleanupClaimToken !== token
      ) {
        return 'protected'
      }
      const deleted = await transaction.image.deleteMany({
        where: {
          id: image.id,
          memoryId: null,
          deletedAt: { not: null },
          confirmedCleanupStatus: 'claimed',
          confirmedCleanupClaimToken: token,
        },
      })
      return deleted.count === 1 ? 'deleted' : 'protected'
    },
    {
      maxWait: CONFIRMED_UNLINKED_CLEANUP_TRANSACTION_MAX_WAIT_MS,
      timeout: CONFIRMED_UNLINKED_CLEANUP_TRANSACTION_TIMEOUT_MS,
    },
  )
}

async function recordFailure(
  prisma: PrismaClient,
  imageId: string,
  token: string,
  now: Date,
  reason: ConfirmedUnlinkedCleanupFailureReason,
): Promise<'retried' | 'dead_letter' | 'protected'> {
  return prisma.$transaction(
    async (transaction) => {
      await lockImageAccess(transaction, [imageId])
      const image = await transaction.image.findUnique({ where: { id: imageId } })
      if (
        !image ||
        image.memoryId !== null ||
        image.deletedAt === null ||
        image.confirmedCleanupStatus !== 'claimed' ||
        image.confirmedCleanupClaimToken !== token
      ) {
        return 'protected'
      }

      const attempts = image.confirmedCleanupAttempts + 1
      const deadLetter = attempts >= CONFIRMED_UNLINKED_CLEANUP_MAX_ATTEMPTS
      const updated = await transaction.image.updateMany({
        where: {
          id: image.id,
          memoryId: null,
          deletedAt: { not: null },
          confirmedCleanupStatus: 'claimed',
          confirmedCleanupClaimToken: token,
        },
        data: {
          confirmedCleanupStatus: deadLetter ? 'dead_letter' : 'pending',
          confirmedCleanupAttempts: attempts,
          confirmedCleanupNextAt: retryAt(now, attempts),
          confirmedCleanupClaimToken: null,
          confirmedCleanupClaimedAt: null,
          confirmedCleanupFailureReason: reason,
        },
      })
      if (updated.count !== 1) return 'protected'
      return deadLetter ? 'dead_letter' : 'retried'
    },
    {
      maxWait: CONFIRMED_UNLINKED_CLEANUP_TRANSACTION_MAX_WAIT_MS,
      timeout: CONFIRMED_UNLINKED_CLEANUP_TRANSACTION_TIMEOUT_MS,
    },
  )
}

async function recordInvalidStorageKey(
  prisma: PrismaClient,
  imageId: string,
  token: string,
): Promise<'dead_letter' | 'protected'> {
  return prisma.$transaction(
    async (transaction) => {
      await lockImageAccess(transaction, [imageId])
      const updated = await transaction.image.updateMany({
        where: {
          id: imageId,
          memoryId: null,
          deletedAt: { not: null },
          confirmedCleanupStatus: 'claimed',
          confirmedCleanupClaimToken: token,
        },
        data: {
          confirmedCleanupStatus: 'dead_letter',
          confirmedCleanupAttempts: CONFIRMED_UNLINKED_CLEANUP_MAX_ATTEMPTS,
          confirmedCleanupClaimToken: null,
          confirmedCleanupClaimedAt: null,
          confirmedCleanupFailureReason: 'invalid_storage_key',
        },
      })
      return updated.count === 1 ? 'dead_letter' : 'protected'
    },
    {
      maxWait: CONFIRMED_UNLINKED_CLEANUP_TRANSACTION_MAX_WAIT_MS,
      timeout: CONFIRMED_UNLINKED_CLEANUP_TRANSACTION_TIMEOUT_MS,
    },
  )
}

function recordOutcome(
  result: ConfirmedUnlinkedCleanupResult,
  outcome: 'deleted' | 'protected' | 'retried' | 'dead_letter',
): void {
  if (outcome === 'deleted') result.deleted += 1
  else if (outcome === 'protected') result.protected += 1
  else if (outcome === 'retried') result.retried += 1
  else result.deadLetter += 1
}

export async function runConfirmedUnlinkedCleanup(
  prisma: PrismaClient,
  storage: ConfirmedUnlinkedCleanupStorage,
  options: {
    apply: boolean
    now?: Date
    limit?: number
    deadlineAt?: number
    minimumItemBudgetMs?: number
  },
): Promise<ConfirmedUnlinkedCleanupResult> {
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - CONFIRMED_UNLINKED_RETENTION_MS)
  const staleClaimBefore = new Date(now.getTime() - CONFIRMED_UNLINKED_CLEANUP_LEASE_MS)
  const candidateWhere = dueWhere(now, cutoff, staleClaimBefore)
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50)
  const [eligibleTotal, deadLetterTotal, candidates] = await Promise.all([
    prisma.image.count({ where: candidateWhere }),
    prisma.image.count({
      where: { memoryId: null, confirmedCleanupStatus: 'dead_letter' },
    }),
    options.apply
      ? candidatePage(prisma, candidateWhere)
      : prisma.image.findMany({
          where: candidateWhere,
          orderBy: [{ confirmedCleanupNextAt: 'asc' }, { id: 'asc' }],
          take: limit,
        }),
  ])
  const result: ConfirmedUnlinkedCleanupResult = {
    mode: options.apply ? 'apply' : 'dry-run',
    eligibleTotal,
    deadLetterTotal,
    scanned: options.apply ? 0 : candidates.length,
    deleted: 0,
    protected: 0,
    retried: 0,
    deadLetter: 0,
    failed: 0,
    pending: await prisma.image.count({ where: queueWhere(cutoff) }),
    failureReasons: failureReasonCounts(),
  }
  if (!options.apply) return result

  let processed = 0
  let page = candidates
  scan: while (page.length > 0 && processed < limit) {
    for (const candidate of page) {
      if (processed >= limit) break scan
      if (
        options.deadlineAt !== undefined &&
        Date.now() + Math.max(options.minimumItemBudgetMs ?? 0, 0) > options.deadlineAt
      ) {
        break scan
      }
      result.scanned += 1

      let claim: Awaited<ReturnType<typeof claimImage>>
      try {
        claim = await claimImage(prisma, candidate.id, now, cutoff, staleClaimBefore)
      } catch {
        result.failed += 1
        result.failureReasons.claim_failed += 1
        continue
      }
      if (!claim) {
        result.protected += 1
        continue
      }
      if (claim.kind === 'busy') {
        result.protected += 1
        continue
      }
      processed += 1
      if (claim.kind !== 'claimed') {
        result.failureReasons.processing_timeout += 1
        recordOutcome(result, claim.kind)
        continue
      }

      if (
        !isValidStorageKey(claim.image.storageKey) ||
        !storageKeyBelongsToUser(claim.image.storageKey, claim.image.userId)
      ) {
        result.failureReasons.invalid_storage_key += 1
        try {
          recordOutcome(result, await recordInvalidStorageKey(prisma, claim.image.id, claim.token))
        } catch {
          result.failed += 1
          result.failureReasons.retry_state_unavailable += 1
        }
        continue
      }

      let removed = false
      try {
        removed = await storage.remove(storageKeys(claim.image.storageKey))
      } catch {
        removed = false
      }
      if (!removed) {
        result.failureReasons.storage_unavailable += 1
        try {
          recordOutcome(
            result,
            await recordFailure(prisma, claim.image.id, claim.token, now, 'storage_unavailable'),
          )
        } catch {
          result.failed += 1
          result.failureReasons.retry_state_unavailable += 1
        }
        continue
      }

      try {
        recordOutcome(result, await finalizeClaim(prisma, claim.image.id, claim.token))
      } catch (error) {
        const reason = transactionFailureReason(error)
        result.failureReasons[reason] += 1
        try {
          recordOutcome(
            result,
            await recordFailure(prisma, claim.image.id, claim.token, now, reason),
          )
        } catch {
          result.failed += 1
          result.failureReasons.retry_state_unavailable += 1
        }
      }
    }

    if (page.length < CONFIRMED_UNLINKED_CLEANUP_SCAN_LIMIT) break
    page = await candidatePage(prisma, candidateWhere, page[page.length - 1])
  }
  result.pending = await prisma.image.count({ where: queueWhere(cutoff) })
  result.deadLetterTotal = await prisma.image.count({
    where: { memoryId: null, confirmedCleanupStatus: 'dead_letter' },
  })
  return result
}
