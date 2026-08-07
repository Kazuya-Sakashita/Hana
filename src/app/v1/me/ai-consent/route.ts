import { NextResponse } from 'next/server'
import { requireUser } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'
import { prisma } from '@/server/db/prisma'
import type { AppUser } from '@/lib/supabase/types'
import { lockAiConsent } from '@/features/ai/server/consent-lock'
import { productEventTelemetryBinding } from '@/features/metrics/server/product-event'
import { Prisma } from '@prisma/client'
import { problems } from '@/server/api/problems'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const AI_CONSENT_TRANSACTION_OPTIONS = {
  maxWait: 5_000,
  timeout: 40_000,
} as const

function consentTransactionProblem(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028') {
    return problems.aiConsentUpdateBusy()
  }
  return error
}

function toAppUserResponse(user: AppUser, telemetryBinding: string) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    ai_consent_at: user.aiConsentAt,
    created_at: user.createdAt,
    telemetry_binding: telemetryBinding,
  }
}

export async function POST() {
  try {
    const user = await requireUser()
    const telemetryBinding = productEventTelemetryBinding(user.id)
    const profile = await prisma.$transaction(async (tx) => {
      await lockAiConsent(tx, user.id)
      await tx.profile.updateMany({
        where: { id: user.id, aiConsentAt: null },
        data: { aiConsentAt: new Date() },
      })
      return tx.profile.findUniqueOrThrow({ where: { id: user.id } })
    }, AI_CONSENT_TRANSACTION_OPTIONS)
    return NextResponse.json(
      toAppUserResponse(
        {
          ...user,
          displayName: profile.displayName,
          aiConsentAt: profile.aiConsentAt?.toISOString() ?? null,
          createdAt: profile.createdAt.toISOString(),
        },
        telemetryBinding,
      ),
    )
  } catch (e) {
    return toProblemResponse(consentTransactionProblem(e))
  }
}

export async function DELETE() {
  try {
    const user = await requireUser()
    const telemetryBinding = productEventTelemetryBinding(user.id)
    const profile = await prisma.$transaction(async (tx) => {
      await lockAiConsent(tx, user.id)
      return tx.profile.update({
        where: { id: user.id },
        data: { aiConsentAt: null },
      })
    }, AI_CONSENT_TRANSACTION_OPTIONS)
    return NextResponse.json(
      toAppUserResponse(
        {
          ...user,
          displayName: profile.displayName,
          aiConsentAt: null,
          createdAt: profile.createdAt.toISOString(),
        },
        telemetryBinding,
      ),
    )
  } catch (e) {
    return toProblemResponse(consentTransactionProblem(e))
  }
}
