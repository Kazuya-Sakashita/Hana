import { Prisma } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileFindUnique: vi.fn(),
  profileCreate: vi.fn(),
  eventCreate: vi.fn(),
  eventDeleteMany: vi.fn(),
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
      deleteMany: mocks.eventDeleteMany,
      count: mocks.eventCount,
      findUnique: mocks.eventFindUnique,
      findFirst: mocks.eventFindFirst,
    },
  },
}))

import { POST } from '@/app/v1/metrics/events/route'
import { productEventActorHash } from '@/features/metrics/server/product-event'

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
const validReport = {
  event_name: 'photo_selected',
  event_id: '123e4567-e89b-42d3-a456-426614174000',
  flow_id: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
  elapsed_bucket: 'under_10s',
}

function request(body: unknown) {
  return new Request('http://localhost:3000/v1/metrics/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  mocks.eventDeleteMany.mockResolvedValue({ count: 0 })
  mocks.eventCount.mockResolvedValue(0)
  mocks.eventFindUnique.mockResolvedValue(null)
  mocks.eventFindFirst.mockResolvedValue(null)
  mocks.advisoryLock.mockResolvedValue(1)
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      $executeRaw: mocks.advisoryLock,
      productEvent: {
        create: mocks.eventCreate,
        deleteMany: mocks.eventDeleteMany,
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
  })

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

  it('purges events older than the retention window before accepting a report', async () => {
    const response = await POST(request(validReport))

    expect(response.status).toBe(204)
    expect(mocks.eventDeleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: expect.any(Date) } },
    })
    expect(mocks.advisoryLock).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid JSON with Problem Details', async () => {
    const invalidRequest = new Request('http://localhost:3000/v1/metrics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    })

    const response = await POST(invalidRequest)
    expect(response.status).toBe(422)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
  })
})
