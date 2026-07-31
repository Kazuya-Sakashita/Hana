import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_DELETION_INTENT_COOKIE,
  ACCOUNT_DELETION_RECEIPT_COOKIE,
  accountDeletionReceiptCookieOptions,
  hashAccountDeletionIntentSecret,
} from '@/features/account-deletion/server/intent'
import { requireSameOriginJson } from '@/features/account-deletion/server/request-origin'
import { readJsonBody } from '@/features/uploads/server/parse'
import { lockImageAccess } from '@/features/uploads/server/image-access-lock'
import { isUuid } from '@/features/memories/server/parse'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'
import { requireAuthenticatedAccount } from '@/server/auth/current-user'
import { prisma } from '@/server/db/prisma'

export const dynamic = 'force-dynamic'

const PURGE_DELAY_MS = 30 * 24 * 60 * 60 * 1000

function toResponse(request: { requestedAt: Date; purgeAfter: Date }) {
  return {
    status: 'accepted' as const,
    requested_at: request.requestedAt.toISOString(),
    purge_after: request.purgeAfter.toISOString(),
  }
}

export async function POST(request: Request) {
  try {
    requireSameOriginJson(request)
    const { authUser } = await requireAuthenticatedAccount()
    const existing = await prisma.accountDeletionRequest.findUnique({
      where: { userId: authUser.id },
    })
    if (existing) {
      return NextResponse.json(toResponse(existing), { status: 202 })
    }

    const idempotencyKey = request.headers.get('Idempotency-Key')
    if (!idempotencyKey || !isUuid(idempotencyKey)) {
      throw problems.validation([
        {
          path: 'header.Idempotency-Key',
          reason: 'invalid_format',
          message: 'UUID形式のIdempotency-Keyが必要です',
        },
      ])
    }
    const raw = await readJsonBody(request)
    if (
      typeof raw !== 'object' ||
      raw === null ||
      Object.keys(raw).length !== 1 ||
      !('confirmation' in raw) ||
      raw.confirmation !== ACCOUNT_DELETION_CONFIRMATION
    ) {
      throw problems.validation([
        {
          path: 'body.confirmation',
          reason: 'exact_confirmation_required',
          message: '「退会する」と入力してください',
        },
      ])
    }

    const cookieStore = await cookies()
    const secret = cookieStore.get(ACCOUNT_DELETION_INTENT_COOKIE)?.value
    if (!secret) throw problems.accountDeletionReauthenticationRequired()
    const tokenHash = hashAccountDeletionIntentSecret(secret)
    const now = new Date()
    const purgeAfter = new Date(now.getTime() + PURGE_DELAY_MS)

    let accepted
    try {
      accepted = await prisma.$transaction(async (transaction) => {
        const intent = await transaction.accountDeletionIntent.findFirst({
          where: {
            tokenHash,
            userId: authUser.id,
            verifiedAt: { not: null },
            consumedAt: null,
            expiresAt: { gt: now },
          },
        })
        if (!intent) throw problems.accountDeletionReauthenticationRequired()

        const activeImages = await transaction.image.findMany({
          where: { userId: authUser.id, deletedAt: null },
          select: { id: true },
        })
        await lockImageAccess(
          transaction,
          activeImages.map((image) => image.id),
        )

        const blocked = await transaction.profile.updateMany({
          where: { id: authUser.id, accessBlockedAt: null },
          data: {
            aiConsentAt: null,
            deletionRequestedAt: now,
            accessBlockedAt: now,
            purgeAfter,
          },
        })
        if (blocked.count !== 1) {
          const concurrent = await transaction.accountDeletionRequest.findUnique({
            where: { userId: authUser.id },
          })
          if (concurrent) return concurrent
          throw problems.accountDeletionAlreadyProcessing()
        }

        await transaction.child.updateMany({
          where: { userId: authUser.id, deletedAt: null },
          data: { deletedAt: now },
        })
        await transaction.memory.updateMany({
          where: { userId: authUser.id, deletedAt: null },
          data: { deletedAt: now },
        })
        await transaction.image.updateMany({
          where: { userId: authUser.id, deletedAt: null },
          data: { deletedAt: now },
        })
        await transaction.accountDeletionIntent.update({
          where: { id: intent.id },
          data: { consumedAt: now },
        })
        return transaction.accountDeletionRequest.create({
          data: {
            userId: authUser.id,
            idempotencyKey,
            receiptHash: tokenHash,
            requestedAt: now,
            accessBlockedAt: now,
            purgeAfter,
            nextPurgeAttemptAt: purgeAfter,
          },
        })
      })
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error
      }
      accepted = await prisma.accountDeletionRequest.findUnique({
        where: { userId: authUser.id },
      })
      if (!accepted) throw error
    }

    const response = NextResponse.json(toResponse(accepted), { status: 202 })
    response.cookies.set(
      ACCOUNT_DELETION_RECEIPT_COOKIE,
      secret,
      accountDeletionReceiptCookieOptions(),
    )
    response.cookies.delete(ACCOUNT_DELETION_INTENT_COOKIE)
    return response
  } catch (error) {
    return toProblemResponse(error)
  }
}
