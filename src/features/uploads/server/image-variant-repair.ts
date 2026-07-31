import { randomUUID } from 'node:crypto'
import { Prisma, type Image, type PrismaClient } from '@prisma/client'
import { deriveVariantKey } from '@/features/uploads/server/signed-url'
import { lockImageAccess } from '@/features/uploads/server/image-access-lock'
import type { VariantGenerationResult } from '@/features/uploads/server/variant-generation'

export const VARIANT_REPAIR_MAX_ATTEMPTS = 10
const CLAIM_LEASE_MS = 10 * 60 * 1000

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
    image.variantRepairNextAt <= now &&
    (image.variantRepairStatus === 'pending' ||
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
          ...(reason === 'original_missing' ? { originalVariantStatus: 'missing' } : {}),
          ...(reason === 'original_invalid' ? { originalVariantStatus: 'invalid' } : {}),
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
  token: string,
  timeout: number,
): Promise<'repaired' | 'ready' | 'protected'> {
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
      { variantRepairStatus: 'claimed', variantRepairClaimedAt: { lte: staleClaimBefore } },
    ],
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
            claim.token,
            Math.min(Math.max(options.workTimeoutMs ?? 50_000, 1), 50_000),
          )
        } catch (error) {
          outcome = await recordFailure(
            prisma,
            claim.image.id,
            claim.token,
            now,
            failureReason(error),
          )
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
