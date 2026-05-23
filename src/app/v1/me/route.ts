import { NextResponse } from 'next/server'
import { requireUser } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireUser()
    return NextResponse.json({
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      ai_consent_at: user.aiConsentAt,
      created_at: user.createdAt,
    })
  } catch (e) {
    return toProblemResponse(e)
  }
}
