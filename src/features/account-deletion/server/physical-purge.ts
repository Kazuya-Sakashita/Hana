import { randomUUID } from 'node:crypto'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseAuthAdminClient } from '@/lib/supabase/auth-admin'
import { prisma } from '@/server/db/prisma'
import { deriveVariantKey } from '@/features/uploads/server/signed-url'
import {
  isValidStorageKey,
  storageKeyBelongsToUser,
  storageKeyPrefixForUser,
} from '@/features/uploads/server/storage-key'

const CLAIM_LEASE_MS = 10 * 60 * 1000
const PROVIDER_TIMEOUT_MS = 30_000
const MAX_ATTEMPTS = 10
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000
const STORAGE_BATCH_SIZE = 100
const IMAGE_BUCKET = 'images'
const STORAGE_OBJECT_KEY_PATTERN =
  /^uploads\/[0-9a-f]{16}\/\d{6}\/[0-9a-f-]{36}(?:\.(?:jpg|png|webp|heic)|_(?:thumb|preview)\.webp)$/

type PurgeFailureStage = 'state' | 'storage' | 'auth' | 'database'
type PurgeStage = 'storage' | 'auth' | 'database'

function nextAttemptDate(attempt: number, now: Date): Date {
  const delay = Math.min(2 ** Math.max(0, attempt - 1) * 5 * 60_000, MAX_BACKOFF_MS)
  return new Date(now.getTime() + delay)
}

function isNotFound(error: { status?: number; statusCode?: string | number } | null): boolean {
  return error?.status === 404 || error?.statusCode === 404 || error?.statusCode === '404'
}

function storageObjectKeys(originalKeys: string[]): string[] {
  return [
    ...new Set(
      originalKeys.flatMap((key) => [
        key,
        deriveVariantKey(key, 'thumbnail'),
        deriveVariantKey(key, 'preview'),
      ]),
    ),
  ]
}

function isOwnedStorageObjectKey(key: string, userId: string): boolean {
  return STORAGE_OBJECT_KEY_PATTERN.test(key) && storageKeyBelongsToUser(key, userId)
}

async function listOwnedStorageObjects(
  userId: string,
  heartbeat: () => Promise<boolean>,
): Promise<{
  keys: string[]
  failed: boolean
}> {
  const prefix = storageKeyPrefixForUser(userId).replace(/\/$/, '')
  const storage = createSupabaseAdminClient({
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  }).storage.from(IMAGE_BUCKET)
  const pendingPaths = [prefix]
  const keys: string[] = []

  while (pendingPaths.length > 0) {
    const path = pendingPaths.shift() as string
    for (let offset = 0; ; offset += 100) {
      if (!(await heartbeat())) return { keys: [], failed: true }
      let result
      try {
        result = await storage.list(path, { limit: 100, offset, sortBy: { column: 'name' } })
      } catch {
        return { keys: [], failed: true }
      }
      if (result.error) {
        if (isNotFound(result.error)) break
        return { keys: [], failed: true }
      }
      const entries = result.data ?? []
      for (const entry of entries) {
        const key = `${path}/${entry.name}`
        if (
          !key.startsWith(`${prefix}/`) ||
          entry.name.includes('/') ||
          entry.name === '..' ||
          entry.name === '.'
        ) {
          return { keys: [], failed: true }
        }
        if (entry.id === null) pendingPaths.push(key)
        else keys.push(key)
      }
      if (entries.length < 100) break
    }
  }

  if (keys.some((key) => !isOwnedStorageObjectKey(key, userId))) {
    return { keys: [], failed: true }
  }
  return { keys, failed: false }
}

async function retainClaim(requestId: string, claimToken: string, now: Date): Promise<boolean> {
  const retained = await prisma.accountDeletionRequest.updateMany({
    where: { id: requestId, purgeStatus: 'pending', purgeClaimToken: claimToken },
    data: { purgeClaimedAt: now },
  })
  return retained.count === 1
}

async function advanceStage(
  requestId: string,
  claimToken: string,
  stage: PurgeStage,
  completedAt: Date,
): Promise<boolean> {
  const advanced = await prisma.accountDeletionRequest.updateMany({
    where: { id: requestId, purgeStatus: 'pending', purgeClaimToken: claimToken },
    data:
      stage === 'auth'
        ? {
            purgeStage: 'auth',
            storageDeletedAt: completedAt,
            purgeClaimedAt: completedAt,
          }
        : {
            purgeStage: 'database',
            authDeletedAt: completedAt,
            purgeClaimedAt: completedAt,
          },
  })
  return advanced.count === 1
}

