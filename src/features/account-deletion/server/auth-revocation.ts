import { createSupabaseAuthAdminClient } from '@/lib/supabase/auth-admin'
import { prisma } from '@/server/db/prisma'

const CLAIM_LEASE_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 10
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000

function nextAttemptDate(attempt: number, now: Date): Date {
  const delay = Math.min(2 ** Math.max(0, attempt - 1) * 60_000, MAX_BACKOFF_MS)
  return new Date(now.getTime() + delay)
}

function providerAlreadyDeleted(error: { status?: number; message?: string } | null): boolean {
  return error?.status === 404
}

export async function processAccountDeletionAuthRevocations(limit = 20): Promise<{
  claimed: number
  succeeded: number
  failed: number
}> {
  const now = new Date()
  const candidates = await prisma.accountDeletionRequest.findMany({
    where: {
      authRevocationStatus: 'pending',
      authRevocationAttempts: { lt: MAX_ATTEMPTS },
      nextAuthAttemptAt: { lte: now },
      OR: [
        { authClaimedAt: null },
        { authClaimedAt: { lt: new Date(now.getTime() - CLAIM_LEASE_MS) } },
      ],
    },
    orderBy: { nextAuthAttemptAt: 'asc' },
    take: limit,
    select: { id: true, userId: true, authRevocationAttempts: true },
  })

  let claimed = 0
  let succeeded = 0
  let failed = 0
  const admin = createSupabaseAuthAdminClient()
  for (const candidate of candidates) {
    const claim = await prisma.accountDeletionRequest.updateMany({
      where: {
        id: candidate.id,
        authRevocationStatus: 'pending',
        authRevocationAttempts: candidate.authRevocationAttempts,
        nextAuthAttemptAt: { lte: now },
        OR: [
          { authClaimedAt: null },
          { authClaimedAt: { lt: new Date(now.getTime() - CLAIM_LEASE_MS) } },
        ],
      },
      data: { authClaimedAt: now },
    })
    if (claim.count !== 1) continue
    claimed += 1

    let revoked = false
    try {
      const result = await admin.auth.admin.deleteUser(candidate.userId, true)
      revoked = !result.error || providerAlreadyDeleted(result.error)
    } catch {
      revoked = false
    }

    const attempt = candidate.authRevocationAttempts + 1
    await prisma.accountDeletionRequest.updateMany({
      where: { id: candidate.id, authClaimedAt: now },
      data: revoked
        ? {
            authRevocationStatus: 'succeeded',
            authRevocationAttempts: attempt,
            authRevokedAt: new Date(),
            authClaimedAt: null,
            lastAuthFailureReason: null,
          }
        : {
            authRevocationStatus: attempt >= MAX_ATTEMPTS ? 'failed' : 'pending',
            authRevocationAttempts: attempt,
            authClaimedAt: null,
            nextAuthAttemptAt: nextAttemptDate(attempt, now),
            lastAuthFailureReason: 'provider_unavailable',
          },
    })
    if (revoked) succeeded += 1
    if (!revoked && attempt >= MAX_ATTEMPTS) failed += 1
  }
  return { claimed, succeeded, failed }
}
