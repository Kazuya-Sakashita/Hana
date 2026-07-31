import { NextResponse } from 'next/server'
import {
  inspectAccountPhysicalPurge,
  processAccountPhysicalPurges,
} from '@/features/account-deletion/server/physical-purge'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse(null, { status: 404 })
  }
  const dryRun = new URL(request.url).searchParams.get('dry_run') === '1'
  return NextResponse.json(
    dryRun ? await inspectAccountPhysicalPurge() : await processAccountPhysicalPurges(),
  )
}
