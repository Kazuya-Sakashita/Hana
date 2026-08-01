import 'server-only'

import type { Prisma } from '@prisma/client'
import { lockAiConsent } from '@/features/ai/server/consent-lock'
import { lockImageAccess } from '@/features/uploads/server/image-access-lock'

export const AI_PROCESSING_LEASE_MS = 2 * 60_000

type BoundaryFailureReason = 'ai_consent_required' | 'image_not_found' | 'child_not_found'

interface GenerationBoundaryInput {
  generationId: string
  userId: string
  childId: string
  imageIds: string[]
  claimToken: string
  consentVersion: Date
}

interface GenerationSuccessMetadata {
  inputTokens: number
  outputTokens: number
  durationMs: number
  attemptCount: number
  policyCategoryIds: string[]
  policyOutcome: string
}

interface GenerationFailureMetadata {
  inputTokens?: number
  outputTokens?: number
  durationMs: number
  attemptCount: number
  policyCategoryIds: string[]
  policyOutcome: string | null
  errorReason: string
}

function hasSameConsentGeneration(current: Date | null | undefined, expected: Date): boolean {
  return current?.getTime() === expected.getTime()
}

async function validateGenerationBoundary(
  transaction: Prisma.TransactionClient,
  input: GenerationBoundaryInput,
): Promise<BoundaryFailureReason | null> {
  await lockAiConsent(transaction, input.userId)
  const profile = await transaction.profile.findUnique({
    where: { id: input.userId },
    select: { aiConsentAt: true },
  })
  if (!hasSameConsentGeneration(profile?.aiConsentAt, input.consentVersion)) {
    return 'ai_consent_required'
  }

  await lockImageAccess(transaction, input.imageIds)
  const images = await transaction.image.findMany({
    where: {
      id: { in: input.imageIds },
      userId: input.userId,
      deletedAt: null,
      memoryId: null,
      metadataSanitizedAt: { not: null },
    },
    select: { id: true },
  })
  if (images.length !== input.imageIds.length) return 'image_not_found'

  const child = await transaction.child.findFirst({
    where: { id: input.childId, userId: input.userId, deletedAt: null },
    select: { id: true },
  })
  return child ? null : 'child_not_found'
}

export async function claimAiGeneration(
  transaction: Prisma.TransactionClient,
  input: GenerationBoundaryInput,
): Promise<
  | { outcome: 'claimed' }
  | { outcome: 'rejected'; reason: BoundaryFailureReason }
  | { outcome: 'stale' }
> {
  const reason = await validateGenerationBoundary(transaction, input)
  if (reason) return { outcome: 'rejected', reason }
  const claimedAt = new Date()

  const claimed = await transaction.aiGeneration.updateMany({
    where: {
      id: input.generationId,
      userId: input.userId,
      status: 'reserved',
      claimToken: input.claimToken,
      leaseExpiresAt: { gt: claimedAt },
    },
    data: {
      status: 'processing',
      countsTowardQuota: true,
      quotaCountedAt: claimedAt,
      leaseExpiresAt: new Date(claimedAt.getTime() + AI_PROCESSING_LEASE_MS),
    },
  })
  return claimed.count === 1 ? { outcome: 'claimed' } : { outcome: 'stale' }
}

export async function finalizeAiGeneration(
  transaction: Prisma.TransactionClient,
  input: GenerationBoundaryInput & { success: GenerationSuccessMetadata },
): Promise<
  | { outcome: 'succeeded' }
  | { outcome: 'discarded'; reason: BoundaryFailureReason }
  | { outcome: 'stale' }
> {
  const reason = await validateGenerationBoundary(transaction, input)
  const completedAt = new Date()
  if (reason) {
    const discarded = await transaction.aiGeneration.updateMany({
      where: {
        id: input.generationId,
        userId: input.userId,
        status: 'processing',
        claimToken: input.claimToken,
        leaseExpiresAt: { gt: completedAt },
      },
      data: {
        status: 'discarded',
        succeeded: false,
        countsTowardQuota: true,
        claimToken: null,
        leaseExpiresAt: null,
        completedAt,
        errorReason: reason,
      },
    })
    return discarded.count === 1 ? { outcome: 'discarded', reason } : { outcome: 'stale' }
  }

  const succeeded = await transaction.aiGeneration.updateMany({
    where: {
      id: input.generationId,
      userId: input.userId,
      status: 'processing',
      claimToken: input.claimToken,
      leaseExpiresAt: { gt: completedAt },
    },
    data: {
      status: 'succeeded',
      succeeded: true,
      countsTowardQuota: true,
      claimToken: null,
      leaseExpiresAt: null,
      completedAt,
      inputTokens: input.success.inputTokens,
      outputTokens: input.success.outputTokens,
      durationMs: input.success.durationMs,
      attemptCount: input.success.attemptCount,
      policyCategoryIds: input.success.policyCategoryIds,
      policyOutcome: input.success.policyOutcome,
      errorReason: null,
    },
  })
  return succeeded.count === 1 ? { outcome: 'succeeded' } : { outcome: 'stale' }
}

export async function failAiGeneration(
  client: Pick<Prisma.TransactionClient, 'aiGeneration'>,
  input: {
    generationId: string
    userId: string
    claimToken: string
    wasClaimed: boolean
    failure: GenerationFailureMetadata
  },
): Promise<{ outcome: 'failed' } | { outcome: 'stale' }> {
  const completedAt = new Date()
  const failed = await client.aiGeneration.updateMany({
    where: {
      id: input.generationId,
      userId: input.userId,
      status: input.wasClaimed ? 'processing' : 'reserved',
      claimToken: input.claimToken,
      leaseExpiresAt: { gt: completedAt },
    },
    data: {
      status: 'failed',
      succeeded: false,
      countsTowardQuota: input.wasClaimed,
      claimToken: null,
      leaseExpiresAt: null,
      completedAt,
      inputTokens: input.failure.inputTokens,
      outputTokens: input.failure.outputTokens,
      durationMs: input.failure.durationMs,
      attemptCount: input.failure.attemptCount,
      policyCategoryIds: input.failure.policyCategoryIds,
      policyOutcome: input.failure.policyOutcome,
      errorReason: input.failure.errorReason,
    },
  })
  return failed.count === 1 ? { outcome: 'failed' } : { outcome: 'stale' }
}
