import { randomUUID } from 'node:crypto'
import { Prisma, type Image, type PrismaClient } from '@prisma/client'
import { deriveVariantKey } from '@/features/uploads/server/signed-url'
import { lockImageAccess } from '@/features/uploads/server/image-access-lock'
import { acquireUploadStorageLock } from '@/features/uploads/server/upload-storage-lock'
import type { VariantGenerationResult } from '@/features/uploads/server/variant-generation'

export const VARIANT_REPAIR_MAX_ATTEMPTS = 10
const CLAIM_LEASE_MS = 10 * 60 * 1000
const COMPLETE_VERIFICATION_INTERVAL_MS = 24 * 60 * 60 * 1000

interface ObservedVariantState {
  original?: 'ready' | 'missing' | 'invalid'
  thumbnail?: 'ready' | 'missing'
  preview?: 'ready' | 'missing'
}

export type VariantRepairFailureReason =
  | 'storage_unavailable'
  | 'original_missing'
  | 'original_invalid'
  | 'variant_generation_failed'
  | 'variant_verification_failed'
  | 'processing_timeout'

export class VariantRepairError extends Error {
  constructor(readonly reason: VariantRepairFailureReason) {
    super(reason)
  }
}

export interface ImageVariantRepairStorage {
  exists(key: string): Promise<boolean>
  loadOriginal(image: Image): Promise<Buffer>
  generate(
    storageKey: string,
    original: Buffer,
    requested: { thumbnail: boolean; preview: boolean },
  ): Promise<VariantGenerationResult>
}

export interface ImageVariantRepairResult {
  mode: 'dry-run' | 'apply'
  eligibleTotal: number
  deadLetterTotal: number
  scanned: number
  repaired: number
  alreadyReady: number
  protected: number
  retried: number
  deadLetter: number
  failed: number
}

function retryAt(now: Date, attempts: number): Date {
  const minutes = Math.min(24 * 60, 2 ** Math.min(attempts, 10))
  return new Date(now.getTime() + minutes * 60_000)
}

function failureReason(error: unknown): VariantRepairFailureReason {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028') {
    return 'processing_timeout'
  }
  return error instanceof VariantRepairError ? error.reason : 'storage_unavailable'
}

function isDueForClaim(image: Image, now: Date, staleClaimBefore: Date): boolean {
  return (
    !image.deletedAt &&
    image.metadataSanitizedAt !== null &&
    image.variantRepairNextAt <= now &&
    (image.variantRepairStatus === 'pending' ||
      image.variantRepairStatus === 'complete' ||
      (image.variantRepairStatus === 'claimed' &&
        image.variantRepairClaimedAt !== null &&
        image.variantRepairClaimedAt <= staleClaimBefore))
  )
}

async function claimImage(
  prisma: PrismaClient,
  imageId: string,
  now: Date,
  staleClaimBefore: Date,
): Promise<{ image: Image; token: string } | null> {
  return prisma.$transaction(
    async (transaction) => {
      await lockImageAccess(transaction, [imageId])
      const image = await transaction.image.findUnique({ where: { id: imageId } })
      if (!image || !isDueForClaim(image, now, staleClaimBefore)) return null

      const token = randomUUID()
      await transaction.image.update({
        where: { id: image.id },
        data: {
          variantRepairStatus: 'claimed',
          variantRepairClaimToken: token,
          variantRepairClaimedAt: now,
          variantRepairFailureReason: null,
        },
      })
      return { image, token }
    },
    { maxWait: 3_000, timeout: 5_000 },
  )
}