async function recordFailure(
  requestId: string,
  claimToken: string,
  attempt: number,
  stage: PurgeFailureStage,
  reason:
    | 'invalid_state'
    | 'invalid_storage_ownership'
    | 'provider_unavailable'
    | 'database_unavailable',
  now: Date,
): Promise<void> {
  await prisma.accountDeletionRequest.updateMany({
    where: { id: requestId, purgeClaimToken: claimToken },
    data: {
      purgeStatus: attempt >= MAX_ATTEMPTS || stage === 'state' ? 'failed' : 'pending',
      purgeAttempts: attempt,
      purgeClaimedAt: null,
      purgeClaimToken: null,
      nextPurgeAttemptAt: nextAttemptDate(attempt, now),
      lastPurgeFailureStage: stage,
      lastPurgeFailureReason: reason,
    },
  })
}

export async function inspectAccountPhysicalPurge(now = new Date()): Promise<{
  eligibleAccounts: number
  leasedAccounts: number
  imageRows: number
  dbExpectedObjects: number
  listedStorageObjects: number
  storageListingFailures: number
  failedAccounts: number
}> {
  const staleClaim = new Date(now.getTime() - CLAIM_LEASE_MS)
  const eligible = await prisma.accountDeletionRequest.findMany({
    where: {
      purgeStatus: 'pending',
      purgeAfter: { lte: now },
      nextPurgeAttemptAt: { lte: now },
      purgeAttempts: { lt: MAX_ATTEMPTS },
      OR: [{ purgeClaimedAt: null }, { purgeClaimedAt: { lt: staleClaim } }],
    },
    select: { userId: true },
  })
  const imageRows = eligible.length
    ? await prisma.image.count({ where: { userId: { in: eligible.map((item) => item.userId) } } })
    : 0
  let listedStorageObjects = 0
  let storageListingFailures = 0
  for (const item of eligible) {
    const listed = await listOwnedStorageObjects(item.userId, async () => true)
    if (listed.failed) storageListingFailures += 1
    else listedStorageObjects += listed.keys.length
  }
  const [leasedAccounts, failedAccounts] = await Promise.all([
    prisma.accountDeletionRequest.count({
      where: { purgeStatus: 'pending', purgeClaimedAt: { gte: staleClaim } },
    }),
    prisma.accountDeletionRequest.count({ where: { purgeStatus: 'failed' } }),
  ])
  return {
    eligibleAccounts: eligible.length,
    leasedAccounts,
    imageRows,
    dbExpectedObjects: imageRows * 3,
    listedStorageObjects,
    storageListingFailures,
    failedAccounts,
  }
}

