import { NextResponse } from 'next/server'
import {
  productEventSessionReference,
  productEventTelemetryBinding,
} from '@/features/metrics/server/product-event'
import { requireAuthenticatedAccount, requireUser } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireUser()
    const { authUser } = await requireAuthenticatedAccount()
    const sessionReference = productEventSessionReference(authUser)
    return NextResponse.json({
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      ai_consent_at: user.aiConsentAt,
      created_at: user.createdAt,
      telemetry_binding: productEventTelemetryBinding(user.id, sessionReference),
    })
  } catch (e) {
    return toProblemResponse(e)
  }
}
