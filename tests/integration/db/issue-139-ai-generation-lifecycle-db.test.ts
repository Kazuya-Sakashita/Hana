import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'

const qaEnabled =
  process.env.ISSUE_139_DATABASE_QA === '1' || process.env.ISSUE_147_DATABASE_QA === '1'

function assertSafeTarget(
  connectionString: string | undefined,
): asserts connectionString is string {
  if (!connectionString) throw new Error('database_url_required')
  const url = new URL(connectionString)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/hana_ci') {
    throw new Error('synthetic_local_database_required')
  }
}

describe.skipIf(!qaEnabled)('ISSUE-139/147 production lifecycle on local PostgreSQL', () => {
  let prisma: PrismaClient
  let lifecycle: typeof import('@/features/ai/server/generation-lifecycle')
  let quota: typeof import('@/features/ai/server/quota')
  let lockAiConsent: typeof import('@/features/ai/server/consent-lock').lockAiConsent
  let lockImageAccess: typeof import('@/features/uploads/server/image-access-lock').lockImageAccess

  const userId = randomUUID()
  const childId = randomUUID()
  const consentAt = new Date('2026-08-01T00:00:00Z')
  const imageIds = [randomUUID(), randomUUID(), randomUUID()]

  beforeAll(async () => {
    assertSafeTarget(process.env.DATABASE_URL)
    ;({ prisma } = await import('@/server/db/prisma'))
    lifecycle = await import('@/features/ai/server/generation-lifecycle')
    quota = await import('@/features/ai/server/quota')
    ;({ lockAiConsent } = await import('@/features/ai/server/consent-lock'))
    ;({ lockImageAccess } = await import('@/features/uploads/server/image-access-lock'))

    const now = new Date()
    await prisma.profile.create({ data: { id: userId, aiConsentAt: consentAt } })
    await prisma.child.create({
      data: {
        id: childId,
        userId,
        name: 'synthetic',
        birthdate: new Date('2025-01-01T00:00:00Z'),
      },
    })
    for (const imageId of imageIds) {
      await prisma.image.create({
        data: {
          id: imageId,
          userId,
          storageKey: `uploads/synthetic/202608/${imageId}.jpg`,
          contentType: 'image/jpeg',
          width: 1,
          height: 1,
          fileSize: 4,
          metadataSanitizedAt: now,
        },
      })
    }
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.profile.deleteMany({ where: { id: userId } })
    await prisma.$disconnect()
  })

  it('keeps quota schema and removes legacy compatibility after the full migration chain', async () => {
    const [state] = await prisma.$queryRaw<
      Array<{
        quotaColumnPresent: boolean
        quotaIndexPresent: boolean
        legacyTriggerPresent: boolean
        legacyFunctionPresent: boolean
      }>
    >`
      SELECT
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'ai_generations'
            AND column_name = 'quota_counted_at'
        ) AS "quotaColumnPresent",
        EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'ai_generations'
            AND indexname = 'ai_generations_user_id_quota_counted_at_idx'
        ) AS "quotaIndexPresent",
        EXISTS (
          SELECT 1
          FROM pg_trigger AS trigger
          JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
          JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relname = 'ai_generations'
            AND trigger.tgname = 'sync_legacy_ai_generation_lifecycle_trigger'
            AND NOT trigger.tgisinternal
        ) AS "legacyTriggerPresent",
        to_regprocedure('public.sync_legacy_ai_generation_lifecycle()') IS NOT NULL
          AS "legacyFunctionPresent"
    `

    expect(state).toEqual({
      quotaColumnPresent: true,
      quotaIndexPresent: true,
      legacyTriggerPresent: false,
      legacyFunctionPresent: false,
    })
  })

  it('runs claim, discard, stale recovery, and UTC quota through production code', async () => {
    const revokeGenerationId = randomUUID()
    const revokeClaimToken = randomUUID()
    const reservationCreatedAt = new Date('2026-07-31T23:59:59Z')
    await prisma.aiGeneration.create({
      data: {
        id: revokeGenerationId,
        userId,
        childId,
        model: 'synthetic-model',
        promptVersion: 'qa',
        status: 'reserved',
        claimToken: revokeClaimToken,
        leaseExpiresAt: new Date(Date.now() + 60_000),
        succeeded: false,
        countsTowardQuota: false,
        errorReason: 'in_progress',
        createdAt: reservationCreatedAt,
      },
    })

    const beforeClaim = new Date()
    const claimed = await prisma.$transaction((transaction) =>
      lifecycle.claimAiGeneration(transaction, {
        generationId: revokeGenerationId,
        userId,
        childId,
        imageIds: [imageIds[0]!],
        claimToken: revokeClaimToken,
        consentVersion: consentAt,
      }),
    )
    expect(claimed).toEqual({ outcome: 'claimed' })
    const processing = await prisma.aiGeneration.findUniqueOrThrow({
      where: { id: revokeGenerationId },
    })
    expect(processing.status).toBe('processing')
    expect(processing.countsTowardQuota).toBe(true)
    expect(processing.quotaCountedAt?.getTime()).toBeGreaterThanOrEqual(beforeClaim.getTime())
    expect(processing.createdAt).toEqual(reservationCreatedAt)

    const revokeStartedAt = Date.now()
    await prisma.$transaction(async (transaction) => {
      await lockAiConsent(transaction, userId)
      await transaction.profile.update({ where: { id: userId }, data: { aiConsentAt: null } })
    })
    expect(Date.now() - revokeStartedAt).toBeLessThan(1_000)

    const revokedFinalize = await prisma.$transaction((transaction) =>
      lifecycle.finalizeAiGeneration(transaction, {
        generationId: revokeGenerationId,
        userId,
        childId,
        imageIds: [imageIds[0]!],
        claimToken: revokeClaimToken,
        consentVersion: consentAt,
        success: {
          inputTokens: 1,
          outputTokens: 1,
          durationMs: 1,
          attemptCount: 1,
          policyCategoryIds: [],
          policyOutcome: 'accepted_first_attempt',
        },
      }),
    )
    expect(revokedFinalize).toEqual({
      outcome: 'discarded',
      reason: 'ai_consent_required',
    })

    await prisma.profile.update({ where: { id: userId }, data: { aiConsentAt: consentAt } })
    const deleteGenerationId = randomUUID()
    const deleteClaimToken = randomUUID()
    await prisma.aiGeneration.create({
      data: {
        id: deleteGenerationId,
        userId,
        childId,
        model: 'synthetic-model',
        promptVersion: 'qa',
        status: 'reserved',
        claimToken: deleteClaimToken,
        leaseExpiresAt: new Date(Date.now() + 60_000),
        succeeded: false,
        countsTowardQuota: false,
        errorReason: 'in_progress',
      },
    })
    await prisma.$transaction((transaction) =>
      lifecycle.claimAiGeneration(transaction, {
        generationId: deleteGenerationId,
        userId,
        childId,
        imageIds: [imageIds[1]!],
        claimToken: deleteClaimToken,
        consentVersion: consentAt,
      }),
    )
    const deleteStartedAt = Date.now()
    await prisma.$transaction(async (transaction) => {
      await lockImageAccess(transaction, [imageIds[1]!])
      await transaction.image.update({
        where: { id: imageIds[1]! },
        data: { deletedAt: new Date() },
      })
    })
    expect(Date.now() - deleteStartedAt).toBeLessThan(1_000)
    await expect(
      prisma.$transaction((transaction) =>
        lifecycle.finalizeAiGeneration(transaction, {
          generationId: deleteGenerationId,
          userId,
          childId,
          imageIds: [imageIds[1]!],
          claimToken: deleteClaimToken,
          consentVersion: consentAt,
          success: {
            inputTokens: 1,
            outputTokens: 1,
            durationMs: 1,
            attemptCount: 1,
            policyCategoryIds: [],
            policyOutcome: 'accepted_first_attempt',
          },
        }),
      ),
    ).resolves.toEqual({ outcome: 'discarded', reason: 'image_not_found' })

    const expiredGenerationId = randomUUID()
    const expiredClaimToken = randomUUID()
    await prisma.aiGeneration.create({
      data: {
        id: expiredGenerationId,
        userId,
        childId,
        model: 'synthetic-model',
        promptVersion: 'qa',
        status: 'processing',
        claimToken: expiredClaimToken,
        leaseExpiresAt: new Date(Date.now() - 60_000),
        quotaCountedAt: new Date(),
        succeeded: false,
        countsTowardQuota: true,
        errorReason: 'in_progress',
      },
    })
    const expiredBeforeRecovery = await prisma.$transaction((transaction) =>
      lifecycle.finalizeAiGeneration(transaction, {
        generationId: expiredGenerationId,
        userId,
        childId,
        imageIds: [imageIds[2]!],
        claimToken: expiredClaimToken,
        consentVersion: consentAt,
        success: {
          inputTokens: 1,
          outputTokens: 1,
          durationMs: 1,
          attemptCount: 1,
          policyCategoryIds: [],
          policyOutcome: 'accepted_first_attempt',
        },
      }),
    )
    expect(expiredBeforeRecovery).toEqual({ outcome: 'stale' })
    await expect(
      lifecycle.failAiGeneration(prisma, {
        generationId: expiredGenerationId,
        userId,
        claimToken: expiredClaimToken,
        wasClaimed: true,
        failure: {
          durationMs: 1,
          attemptCount: 1,
          policyCategoryIds: [],
          policyOutcome: null,
          errorReason: 'internal_error',
        },
      }),
    ).resolves.toEqual({ outcome: 'stale' })

    const activeReservation = await prisma.$transaction((transaction) =>
      quota.reserveMonthlyAiQuotaInTransaction(transaction, {
        userId,
        childId,
        model: 'synthetic-model',
        promptVersion: 'qa',
      }),
    )
    await expect(
      prisma.aiGeneration.findUniqueOrThrow({ where: { id: activeReservation.id } }),
    ).resolves.toMatchObject({
      status: 'reserved',
      countsTowardQuota: false,
      quotaCountedAt: null,
    })
    const recovered = await prisma.aiGeneration.findUniqueOrThrow({
      where: { id: expiredGenerationId },
    })
    expect(recovered).toMatchObject({
      status: 'failed',
      countsTowardQuota: true,
      claimToken: null,
      leaseExpiresAt: null,
      errorReason: 'processing_lease_expired',
    })

    const quotaState = await quota.checkMonthlyQuota(userId)
    expect(quotaState.used).toBeGreaterThanOrEqual(4)
  })
})
