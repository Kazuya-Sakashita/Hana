import { Prisma, type ProductEvent } from '@prisma/client'
import { NextResponse } from 'next/server'
import {
  assertProductEventIngestReady,
  assertProductEventOccurrenceMatchesId,
  assertProductEventRequestRateLimit,
  assertProductEventTelemetryBinding,
  parseProductEventReport,
  PRODUCT_EVENT_MAX_REPORTS_PER_WINDOW,
  PRODUCT_EVENT_RATE_LIMIT_WINDOW_MS,
  productEventActorHash,
  productEventOccurrenceMinuteFromEventId,
} from '@/features/metrics/server/product-event'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'
import { requireUser, requireVerifiedSessionIdentity } from '@/server/auth/current-user'
import { prisma } from '@/server/db/prisma'

export const dynamic = 'force-dynamic'
const RETRY_AFTER_SECONDS = Math.ceil(PRODUCT_EVENT_RATE_LIMIT_WINDOW_MS / 1000)

async function readJson(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown
  } catch {
    throw problems.validation([
      { path: 'body', reason: 'invalid_json', message: 'JSON形式で送信してください' },
    ])
  }
}

function assertJsonRequest(request: Request): void {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    throw problems.validation([
      {
        path: 'headers.content-type',
        reason: 'request_boundary_invalid',
        message: 'JSON requestだけを受け付けます',
      },
    ])
  }
}

function matchesEvent(
  existing: ProductEvent,
  event: ReturnType<typeof parseProductEventReport>,
  actorHash: string,
): boolean {
  return (
    existing.actorHash === actorHash &&
    existing.flowId === event.flow_id &&
    existing.eventName === event.event_name &&
    productEventOccurrenceMinuteFromEventId(existing.eventId) === event.occurred_minute_utc &&
    existing.elapsedBucket === event.elapsed_bucket
  )
}

export async function POST(request: Request) {
  try {
    assertProductEventIngestReady()
    assertJsonRequest(request)
    const telemetryBinding = request.headers.get('x-hana-telemetry-binding')
    if (!telemetryBinding) throw problems.forbidden()
    const now = new Date()
    const user = await requireUser()
    const session = await requireVerifiedSessionIdentity()
    if (session.subject !== user.id) throw problems.unauthorized()
    assertProductEventTelemetryBinding(user.id, session.sessionId, telemetryBinding, now)
    const actorHash = productEventActorHash(user.id)
    assertProductEventRequestRateLimit(actorHash, now.getTime())
    const event = parseProductEventReport(await readJson(request), now)

    try {
      await prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${actorHash}, 0))
        `
        const existingById = await transaction.productEvent.findUnique({
          where: { eventId: event.event_id },
        })
        if (existingById) {
          if (existingById.actorHash !== actorHash) return
          if (matchesEvent(existingById, event, actorHash)) return
          throw problems.productEventConflict()
        }
        assertProductEventOccurrenceMatchesId(event)

        const existingStage = await transaction.productEvent.findFirst({
          where: {
            actorHash,
            flowId: event.flow_id,
            eventName: event.event_name,
          },
        })
        if (existingStage) return

        const recentReports = await transaction.productEvent.count({
          where: {
            actorHash,
            createdAt: { gte: new Date(now.getTime() - PRODUCT_EVENT_RATE_LIMIT_WINDOW_MS) },
          },
        })
        if (recentReports >= PRODUCT_EVENT_MAX_REPORTS_PER_WINDOW) {
          throw problems.rateLimited()
        }

        await transaction.productEvent.create({
          data: {
            eventId: event.event_id,
            actorHash,
            flowId: event.flow_id,
            eventName: event.event_name,
            elapsedBucket: event.elapsed_bucket,
          },
        })
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingById = await prisma.productEvent.findUnique({
          where: { eventId: event.event_id },
        })
        if (existingById) {
          if (existingById.actorHash !== actorHash) {
            return new NextResponse(null, { status: 204 })
          }
          if (matchesEvent(existingById, event, actorHash))
            return new NextResponse(null, { status: 204 })
          throw problems.productEventConflict()
        }

        const existingStage = await prisma.productEvent.findFirst({
          where: {
            actorHash,
            flowId: event.flow_id,
            eventName: event.event_name,
          },
        })
        if (existingStage) return new NextResponse(null, { status: 204 })
      }
      throw error
    }

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    const response = toProblemResponse(error)
    if (response.status === 429) response.headers.set('Retry-After', String(RETRY_AFTER_SECONDS))
    return response
  }
}
