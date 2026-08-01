import 'server-only'

import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/server/db/prisma'
import { problems } from '@/server/api/problems'

// PRD §16 マネタイズ: Free tier は月 20 回まで。Plus は無制限 (ISSUE-019 で実装)。
// AI vendor 呼び出しに到達した generation request は、成功・失敗を問わずカウントする。
// ポリシー違反による再生成を利用して上限を回避できないよう、1 request を1回として扱う。
// rolling deploy中は互換triggerがreservedを旧queryへ見せるためcountsTowardQuota=trueにするが、
// 新queryで恒久加算するのはquotaCountedAtが入ったprocessing以降だけ。
//
// 月の境界は UTC 1 日 00:00:00 で揃える (タイムゾーンによる「月またぎ重複加算」を避ける)。

export const MONTHLY_QUOTA_FREE = 20
export const AI_RESERVATION_LEASE_MS = 30_000

export interface QuotaState {
  used: number
  limit: number
  ok: boolean
  resetAt: Date // 次回 quota がリセットされる UTC 時刻
}

export function startOfUtcMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0))
}

export function startOfNextUtcMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0))
}

export function reservationLeaseExpiresAt(now = new Date()): Date {
  const normalExpiry = new Date(now.getTime() + AI_RESERVATION_LEASE_MS)
  const monthBoundary = startOfNextUtcMonth(now)
  return normalExpiry < monthBoundary ? normalExpiry : monthBoundary
}

export async function checkMonthlyQuota(userId: string): Promise<QuotaState> {
  const now = new Date()
  const since = startOfUtcMonth(now)
  const used = await prisma.aiGeneration.count({
    where: {
      userId,
      OR: [
        { countsTowardQuota: true, quotaCountedAt: { gte: since } },
        { status: 'reserved', leaseExpiresAt: { gt: now } },
      ],
    },
  })
  return {
    used,
    limit: MONTHLY_QUOTA_FREE,
    ok: used < MONTHLY_QUOTA_FREE,
    resetAt: startOfNextUtcMonth(now),
  }
}

export async function reserveMonthlyAiQuota({
  userId,
  childId,
  model,
  promptVersion,
}: {
  userId: string
  childId: string
  model: string
  promptVersion: string
}): Promise<{ id: string; claimToken: string }> {
  return prisma.$transaction(
    (transaction) =>
      reserveMonthlyAiQuotaInTransaction(transaction, {
        userId,
        childId,
        model,
        promptVersion,
      }),
    {
      maxWait: 3_000,
      timeout: 5_000,
    },
  )
}

export async function reserveMonthlyAiQuotaInTransaction(
  transaction: Prisma.TransactionClient,
  {
    userId,
    childId,
    model,
    promptVersion,
  }: {
    userId: string
    childId: string
    model: string
    promptVersion: string
  },
): Promise<{ id: string; claimToken: string }> {
  const claimToken = randomUUID()
  await transaction.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))
  `
  const now = new Date()
  const since = startOfUtcMonth(now)
  await transaction.aiGeneration.updateMany({
    where: { userId, status: 'reserved', leaseExpiresAt: { lte: now } },
    data: {
      status: 'failed',
      succeeded: false,
      countsTowardQuota: false,
      claimToken: null,
      leaseExpiresAt: null,
      completedAt: now,
      errorReason: 'reservation_lease_expired',
    },
  })
  await transaction.aiGeneration.updateMany({
    where: { userId, status: 'processing', leaseExpiresAt: { lte: now } },
    data: {
      status: 'failed',
      succeeded: false,
      countsTowardQuota: true,
      claimToken: null,
      leaseExpiresAt: null,
      completedAt: now,
      errorReason: 'processing_lease_expired',
    },
  })
  const used = await transaction.aiGeneration.count({
    where: {
      userId,
      OR: [
        { countsTowardQuota: true, quotaCountedAt: { gte: since } },
        { status: 'reserved', leaseExpiresAt: { gt: now } },
      ],
    },
  })
  if (used >= MONTHLY_QUOTA_FREE) throw problems.aiQuotaExceeded()

  const reservation = await transaction.aiGeneration.create({
    data: {
      userId,
      childId,
      model,
      promptVersion,
      status: 'reserved',
      claimToken,
      leaseExpiresAt: reservationLeaseExpiresAt(now),
      succeeded: false,
      countsTowardQuota: false,
      errorReason: 'in_progress',
    },
    select: { id: true },
  })
  return { id: reservation.id, claimToken }
}