async function recordFailure(
  prisma: PrismaClient,
  imageId: string,
  token: string,
  now: Date,
  reason: VariantRepairFailureReason,
  observed: ObservedVariantState,
): Promise<'retried' | 'dead_letter' | 'protected'> {
  return prisma.$transaction(
    async (transaction) => {
      await lockImageAccess(transaction, [imageId])
      const image = await transaction.image.findUnique({ where: { id: imageId } })
      if (
        !image ||
        image.deletedAt ||
        image.variantRepairStatus !== 'claimed' ||
        image.variantRepairClaimToken !== token
      ) {
        return 'protected'
      }

      const attempts = image.variantRepairAttempts + 1
      const deadLetter = attempts >= VARIANT_REPAIR_MAX_ATTEMPTS
      await transaction.image.updateMany({
        where: { id: image.id, variantRepairClaimToken: token, deletedAt: null },
        data: {
          ...(observed.original ? { originalVariantStatus: observed.original } : {}),
          ...(observed.thumbnail ? { thumbnailVariantStatus: observed.thumbnail } : {}),
          ...(observed.preview ? { previewVariantStatus: observed.preview } : {}),
          variantRepairStatus: deadLetter ? 'dead_letter' : 'pending',
          variantRepairAttempts: attempts,
          variantRepairNextAt: retryAt(now, attempts),
          variantRepairClaimToken: null,
          variantRepairClaimedAt: null,
          variantRepairFailureReason: reason,
        },
      })
      return deadLetter ? 'dead_letter' : 'retried'
    },
    { maxWait: 3_000, timeout: 5_000 },
  )
}

async function repairClaimedImage(
  prisma: PrismaClient,
  storage: ImageVariantRepairStorage,
  imageId: string,
  storageKey: string,
  token: string,
  now: Date,
  timeout: number,
): Promise<'repaired' | 'ready' | 'protected'> {
  return prisma.$transaction(
    async (transaction) => {
      await acquireUploadStorageLock(transaction, storageKey)
      await lockImageAccess(transaction, [imageId])
      const image = await transaction.image.findUnique({ where: { id: imageId } })
      if (
        !image ||
        image.deletedAt ||
        image.variantRepairStatus !== 'claimed' ||
        image.variantRepairClaimToken !== token
      ) {
        return 'protected'
      }

      const reservation = await transaction.uploadReservation.findUnique({
        where: { storageKey: image.storageKey },
        select: { id: true },
      })
      if (reservation || image.metadataSanitizedAt === null) {
        await transaction.image.updateMany({
          where: { id: image.id, variantRepairClaimToken: token, deletedAt: null },
          data: {
            variantRepairStatus: 'pending',
            variantRepairNextAt: retryAt(now, 1),
            variantRepairClaimToken: null,
            variantRepairClaimedAt: null,
          },
        })
        return 'protected'
      }

      const thumbnailKey = deriveVariantKey(image.storageKey, 'thumbnail')
      const previewKey = deriveVariantKey(image.storageKey, 'preview')
      const [originalExists, thumbnailExists, previewExists] = await Promise.all([
        storage.exists(image.storageKey),
        storage.exists(thumbnailKey),
        storage.exists(previewKey),
      ])
      if (!originalExists) throw new VariantRepairError('original_missing')

      const requested = { thumbnail: !thumbnailExists, preview: !previewExists }
      let generated: VariantGenerationResult = {
        thumbnail: thumbnailExists ? 'ready' : 'missing',
        preview: previewExists ? 'ready' : 'missing',
      }
      if (requested.thumbnail || requested.preview) {
        const original = await storage.loadOriginal(image)
        generated = await storage.generate(image.storageKey, original, requested)
      }
      const thumbnailReady =
        !requested.thumbnail ||
        (generated.thumbnail === 'ready' && (await storage.exists(thumbnailKey)))
      const previewReady =
        !requested.preview || (generated.preview === 'ready' && (await storage.exists(previewKey)))
      if (!thumbnailReady || !previewReady) {
        throw new VariantRepairError(
          generated.thumbnail === 'missing' || generated.preview === 'missing'
            ? 'variant_generation_failed'
            : 'variant_verification_failed',
        )
      }

      await transaction.image.updateMany({
        where: { id: image.id, variantRepairClaimToken: token, deletedAt: null },
        data: {
          originalVariantStatus: 'ready',
          thumbnailVariantStatus: 'ready',
          previewVariantStatus: 'ready',
          variantRepairStatus: 'complete',
          variantRepairAttempts: 0,
          variantRepairNextAt: new Date(now.getTime() + COMPLETE_VERIFICATION_INTERVAL_MS),
          variantRepairClaimToken: null,
          variantRepairClaimedAt: null,
          variantRepairFailureReason: null,
        },
      })
      return requested.thumbnail || requested.preview ? 'repaired' : 'ready'
    },
    { maxWait: 3_000, timeout },
  )
}

