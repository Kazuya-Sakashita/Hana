import { Prisma } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getClaims: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  advisoryLock: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser, getClaims: mocks.getClaims },
  }),
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
    profile: { findUnique: mocks.findUnique, create: mocks.create, update: mocks.update },
  },
}))

import { GET } from '@/app/v1/me/route'
import { DELETE, POST } from '@/app/v1/me/ai-consent/route'
import { productEventTelemetryBinding } from '@/features/metrics/server/product-event'

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
const SESSION_ID = 'd89327d8-a5af-4f90-bc7e-93c8cad43f44'
const CONSENT_AT = new Date('2026-06-01T00:00:00Z')
const CREATED_AT = new Date('2026-05-14T09:30:00Z')

const profile = {
  id: USER_ID,
  displayName: null,
  aiConsentAt: null as Date | null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
}

function authed(profileOverrides: Partial<typeof profile> = {}) {
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: USER_ID,
        email: 'parent@example.com',
      },
    },
  })
  mocks.getClaims.mockResolvedValue({
    data: { claims: { sub: USER_ID, session_id: SESSION_ID } },
    error: null,
  })
  mocks.findUnique.mockResolvedValue({ ...profile, ...profileOverrides })
}

function unauthed() {
  mocks.getUser.mockResolvedValue({ data: { user: null } })
}

beforeEach(() => {
  vi.stubEnv('PRODUCT_EVENT_HASH_PEPPER', 'integration-test-product-event-pepper-32')
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      $executeRaw: mocks.advisoryLock,
      profile: {
        updateMany: mocks.updateMany,
        update: mocks.update,
        findUniqueOrThrow: mocks.findUniqueOrThrow,
      },
    }),
  )
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('GET /v1/me', () => {
  it('returns 401 + ProblemDetails when not authenticated', async () => {
    unauthed()
    const res = await GET()
    expect(res.status).toBe(401)
    expect(res.headers.get('Content-Type')).toBe('application/problem+json')
    const body = (await res.json()) as { reason: string }
    expect(body.reason).toBe('unauthorized')
  })

  it('returns 200 + AppUser when authenticated', async () => {
    authed()
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({
      id: USER_ID,
      email: 'parent@example.com',
      display_name: null,
      ai_consent_at: null,
      created_at: '2026-05-14T09:30:00.000Z',
      telemetry_binding: productEventTelemetryBinding(USER_ID, SESSION_ID),
    })
  })

  it('returns 401 when verified claims do not match getUser', async () => {
    authed()
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
          session_id: SESSION_ID,
        },
      },
      error: null,
    })

    const res = await GET()

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ reason: 'unauthorized' })
  })
})

describe('POST /v1/me/ai-consent', () => {
  it('uses a conditional owner update and preserves an existing consent time', async () => {
    authed({ aiConsentAt: CONSENT_AT })
    mocks.updateMany.mockResolvedValue({ count: 0 })
    mocks.findUniqueOrThrow.mockResolvedValue({ ...profile, aiConsentAt: CONSENT_AT })

    const res = await POST()

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id: USER_ID,
      ai_consent_at: CONSENT_AT.toISOString(),
      telemetry_binding: productEventTelemetryBinding(USER_ID, SESSION_ID),
    })
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: USER_ID, aiConsentAt: null },
      data: { aiConsentAt: expect.any(Date) },
    })
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5_000,
      timeout: 40_000,
    })
  })

  it('does not update consent without a verified session_id claim', async () => {
    authed()
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: USER_ID } }, error: null })

    const res = await POST()

    expect(res.status).toBe(401)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})

describe('DELETE /v1/me/ai-consent', () => {
  it('returns 401 without changing a profile when unauthenticated', async () => {
    unauthed()

    const res = await DELETE()

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ reason: 'unauthorized' })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('revokes only the authenticated owner consent', async () => {
    authed({ aiConsentAt: CONSENT_AT })
    mocks.update.mockResolvedValue({ ...profile, aiConsentAt: null })

    const res = await DELETE()

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id: USER_ID,
      ai_consent_at: null,
      telemetry_binding: productEventTelemetryBinding(USER_ID, SESSION_ID),
    })
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { aiConsentAt: null },
    })
  })

  it('is idempotent when consent is already absent', async () => {
    authed()
    mocks.update.mockResolvedValue({ ...profile, aiConsentAt: null })

    const first = await DELETE()
    const second = await DELETE()

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(await first.json()).toMatchObject({ ai_consent_at: null })
    expect(await second.json()).toMatchObject({ ai_consent_at: null })
    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(mocks.update).toHaveBeenNthCalledWith(1, {
      where: { id: USER_ID },
      data: { aiConsentAt: null },
    })
  })

  it('returns a stable conflict when the serialized update exceeds its wait budget', async () => {
    authed({ aiConsentAt: CONSENT_AT })
    mocks.transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('synthetic transaction timeout', {
        code: 'P2028',
        clientVersion: 'test',
      }),
    )

    const response = await DELETE()

    expect(response.status).toBe(409)
    expect(response.headers.get('Content-Type')).toBe('application/problem+json')
    expect(await response.json()).toMatchObject({ reason: 'ai_consent_update_busy' })
  })
})