export async function processAccountPhysicalPurges(limit = 10): Promise<{
  claimed: number
  purged: number
  failed: number
}> {
  const startedAt = new Date()
  const staleClaim = new Date(startedAt.getTime() - CLAIM_LEASE_MS)
  const candidates = await prisma.accountDeletionRequest.findMany({
    where: {
      purgeStatus: 'pending',
      purgeAfter: { lte: startedAt },
      nextPurgeAttemptAt: { lte: startedAt },
      purgeAttempts: { lt: MAX_ATTEMPTS },
      OR: [{ purgeClaimedAt: null }, { purgeClaimedAt: { lt: staleClaim } }],
    },
    orderBy: { nextPurgeAttemptAt: 'asc' },
    take: limit,
    select: {
      id: true,
      userId: true,
      purgeAfter: true,
      purgeAttempts: true,
      purgeStage: true,
      storageDeletedAt: true,
      authDeletedAt: true,
    },
  })

  let claimed = 0
  let purged = 0
  let failed = 0

  for (const candidate of candidates) {
    const claimToken = randomUUID()
    const claim = await prisma.accountDeletionRequest.updateMany({
      where: {
        id: candidate.id,
        purgeStatus: 'pending',
        purgeAfter: { lte: startedAt },
        nextPurgeAttemptAt: { lte: startedAt },
        purgeAttempts: candidate.purgeAttempts,
        OR: [{ purgeClaimedAt: null }, { purgeClaimedAt: { lt: staleClaim } }],
      },
      data: { purgeClaimedAt: startedAt, purgeClaimToken: claimToken },
    })
    if (claim.count !== 1) continue
    claimed += 1
    const attempt = candidate.purgeAttempts + 1

    const profile = await prisma.profile.findUnique({
      where: { id: candidate.userId },
      select: { accessBlockedAt: true, deletionRequestedAt: true, purgeAfter: true },
    })
    const validExistingProfile = Boolean(
      profile?.accessBlockedAt &&
      profile.deletionRequestedAt &&
      profile.purgeAfter &&
      profile.purgeAfter <= startedAt &&
      candidate.purgeAfter <= startedAt,
    )
    const validMissingProfile = !profile && candidate.purgeAfter <= startedAt
    const validStageMarkers =
      candidate.purgeStage === 'storage' ||
      (candidate.purgeStage === 'auth' && candidate.storageDeletedAt !== null) ||
      (candidate.purgeStage === 'database' &&
        candidate.storageDeletedAt !== null &&
        candidate.authDeletedAt !== null)
    if ((!validExistingProfile && !validMissingProfile) || !validStageMarkers) {
      await recordFailure(candidate.id, claimToken, attempt, 'state', 'invalid_state', startedAt)
      failed += 1
      continue
    }

    let stage = candidate.purgeStage as PurgeStage
    if (stage === 'storage') {
      const images = await prisma.image.findMany({
        where: { userId: candidate.userId },
        select: { storageKey: true },
      })
      const originalKeys = images.map((image) => image.storageKey)
      if (
        originalKeys.some(
          (key) => !isValidStorageKey(key) || !storageKeyBelongsToUser(key, candidate.userId),
        )
      ) {
        await recordFailure(
          candidate.id,
          claimToken,
          attempt,
          'state',
          'invalid_storage_ownership',
          startedAt,
        )
        failed += 1
        continue
      }
      const listed = await listOwnedStorageObjects(candidate.userId, () =>
        retainClaim(candidate.id, claimToken, new Date()),
      )
      if (listed.failed) {
        await recordFailure(
          candidate.id,
          claimToken,
          attempt,
          'storage',
          'provider_unavailable',
          new Date(),
        )
        if (attempt >= MAX_ATTEMPTS) failed += 1
        continue
      }
      const objectKeys = [...new Set([...storageObjectKeys(originalKeys), ...listed.keys])]
      let storageFailed = false
      for (let index = 0; index < objectKeys.length; index += STORAGE_BATCH_SIZE) {
        const heartbeatAt = new Date()
        if (!(await retainClaim(candidate.id, claimToken, heartbeatAt))) {
          storageFailed = true
          break
        }
        try {
          const storage = createSupabaseAdminClient({
            signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
          }).storage.from(IMAGE_BUCKET)
          const result = await storage.remove(objectKeys.slice(index, index + STORAGE_BATCH_SIZE))
          if (result.error && !isNotFound(result.error)) storageFailed = true
        } catch {
          storageFailed = true
        }
        if (storageFailed) break
      }
      if (!storageFailed) {
        const verification = await listOwnedStorageObjects(candidate.userId, () =>
          retainClaim(candidate.id, claimToken, new Date()),
        )
        storageFailed = verification.failed || verification.keys.length > 0
      }
      if (storageFailed) {
        await recordFailure(
          candidate.id,
          claimToken,
          attempt,
          'storage',
          'provider_unavailable',
          new Date(),
        )
        if (attempt >= MAX_ATTEMPTS) failed += 1
        continue
      }
      const advancedAt = new Date()
      if (!(await advanceStage(candidate.id, claimToken, 'auth', advancedAt))) continue
      stage = 'auth'
    }

    if (stage === 'auth') {
      if (!(await retainClaim(candidate.id, claimToken, new Date()))) continue
      try {
        await prisma.aiGeneration.updateMany({
          where: { userId: candidate.userId },
          data: { userId: null, childId: null, anonymizedAt: new Date() },
        })
      } catch {
        await recordFailure(
          candidate.id,
          claimToken,
          attempt,
          'database',
          'database_unavailable',
          new Date(),
        )
        if (attempt >= MAX_ATTEMPTS) failed += 1
        continue
      }
      if (!(await retainClaim(candidate.id, claimToken, new Date()))) continue
      let authDeleted = false
      try {
        const authAdmin = createSupabaseAuthAdminClient({
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        })
        const result = await authAdmin.auth.admin.deleteUser(candidate.userId, false)
        authDeleted = !result.error || isNotFound(result.error)
      } catch {
        authDeleted = false
      }
      if (!authDeleted) {
        await recordFailure(
          candidate.id,
          claimToken,
          attempt,
          'auth',
          'provider_unavailable',
          new Date(),
        )
        if (attempt >= MAX_ATTEMPTS) failed += 1
        continue
      }
      const advancedAt = new Date()
      if (!(await advanceStage(candidate.id, claimToken, 'database', advancedAt))) continue
      stage = 'database'
    }

    if (stage === 'database') {
      if (!(await retainClaim(candidate.id, claimToken, new Date()))) continue
      try {
        await prisma.$transaction(async (transaction) => {
          const owned = await transaction.accountDeletionRequest.findFirst({
            where: {
              id: candidate.id,
              userId: candidate.userId,
              purgeStatus: 'pending',
              purgeStage: 'database',
              purgeClaimToken: claimToken,
              purgeAfter: { lte: startedAt },
            },
            select: { id: true },
          })
          if (!owned) throw new Error('purge_claim_lost')
          await transaction.profile.deleteMany({ where: { id: candidate.userId } })
          await transaction.accountDeletionRequest.delete({ where: { id: candidate.id } })
        })
        purged += 1
      } catch {
        await recordFailure(
          candidate.id,
          claimToken,
          attempt,
          'database',
          'database_unavailable',
          new Date(),
        )
        if (attempt >= MAX_ATTEMPTS) failed += 1
      }
    }
  }

  return { claimed, purged, failed }
}
