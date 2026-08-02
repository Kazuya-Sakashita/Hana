import { Prisma } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
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
    auth: { getUser: mocks.getUser },
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

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
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
    data: { user: { id: USER_ID, email: 'parent@example.com' } },
  })
  mocks.findUnique.mockResolvedValue({ ...profile, ...profileOverrides })
}

function unauthed() {
  mocks.getUser.mockResolvedValue({ data: { user: null } })
}

beforeEach(() => {
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

afterEach(() => vi.clearAllMocks())

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
    })
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
    expect(await res.json()).toMatchObject({ id: USER_ID, ai_consent_at: null })
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
