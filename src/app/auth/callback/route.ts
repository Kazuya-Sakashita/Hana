import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  ACCOUNT_DELETION_INTENT_COOKIE,
  hashAccountDeletionIntentSecret,
} from '@/features/account-deletion/server/intent'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { publicAppOrigin, safeAuthReturnPath, signInPath } from '@/lib/auth/safe-redirect'
import { prisma } from '@/server/db/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeAuthReturnPath(url.searchParams.get('next'))
  const appOrigin = publicAppOrigin()
  const retryUrl = new URL(signInPath(next), appOrigin)
  retryUrl.searchParams.set('reason', 'oauth_callback_failed')

  if (!code) {
    const cookieStore = await cookies()
    if (cookieStore.get(ACCOUNT_DELETION_INTENT_COOKIE)?.value) {
      const cancelledUrl = new URL('/sign-in', appOrigin)
      cancelledUrl.searchParams.set('next', '/settings')
      cancelledUrl.searchParams.set('reason', 'account_deletion_reauthentication_failed')
      const response = NextResponse.redirect(cancelledUrl)
      response.cookies.delete(ACCOUNT_DELETION_INTENT_COOKIE)
      return response
    }
    return NextResponse.redirect(retryUrl)
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    // 失敗時は再度サインイン画面へ
    return NextResponse.redirect(retryUrl)
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(retryUrl)

  const cookieStore = await cookies()
  const intentSecret = cookieStore.get(ACCOUNT_DELETION_INTENT_COOKIE)?.value
  if (intentSecret) {
    const now = new Date()
    const tokenHash = hashAccountDeletionIntentSecret(intentSecret)
    const intent = await prisma.accountDeletionIntent.findUnique({ where: { tokenHash } })
    if (
      !intent ||
      intent.expiresAt <= now ||
      intent.consumedAt ||
      intent.verifiedAt ||
      intent.userId !== user.id
    ) {
      if (intent && !intent.consumedAt) {
        await prisma.accountDeletionIntent.update({
          where: { id: intent.id },
          data: { consumedAt: now },
        })
      }
      await supabase.auth.signOut({ scope: 'local' })
      const mismatchUrl = new URL('/sign-in', appOrigin)
      mismatchUrl.searchParams.set('next', '/settings')
      mismatchUrl.searchParams.set('reason', 'account_deletion_reauthentication_failed')
      const mismatchResponse = NextResponse.redirect(mismatchUrl)
      mismatchResponse.cookies.delete(ACCOUNT_DELETION_INTENT_COOKIE)
      return mismatchResponse
    }

    await prisma.accountDeletionIntent.update({
      where: { id: intent.id },
      data: { verifiedAt: now },
    })
    return NextResponse.redirect(new URL('/settings?account_deletion=verified', appOrigin))
  }

  const deletionRequest = await prisma.accountDeletionRequest.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (deletionRequest) {
    await supabase.auth.signOut({ scope: 'global' })
    return NextResponse.redirect(new URL('/account-closed', appOrigin))
  }
  await prisma.profile.upsert({
    where: { id: user.id },
    create: { id: user.id },
    update: {},
  })
  return NextResponse.redirect(new URL(next, appOrigin))
}
