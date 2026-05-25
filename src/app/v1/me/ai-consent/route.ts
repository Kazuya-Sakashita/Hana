import { NextResponse } from 'next/server'
import { requireUser } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'
import { prisma } from '@/server/db/prisma'

export const dynamic = 'force-dynamic'

// AI への画像送信に同意する (idempotent)。
// 既に ai_consent_at が立っている場合は時刻を更新しない。
export async function POST() {
  try {
    const user = await requireUser()
    const profile = await prisma.profile.update({
      where: { id: user.id },
      data: user.aiConsentAt ? {} : { aiConsentAt: new Date() },
    })
    return NextResponse.json({
      id: profile.id,
      email: user.email,
      display_name: profile.displayName,
      ai_consent_at: profile.aiConsentAt?.toISOString() ?? null,
      created_at: profile.createdAt.toISOString(),
    })
  } catch (e) {
    return toProblemResponse(e)
  }
}
