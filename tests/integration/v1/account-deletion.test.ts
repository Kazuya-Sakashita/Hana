import { afterEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { publicAppOrigin } from '@/lib/auth/safe-redirect'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireAuthenticatedAccount: vi.fn(),
  intentCreate: vi.fn(),
  intentDeleteMany: vi.fn(),
  intentFindFirst: vi.fn(),
  intentUpdate: vi.fn(),
  deletionFindUnique: vi.fn(),
  deletionCreate: vi.fn(),
  deletionUpdateMany: vi.fn(),
  profileUpdateMany: vi.fn(),
  childUpdateMany: vi.fn(),
  memoryUpdateMany: vi.fn(),
  imageUpdateMany: vi.fn(),
  imageFindMany: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
  signInWithOAuth: vi.fn(),
  cookieSecret: 'synthetic-intent-secret',
}))

vi.mock('@/server/auth/current-user', () => ({
  requireUser: mocks.requireUser,
  requireAuthenticatedAccount: mocks.requireAuthenticatedAccount,
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'hana_account_deletion_intent' || name === 'hana_account_deletion_receipt'
        ? { value: mocks.cookieSecret }
        : undefined,
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { signInWithOAuth: mocks.signInWithOAuth },
  }),
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    accountDeletionIntent: {
      create: mocks.intentCreate,
      deleteMany: mocks.intentDeleteMany,
    },
    accountDeletionRequest: {
      findUnique: mocks.deletionFindUnique,
      updateMany: mocks.deletionUpdateMany,
    },
    $transaction: mocks.transaction,
  },
}))

import { POST as CREATE_INTENT } from '@/app/v1/me/account-deletion-intents/route'
import { POST as REQUEST_DELETION } from '@/app/v1/me/account-deletion/route'
import { GET as GET_DELETION_STATUS } from '@/app/v1/me/account-deletion/status/route'

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
const IDEMPOTENCY_KEY = '550e8400-e29b-41d4-a716-446655440000'
const APP_ORIGIN = publicAppOrigin()
const user = {
  id: USER_ID,
  email: null,
  displayName: null,
  aiConsentAt: null,
  createdAt: '2026-05-14T09:30:00.000Z',
}
const profile = {
  id: USER_ID,
  accessBlockedAt: null,
}

function deletionRequest() {
  return new Request('http://localhost:3000/v1/me/account-deletion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': IDEMPOTENCY_KEY,
      Origin: APP_ORIGIN,
    },
    body: JSON.stringify({ confirmation: '退会する' }),
  })
}

function setupDeletionTransaction() {
  mocks.intentFindFirst.mockResolvedValue({
    id: 'intent-id',
    userId: USER_ID,
    verifiedAt: new Date(),
  })
  mocks.profileUpdateMany.mockResolvedValue({ count: 1 })
  mocks.childUpdateMany.mockResolvedValue({ count: 1 })
  mocks.memoryUpdateMany.mockResolvedValue({ count: 1 })
  mocks.imageUpdateMany.mockResolvedValue({ count: 1 })
  mocks.imageFindMany.mockResolvedValue([])
  mocks.executeRaw.mockResolvedValue(0)
  mocks.intentUpdate.mockResolvedValue({})
  mocks.deletionCreate.mockImplementation(async ({ data }) => ({
    id: 'request-id',
    ...data,
  }))
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      accountDeletionIntent: {
        findFirst: mocks.intentFindFirst,
        update: mocks.intentUpdate,
      },
      accountDeletionRequest: {
        findUnique: mocks.deletionFindUnique,
        create: mocks.deletionCreate,
      },
      profile: { updateMany: mocks.profileUpdateMany },
      child: { updateMany: mocks.childUpdateMany },
      memory: { updateMany: mocks.memoryUpdateMany },
      image: { findMany: mocks.imageFindMany, updateMany: mocks.imageUpdateMany },
      $executeRaw: mocks.executeRaw,
    }),
  )
}

afterEach(() => {
  vi.clearAllMocks()
  mocks.cookieSecret = 'synthetic-intent-secret'
})

describe('POST /v1/me/account-deletion-intents', () => {
  it('stores only a token hash and returns the OAuth URL without the raw secret', async () => {
    mocks.requireUser.mockResolvedValue(user)
    mocks.intentCreate.mockResolvedValue({})
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://accounts.example.invalid/oauth' },
      error: null,
    })

    const response = await CREATE_INTENT(
      new Request('http://localhost:3000/v1/me/account-deletion-intents', {
        method: 'POST',
        headers: { Origin: APP_ORIGIN },
      }),
    )
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(201)
    expect(body.authorization_url).toBe('https://accounts.example.invalid/oauth')
    expect(JSON.stringify(body)).not.toContain(mocks.cookieSecret)
    const tokenHash = mocks.intentCreate.mock.calls[0]?.[0].data.tokenHash as string
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(tokenHash).not.toBe(mocks.cookieSecret)
    const setCookie = response.headers.get('set-cookie')
    expect(setCookie).toContain('hana_account_deletion_intent=')
    expect(setCookie).toContain('hana_account_deletion_receipt=')
    expect(setCookie).toContain('Max-Age=2592000')
    expect(setCookie).toContain('HttpOnly')
  })

  it('removes the pending intent and returns 503 when OAuth cannot start', async () => {
    mocks.requireUser.mockResolvedValue(user)
    mocks.intentCreate.mockResolvedValue({})
    mocks.intentDeleteMany.mockResolvedValue({ count: 1 })
    mocks.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { name: 'AuthError' } })

    const response = await CREATE_INTENT(
      new Request('http://localhost:3000/v1/me/account-deletion-intents', {
        method: 'POST',
        headers: { Origin: APP_ORIGIN },
      }),
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ reason: 'auth_provider_unavailable' })
    expect(mocks.intentDeleteMany).toHaveBeenCalledOnce()
  })
})