async function observeVariantState(
  storage: ImageVariantRepairStorage,
  image: Image,
  reason: VariantRepairFailureReason,
): Promise<ObservedVariantState> {
  const keys = [
    image.storageKey,
    deriveVariantKey(image.storageKey, 'thumbnail'),
    deriveVariantKey(image.storageKey, 'preview'),
  ] as const
  const results = await Promise.allSettled(keys.map((key) => storage.exists(key)))
  const original = results[0]!
  const thumbnail = results[1]!
  const preview = results[2]!
  return {
    original:
      reason === 'original_invalid'
        ? 'invalid'
        : reason === 'original_missing'
          ? 'missing'
          : original.status === 'fulfilled'
            ? original.value
              ? 'ready'
              : 'missing'
            : undefined,
    thumbnail:
      thumbnail.status === 'fulfilled' ? (thumbnail.value ? 'ready' : 'missing') : undefined,
    preview: preview.status === 'fulfilled' ? (preview.value ? 'ready' : 'missing') : undefined,
  }
}

export async function runImageVariantRepairs(
  prisma: PrismaClient,
  storage: ImageVariantRepairStorage,
  options: { apply: boolean; now?: Date; limit?: number; workTimeoutMs?: number },
): Promise<ImageVariantRepairResult> {
  const now = options.now ?? new Date()
  const staleClaimBefore = new Date(now.getTime() - CLAIM_LEASE_MS)
  const where: Prisma.ImageWhereInput = {
    deletedAt: null,
    variantRepairNextAt: { lte: now },
    OR: [
      { variantRepairStatus: 'pending' },
      { variantRepairStatus: 'complete' },
      { variantRepairStatus: 'claimed', variantRepairClaimedAt: { lte: staleClaimBefore } },
    ],
    metadataSanitizedAt: { not: null },
  }
  const [eligibleTotal, deadLetterTotal, candidates] = await Promise.all([
    prisma.image.count({ where }),
    prisma.image.count({ where: { deletedAt: null, variantRepairStatus: 'dead_letter' } }),
    prisma.image.findMany({
      where,
      orderBy: [{ variantRepairNextAt: 'asc' }, { id: 'asc' }],
      take: Math.min(Math.max(options.limit ?? 1, 1), 5),
    }),
  ])
  const result: ImageVariantRepairResult = {
    mode: options.apply ? 'apply' : 'dry-run',
    eligibleTotal,
    deadLetterTotal,
    scanned: candidates.length,
    repaired: 0,
    alreadyReady: 0,
    protected: 0,
    retried: 0,
    deadLetter: 0,
    failed: 0,
  }
  if (!options.apply) return result

  for (const candidate of candidates) {
    let outcome: 'repaired' | 'ready' | 'protected' | 'retried' | 'dead_letter'
    try {
      const claim = await claimImage(prisma, candidate.id, now, staleClaimBefore)
      if (!claim) {
        outcome = 'protected'
      } else {
        try {
          outcome = await repairClaimedImage(
            prisma,
            storage,
            claim.image.id,
            claim.image.storageKey,
            claim.token,
            now,
            Math.min(Math.max(options.workTimeoutMs ?? 50_000, 1), 50_000),
          )
        } catch (error) {
          const reason = failureReason(error)
          const observed = await observeVariantState(storage, claim.image, reason)
          outcome = await recordFailure(prisma, claim.image.id, claim.token, now, reason, observed)
        }
      }
    } catch {
      result.failed += 1
      continue
    }

    if (outcome === 'repaired') result.repaired += 1
    else if (outcome === 'ready') result.alreadyReady += 1
    else if (outcome === 'protected') result.protected += 1
    else if (outcome === 'retried') result.retried += 1
    else result.deadLetter += 1
  }
  return result
}
