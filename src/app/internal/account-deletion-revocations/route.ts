import { NextResponse } from 'next/server'
import { processAccountDeletionAuthRevocations } from '@/features/account-deletion/server/auth-revocation'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse(null, { status: 404 })
  }
  const result = await processAccountDeletionAuthRevocations()
  return NextResponse.json(result)
}
