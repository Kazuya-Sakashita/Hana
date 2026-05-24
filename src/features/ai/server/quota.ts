import 'server-only'

import { prisma } from '@/server/db/prisma'

// PRD §16 マネタイズ: Free tier は月 20 回まで。Plus は無制限 (ISSUE-019 で実装)。
// 失敗した generation は quota にカウントしない。
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
    where: { userId, succeeded: true, createdAt: { gte: since } },
  })
  return {
    used,
    limit: MONTHLY_QUOTA_FREE,
    ok: used < MONTHLY_QUOTA_FREE,
    resetAt: startOfNextUtcMonth(),
  }
}
