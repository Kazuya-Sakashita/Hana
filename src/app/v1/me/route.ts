import { NextResponse } from 'next/server'
import { productEventTelemetryBinding } from '@/features/metrics/server/product-event'
import { requireUser, requireVerifiedSessionIdentity } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireUser()
    const session = await requireVerifiedSessionIdentity()
    if (session.subject !== user.id) throw problems.unauthorized()
    return NextResponse.json({
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      ai_consent_at: user.aiConsentAt,
      created_at: user.createdAt,
      telemetry_binding: productEventTelemetryBinding(user.id, session.sessionId),
    })
  } catch (e) {
    return toProblemResponse(e)
  }
}
