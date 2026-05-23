import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut({ scope: 'global' })
  return NextResponse.redirect(new URL('/sign-in', request.url), { status: 303 })
}
