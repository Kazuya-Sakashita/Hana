import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import {
  CONFIRMED_UNLINKED_CLEANUP_MINIMUM_ITEM_BUDGET_MS,
  CONFIRMED_UNLINKED_CLEANUP_ROUTE_BUDGET_MS,
  runConfirmedUnlinkedCleanup,
} from '@/features/uploads/server/confirmed-unlinked-cleanup'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'
import { prisma } from '@/server/db/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BUCKET = 'images'
const STORAGE_TIMEOUT_MS = 8_000

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  const authorization = request.headers.get('authorization')
  if (!secret || !authorization?.startsWith('Bearer ')) return false
  const expected = Buffer.from(secret)
  const received = Buffer.from(authorization.slice('Bearer '.length))
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export async function POST(request: Request) {
  if (!authorized(request)) return toProblemResponse(problems.notFound())

  try {
    const deadlineAt = Date.now() + CONFIRMED_UNLINKED_CLEANUP_ROUTE_BUDGET_MS
    const result = await runConfirmedUnlinkedCleanup(
      prisma,
      {
        remove: async (keys) => {
          try {
            const signal = AbortSignal.timeout(STORAGE_TIMEOUT_MS)
            const removed = await createSupabaseAdminClient({ signal })
              .storage.from(BUCKET)
              .remove(keys)
            return !removed.error
          } catch {
            return false
          }
        },
      },
      {
        apply: process.env.CONFIRMED_UNLINKED_CLEANUP_APPLY === 'confirmed',
        limit: 3,
        deadlineAt,
        minimumItemBudgetMs: CONFIRMED_UNLINKED_CLEANUP_MINIMUM_ITEM_BUDGET_MS,
      },
    )
    return NextResponse.json(result)
  } catch (error) {
    return toProblemResponse(error)
  }
}
