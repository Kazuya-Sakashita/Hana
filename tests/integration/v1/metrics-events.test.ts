import { Prisma } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileFindUnique: vi.fn(),
  profileCreate: vi.fn(),
  eventCreate: vi.fn(),
  eventCount: vi.fn(),
  eventFindUnique: vi.fn(),
  eventFindFirst: vi.fn(),
  advisoryLock: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
    profile: {
      findUnique: mocks.profileFindUnique,
      create: mocks.profileCreate,
    },
    productEvent: {
      create: mocks.eventCreate,
      count: mocks.eventCount,
      findUnique: mocks.eventFindUnique,
      findFirst: mocks.eventFindFirst,
    },
  },
}))

import { POST } from '@/app/v1/metrics/events/route'
import {
  productEventActorHash,
  productEventTelemetryBinding,
} from '@/features/metrics/server/product-event'

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
const OTHER_USER_ID = '6e15d6e0-5e2b-4af6-8f80-7e71ca60a236'
const occurredMinute = new Date()
occurredMinute.setUTCSeconds(0, 0)
const validReport = {
  event_name: 'photo_selected',
  event_id: '123e4567-e89b-42d3-a456-426614174000',
  flow_id: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
  occurred_minute_utc: occurredMinute.toISOString().replace('.000Z', 'Z'),
  elapsed_bucket: 'under_10s',
}

