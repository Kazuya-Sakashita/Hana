import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  ACCOUNT_DELETION_RECEIPT_COOKIE,
  hashAccountDeletionIntentSecret,
} from '@/features/account-deletion/server/intent'
import { prisma } from '@/server/db/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const secret = (await cookies()).get(ACCOUNT_DELETION_RECEIPT_COOKIE)?.value
  if (!secret) return new NextResponse(null, { status: 404 })
  const request = await prisma.accountDeletionRequest.findUnique({
    where: { receiptHash: hashAccountDeletionIntentSecret(secret) },
    select: { requestedAt: true, purgeAfter: true },
  })
  if (!request) return new NextResponse(null, { status: 404 })
  return NextResponse.json({
    status: 'accepted',
    requested_at: request.requestedAt.toISOString(),
    purge_after: request.purgeAfter.toISOString(),
  })
}
