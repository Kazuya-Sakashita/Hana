import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { toProblemResponse } from '@/server/api/problem-response'
import { prisma } from '@/server/db/prisma'
import { readJsonBody } from '@/features/children/server/parse'
import { parseWaitlistSignupCreate } from '@/features/waitlist/server/parse'
import {
  assertWaitlistRateLimit,
  waitlistRetryAfterSeconds,
} from '@/features/waitlist/server/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    assertWaitlistRateLimit(request)
    const raw = await readJsonBody(request)
    const input = parseWaitlistSignupCreate(raw)
    const now = new Date()

    try {
      await prisma.waitlistSignup.upsert({
        where: { emailHash: input.emailHash },
        create: {
          email: input.email,
          emailHash: input.emailHash,
          source: input.source,
          privacyPolicyVersion: input.privacyPolicyVersion,
        },
        update: {
          email: input.email,
        },
      })
    } catch (dbErr) {
      if (dbErr instanceof Prisma.PrismaClientKnownRequestError && dbErr.code === 'P2002') {
        await prisma.waitlistSignup.update({
          where: { emailHash: input.emailHash },
          data: {
            email: input.email,
          },
        })
      } else {
        throw dbErr
      }
    }

    console.log(
      JSON.stringify({
        operation: 'waitlist-signup',
        status: 'accepted',
        source: input.source,
        privacyPolicyVersion: input.privacyPolicyVersion,
        level: 'info',
        ts: now.toISOString(),
      }),
    )

    return NextResponse.json({ status: 'accepted' }, { status: 202 })
  } catch (e) {
    const response = toProblemResponse(e)
    const retryAfterSeconds = waitlistRetryAfterSeconds(e)
    if (retryAfterSeconds !== null) response.headers.set('Retry-After', String(retryAfterSeconds))
    return response
  }
}
