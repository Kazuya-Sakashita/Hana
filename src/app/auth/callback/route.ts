import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { publicAppOrigin, safeAuthReturnPath, signInPath } from '@/lib/auth/safe-redirect'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeAuthReturnPath(url.searchParams.get('next'))
  const appOrigin = publicAppOrigin()
  const retryUrl = new URL(signInPath(next), appOrigin)
  retryUrl.searchParams.set('reason', 'oauth_callback_failed')

  if (!code) {
    return NextResponse.redirect(retryUrl)
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    // 失敗時は再度サインイン画面へ
    return NextResponse.redirect(retryUrl)
  }
  return NextResponse.redirect(new URL(next, appOrigin))
}