function request(
  body: unknown,
  telemetryBinding: string | null = productEventTelemetryBinding(USER_ID),
) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (telemetryBinding !== null) headers.set('X-Hana-Telemetry-Binding', telemetryBinding)
  return new Request('http://localhost:3000/v1/metrics/events', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv('PRODUCT_EVENT_HASH_PEPPER', 'integration-test-product-event-pepper-32')
  mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  mocks.profileFindUnique.mockResolvedValue({
    id: USER_ID,
    displayName: null,
    aiConsentAt: null,
    createdAt: new Date('2026-07-01T00:00:00Z'),
  })
  mocks.eventCreate.mockResolvedValue(validReport)
  mocks.eventCount.mockResolvedValue(0)
  mocks.eventFindUnique.mockResolvedValue(null)
  mocks.eventFindFirst.mockResolvedValue(null)
  mocks.advisoryLock.mockResolvedValue(1)
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      $executeRaw: mocks.advisoryLock,
      productEvent: {
        create: mocks.eventCreate,
        count: mocks.eventCount,
        findUnique: mocks.eventFindUnique,
        findFirst: mocks.eventFindFirst,
      },
    }),
  )
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('POST /v1/metrics/events', () => {
  it('stores the allowlisted event with a server-derived actor hash', async () => {
    const response = await POST(request(validReport))

    expect(response.status).toBe(204)
    expect(mocks.eventCreate).toHaveBeenCalledTimes(1)
    const data = mocks.eventCreate.mock.calls[0]?.[0]?.data
    expect(data.eventId).toBe(validReport.event_id)
    expect(data.eventName).toBe(validReport.event_name)
    expect(data.actorHash).toMatch(/^[0-9a-f]{64}$/)
    expect(data.actorHash).not.toBe(USER_ID)
    expect(data).not.toHaveProperty('userId')
    expect(data).not.toHaveProperty('occurredMinuteUtc')
  })

  it.each([
    ['missing', null],
    ['another actor', productEventTelemetryBinding(OTHER_USER_ID)],
    ['malformed', 'v1.invalid'],
  ])(
    'rejects a %s telemetry binding before touching ProductEvent storage',
    async (_label, binding) => {
      const response = await POST(request(validReport, binding))

      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ reason: 'forbidden' })
      expect(mocks.profileFindUnique).not.toHaveBeenCalled()
      expect(mocks.transaction).not.toHaveBeenCalled()
      expect(mocks.advisoryLock).not.toHaveBeenCalled()
      expect(mocks.eventFindUnique).not.toHaveBeenCalled()
      expect(mocks.eventFindFirst).not.toHaveBeenCalled()
      expect(mocks.eventCount).not.toHaveBeenCalled()
      expect(mocks.eventCreate).not.toHaveBeenCalled()
    },
  )

  it('requires authentication', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    const response = await POST(request(validReport))

    expect(response.status).toBe(401)
    expect(mocks.eventCreate).not.toHaveBeenCalled()
  })

  it('rejects a client-supplied actor identifier', async () => {
    const response = await POST(
      request({
        ...validReport,
        actor_hash: 'client-supplied-value',
      }),
    )

    expect(response.status).toBe(422)
    expect(mocks.eventCreate).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', undefined],
    ['future', new Date(Date.now() + 60_000).toISOString().replace(/:\d{2}\.\d{3}Z$/, ':00Z')],
    [
      'older than 24 hours',
      new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString().replace(/:\d{2}\.\d{3}Z$/, ':00Z'),
    ],
  ])('rejects a %s occurrence minute before opening a transaction', async (_label, value) => {
    const report = { ...validReport }
    if (value === undefined) delete (report as Partial<typeof validReport>).occurred_minute_utc
    else report.occurred_minute_utc = value

    const response = await POST(request(report))

    expect(response.status).toBe(422)
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.eventCreate).not.toHaveBeenCalled()
  })

  it('returns the same 204 for an idempotent duplicate', async () => {
    mocks.eventCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate event', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }),
    )
    mocks.eventFindUnique.mockResolvedValue({
      eventId: validReport.event_id,
      actorHash: productEventActorHash(USER_ID),
      flowId: validReport.flow_id,
      eventName: validReport.event_name,
      elapsedBucket: validReport.elapsed_bucket,
    })

    const response = await POST(request(validReport))

    expect(response.status).toBe(204)
  })

  it('returns 409 when the same event id is reused for different content', async () => {
    mocks.eventCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate event', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }),
    )
    mocks.eventFindUnique.mockResolvedValue({
      eventId: validReport.event_id,
      actorHash: 'different-actor',
      flowId: validReport.flow_id,
      eventName: validReport.event_name,
      elapsedBucket: validReport.elapsed_bucket,
    })

    const response = await POST(request(validReport))
    expect(response.status).toBe(409)
  })

  it('deduplicates a repeated stage within the same flow', async () => {
    mocks.eventCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate stage', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }),
    )
    mocks.eventFindFirst.mockResolvedValue({ eventId: 'existing-stage' })

    const response = await POST(request(validReport))
    expect(response.status).toBe(204)
  })

  it('rate-limits excessive reports from the same server-derived actor', async () => {
    mocks.eventCount.mockResolvedValue(60)

    const response = await POST(request(validReport))
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(mocks.eventCreate).not.toHaveBeenCalled()
  })

  it('returns 204 for an idempotent retry even after the rate limit is reached', async () => {
    mocks.eventCount.mockResolvedValue(60)
    mocks.eventFindUnique.mockResolvedValue({
      eventId: validReport.event_id,
      actorHash: productEventActorHash(USER_ID),
      flowId: validReport.flow_id,
      eventName: validReport.event_name,
      elapsedBucket: validReport.elapsed_bucket,
    })

    const response = await POST(request(validReport))
    expect(response.status).toBe(204)
    expect(mocks.eventCount).not.toHaveBeenCalled()
  })

  it('keeps retention deletion outside the ingest authority', async () => {
    const response = await POST(request(validReport))

    expect(response.status).toBe(204)
    expect(mocks.eventCreate).toHaveBeenCalledTimes(1)
    expect(mocks.advisoryLock).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid JSON with Problem Details', async () => {
    const invalidRequest = new Request('http://localhost:3000/v1/metrics/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hana-Telemetry-Binding': productEventTelemetryBinding(USER_ID),
      },
      body: '{',
    })

    const response = await POST(invalidRequest)
    expect(response.status).toBe(422)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
  })
})
