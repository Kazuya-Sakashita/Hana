import { NextResponse } from 'next/server'
import { requireUser } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'
import { prisma } from '@/server/db/prisma'
import type { AppUser } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

function toAppUserResponse(user: AppUser) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    ai_consent_at: user.aiConsentAt,
    created_at: user.createdAt,
  }
}

export async function POST() {
  try {
    const user = await requireUser()
    const profile = await prisma.$transaction(async (tx) => {
      await tx.profile.updateMany({
        where: { id: user.id, aiConsentAt: null },
        data: { aiConsentAt: new Date() },
      })
      return tx.profile.findUniqueOrThrow({ where: { id: user.id } })
    })
    return NextResponse.json(
      toAppUserResponse({
        ...user,
        displayName: profile.displayName,
        aiConsentAt: profile.aiConsentAt?.toISOString() ?? null,
        createdAt: profile.createdAt.toISOString(),
      }),
    )
  } catch (e) {
    return toProblemResponse(e)
  }
}

export async function DELETE() {
  try {
    const user = await requireUser()
    const profile = await prisma.profile.update({
      where: { id: user.id },
      data: { aiConsentAt: null },
    })
    return NextResponse.json(
      toAppUserResponse({
        ...user,
        displayName: profile.displayName,
        aiConsentAt: null,
        createdAt: profile.createdAt.toISOString(),
      }),
    )
  } catch (e) {
    return toProblemResponse(e)
  }
}
