import { createSupabaseServerClient } from '@/lib/supabase/server'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    if (error) throw problems.signOutFailed()
    return new Response(null, { status: 204 })
  } catch {
    return toProblemResponse(problems.signOutFailed())
  }
}