describe('POST /v1/me/account-deletion', () => {
  it('blocks all owned data and enqueues Auth revocation in one transaction', async () => {
    mocks.requireAuthenticatedAccount.mockResolvedValue({ authUser: { id: USER_ID }, profile })
    mocks.deletionFindUnique.mockResolvedValue(null)
    setupDeletionTransaction()

    const response = await REQUEST_DELETION(deletionRequest())

    expect(response.status).toBe(202)
    expect(mocks.profileUpdateMany).toHaveBeenCalledWith({
      where: { id: USER_ID, accessBlockedAt: null },
      data: expect.objectContaining({
        aiConsentAt: null,
        deletionRequestedAt: expect.any(Date),
        accessBlockedAt: expect.any(Date),
        purgeAfter: expect.any(Date),
      }),
    })
    const blockedAt = mocks.profileUpdateMany.mock.calls[0]?.[0].data.accessBlockedAt
    expect(mocks.childUpdateMany.mock.calls[0]?.[0].data.deletedAt).toEqual(blockedAt)
    expect(mocks.memoryUpdateMany.mock.calls[0]?.[0].data.deletedAt).toEqual(blockedAt)
    expect(mocks.imageUpdateMany.mock.calls[0]?.[0].data.deletedAt).toEqual(blockedAt)
    expect(mocks.deletionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        receiptHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    })
    const setCookie = response.headers.get('set-cookie')
    expect(setCookie).toContain('hana_account_deletion_receipt=')
    expect(setCookie).toContain('hana_account_deletion_intent=')
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })

  it('returns 202 without waiting for the Auth provider', async () => {
    mocks.requireAuthenticatedAccount.mockResolvedValue({ authUser: { id: USER_ID }, profile })
    mocks.deletionFindUnique.mockResolvedValue(null)
    setupDeletionTransaction()

    const response = await REQUEST_DELETION(deletionRequest())

    expect(response.status).toBe(202)
    expect(mocks.deletionCreate).toHaveBeenCalledOnce()
  })

  it('rejects an invalid confirmation before changing data', async () => {
    mocks.requireAuthenticatedAccount.mockResolvedValue({ authUser: { id: USER_ID }, profile })
    mocks.deletionFindUnique.mockResolvedValue(null)

    const response = await REQUEST_DELETION(
      new Request('http://localhost:3000/v1/me/account-deletion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': IDEMPOTENCY_KEY,
          Origin: APP_ORIGIN,
        },
        body: JSON.stringify({ confirmation: '退会' }),
      }),
    )

    expect(response.status).toBe(422)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('requires a verified intent cookie for the first request', async () => {
    mocks.requireAuthenticatedAccount.mockResolvedValue({ authUser: { id: USER_ID }, profile })
    mocks.deletionFindUnique.mockResolvedValue(null)
    mocks.cookieSecret = ''

    const response = await REQUEST_DELETION(deletionRequest())

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      reason: 'account_deletion_reauthentication_required',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('returns the original acceptance on an idempotent retry', async () => {
    const existing = {
      requestedAt: new Date('2026-07-31T00:00:00Z'),
      purgeAfter: new Date('2026-08-30T00:00:00Z'),
      authRevokedAt: new Date('2026-07-31T00:00:01Z'),
    }
    mocks.requireAuthenticatedAccount.mockResolvedValue({
      authUser: { id: USER_ID },
      profile: { ...profile, accessBlockedAt: existing.requestedAt },
    })
    mocks.deletionFindUnique.mockResolvedValue(existing)

    const response = await REQUEST_DELETION(deletionRequest())

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({
      status: 'accepted',
      requested_at: '2026-07-31T00:00:00.000Z',
      purge_after: '2026-08-30T00:00:00.000Z',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('converges a concurrent unique-key race to the existing 202 response', async () => {
    const existing = {
      requestedAt: new Date('2026-07-31T00:00:00Z'),
      purgeAfter: new Date('2026-08-30T00:00:00Z'),
    }
    mocks.requireAuthenticatedAccount.mockResolvedValue({ authUser: { id: USER_ID }, profile })
    mocks.deletionFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(existing)
    mocks.transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique race', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    )

    const response = await REQUEST_DELETION(deletionRequest())

    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({
      requested_at: '2026-07-31T00:00:00.000Z',
      purge_after: '2026-08-30T00:00:00.000Z',
    })
  })

  it('rejects a cross-origin deletion request before reading account data', async () => {
    const request = deletionRequest()
    request.headers.set('Origin', 'https://attacker.invalid')

    const response = await REQUEST_DELETION(request)

    expect(response.status).toBe(403)
    expect(mocks.requireAuthenticatedAccount).not.toHaveBeenCalled()
  })
})

describe('GET /v1/me/account-deletion/status', () => {
  it('returns the accepted state by receipt without authentication', async () => {
    mocks.deletionFindUnique.mockResolvedValue({
      requestedAt: new Date('2026-07-31T00:00:00Z'),
      purgeAfter: new Date('2026-08-30T00:00:00Z'),
    })

    const response = await GET_DELETION_STATUS()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'accepted',
      requested_at: '2026-07-31T00:00:00.000Z',
      purge_after: '2026-08-30T00:00:00.000Z',
    })
    expect(mocks.deletionFindUnique).toHaveBeenCalledWith({
      where: { receiptHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
      select: { requestedAt: true, purgeAfter: true },
    })
  })
})
