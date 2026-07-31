import type { Prisma } from '@prisma/client'

const AI_CONSENT_LOCK_PREFIX = 'hana:ai-consent:'

export async function lockAiConsent(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`${AI_CONSENT_LOCK_PREFIX}${userId}`}, 0))
  `
}
