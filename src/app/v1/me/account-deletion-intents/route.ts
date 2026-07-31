import { NextResponse } from 'next/server'
import {
  ACCOUNT_DELETION_INTENT_COOKIE,
  ACCOUNT_DELETION_INTENT_TTL_MS,
  ACCOUNT_DELETION_RECEIPT_COOKIE,
  accountDeletionIntentCookieOptions,
  accountDeletionReceiptCookieOptions,
  createAccountDeletionIntentSecret,
  hashAccountDeletionIntentSecret,
} from '@/features/account-deletion/server/intent'
import { requireSameOrigin } from '@/features/account-deletion/server/request-origin'
import { publicAppOrigin } from '@/lib/auth/safe-redirect'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'
import { requireUser } from '@/server/auth/current-user'
import { prisma } from '@/server/db/prisma'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    const user = await requireUser()
    const secret = createAccountDeletionIntentSecret()
    const expiresAt = new Date(Date.now() + ACCOUNT_DELETION_INTENT_TTL_MS)
    await prisma.accountDeletionIntent.create({
      data: {
        userId: user.id,
        tokenHash: hashAccountDeletionIntentSecret(secret),
        expiresAt,
      },
    })

    const callbackUrl = new URL('/auth/callback', publicAppOrigin())
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl.toString(),
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error || !data.url) {
      await prisma.accountDeletionIntent.deleteMany({
        where: { tokenHash: hashAccountDeletionIntentSecret(secret), verifiedAt: null },
      })
      throw problems.authProviderUnavailable()
    }

    const response = NextResponse.json(
      { authorization_url: data.url, expires_at: expiresAt.toISOString() },
      { status: 201 },
    )
    response.cookies.set(
      ACCOUNT_DELETION_INTENT_COOKIE,
      secret,
      accountDeletionIntentCookieOptions(),
    )
    response.cookies.set(
      ACCOUNT_DELETION_RECEIPT_COOKIE,
      secret,
      accountDeletionReceiptCookieOptions(),
    )
    return response
  } catch (error) {
    return toProblemResponse(error)
  }
}
