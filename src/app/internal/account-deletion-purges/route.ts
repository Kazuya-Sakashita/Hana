import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import {
  inspectAccountPhysicalPurge,
  processAccountPhysicalPurges,
} from '@/features/account-deletion/server/physical-purge'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  const authorization = request.headers.get('authorization')
  if (!secret || !authorization?.startsWith('Bearer ')) return false
  const expected = Buffer.from(secret)
  const received = Buffer.from(authorization.slice('Bearer '.length))
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export async function GET(request: Request) {
  if (!authorized(request)) return new NextResponse(null, { status: 404 })
  const dryRun =
    new URL(request.url).searchParams.get('dry_run') === '1' ||
    process.env.ACCOUNT_PHYSICAL_PURGE_APPLY !== 'confirmed'
  return NextResponse.json(
    dryRun ? await inspectAccountPhysicalPurge() : await processAccountPhysicalPurges(),
  )
}
