import 'server-only'

import { prisma } from '@/server/db/prisma'
import { problems } from '@/server/api/problems'

// PRD §16 マネタイズ: Free tier は月 20 回まで。Plus は無制限 (ISSUE-019 で実装)。
// AI vendor 呼び出しに到達した generation request は、成功・失敗を問わずカウントする。
// ポリシー違反による再生成を利用して上限を回避できないよう、1 request を1回として扱う。
//
// 月の境界は UTC 1 日 00:00:00 で揃える (タイムゾーンによる「月またぎ重複加算」を避ける)。

export const MONTHLY_QUOTA_FREE = 20

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

export async function checkMonthlyQuota(userId: string): Promise<QuotaState> {
  const since = startOfUtcMonth()
  const used = await prisma.aiGeneration.count({
    where: { userId, countsTowardQuota: true, createdAt: { gte: since } },
  })
  return {
    used,
    limit: MONTHLY_QUOTA_FREE,
    ok: used < MONTHLY_QUOTA_FREE,
    resetAt: startOfNextUtcMonth(),
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
}): Promise<{ id: string }> {
  const since = startOfUtcMonth()
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))
    `
    const used = await transaction.aiGeneration.count({
      where: { userId, countsTowardQuota: true, createdAt: { gte: since } },
    })
    if (used >= MONTHLY_QUOTA_FREE) throw problems.aiQuotaExceeded()

    return transaction.aiGeneration.create({
      data: {
        userId,
        childId,
        model,
        promptVersion,
        succeeded: false,
        countsTowardQuota: true,
        errorReason: 'in_progress',
      },
      select: { id: true },
    })
  })
}
