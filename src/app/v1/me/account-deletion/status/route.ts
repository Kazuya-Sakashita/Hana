import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  ACCOUNT_DELETION_RECEIPT_COOKIE,
  hashAccountDeletionIntentSecret,
} from '@/features/account-deletion/server/intent'
import { prisma } from '@/server/db/prisma'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const secret = (await cookies()).get(ACCOUNT_DELETION_RECEIPT_COOKIE)?.value
    if (!secret) throw problems.notFound()
    const request = await prisma.accountDeletionRequest.findUnique({
      where: { receiptHash: hashAccountDeletionIntentSecret(secret) },
      select: { requestedAt: true, purgeAfter: true },
    })
    if (!request) throw problems.notFound()
    return NextResponse.json({
      status: 'accepted',
      requested_at: request.requestedAt.toISOString(),
      purge_after: request.purgeAfter.toISOString(),
    })
  } catch (error) {
    return toProblemResponse(error)
  }
}
