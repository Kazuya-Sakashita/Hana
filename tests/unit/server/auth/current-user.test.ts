import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getClaims: vi.fn(),
  findUnique: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: mocks.getUser,
      getClaims: mocks.getClaims,
    },
  }),
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    profile: {
      findUnique: mocks.findUnique,
    },
  },
}))

import {
  getCurrentUser,
  requireOwnership,
  requireUser,
  requireVerifiedSessionIdentity,
} from '@/server/auth/current-user'
import { ApiProblemError } from '@/lib/api/error'

afterEach(() => {
  vi.clearAllMocks()
})

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
const SESSION_ID = 'd89327d8-a5af-4f90-bc7e-93c8cad43f44'

const supabaseUser = {
  id: USER_ID,
  email: 'parent@example.com',
}

const profileRow = {
  id: USER_ID,
  displayName: null,
  aiConsentAt: null,
  accessBlockedAt: null,
  createdAt: new Date('2026-05-14T09:30:00Z'),
  updatedAt: new Date('2026-05-14T09:30:00Z'),
}

describe('getCurrentUser', () => {
  it('returns null when no Supabase session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    expect(await getCurrentUser()).toBeNull()
    expect(mocks.findUnique).not.toHaveBeenCalled()
  })

  it('hot path: existing profile uses findUnique only (no create)', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
    mocks.findUnique.mockResolvedValue(profileRow)

    const user = await getCurrentUser()
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: USER_ID } })
    expect(user).toEqual({
      id: USER_ID,
      email: 'parent@example.com',
      displayName: null,
      aiConsentAt: null,
      createdAt: '2026-05-14T09:30:00.000Z',
    })
  })

  it('does not recreate a missing profile from a normal API request', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
    mocks.findUnique.mockResolvedValue(null)

    const user = await getCurrentUser()
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: USER_ID } })
    expect(user).toBeNull()
  })

  it('returns null when account access is blocked even with a valid Auth session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
    mocks.findUnique.mockResolvedValue({
      ...profileRow,
      accessBlockedAt: new Date('2026-07-31T00:00:00Z'),
    })

    expect(await getCurrentUser()).toBeNull()
  })

  it('serializes aiConsentAt when present', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
    mocks.findUnique.mockResolvedValue({
      ...profileRow,
      aiConsentAt: new Date('2026-06-01T00:00:00Z'),
    })
    const user = await getCurrentUser()
    expect(user?.aiConsentAt).toBe('2026-06-01T00:00:00.000Z')
  })
})

describe('requireUser', () => {
  it('throws ApiProblemError with reason=unauthorized when no session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    await expect(requireUser()).rejects.toBeInstanceOf(ApiProblemError)
    await expect(requireUser()).rejects.toMatchObject({
      reason: 'unauthorized',
      status: 401,
    })
  })

  it('returns AppUser when session exists', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
    mocks.findUnique.mockResolvedValue(profileRow)
    const user = await requireUser()
    expect(user.id).toBe(USER_ID)
  })

  it('returns unauthorized for an expired or invalid cookie session', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthSessionMissingError' },
    })

    await expect(requireUser()).rejects.toMatchObject({
      reason: 'unauthorized',
      status: 401,
    })
    expect(mocks.findUnique).not.toHaveBeenCalled()
  })
})

describe('requireVerifiedSessionIdentity', () => {
  it('returns only a getUser-matched subject and verified session_id claim', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
    mocks.findUnique.mockResolvedValue(profileRow)
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: USER_ID, session_id: SESSION_ID } },
      error: null,
    })

    await expect(requireVerifiedSessionIdentity()).resolves.toEqual({
      subject: USER_ID,
      sessionId: SESSION_ID,
    })
  })

  it.each([
    ['missing session_id', { sub: USER_ID }],
    ['malformed session_id', { sub: USER_ID, session_id: 'not-a-uuid' }],
    [
      'getUser subject mismatch',
      { sub: '7f26e7f0-6f3c-4c07-9091-8f82db70b347', session_id: SESSION_ID },
    ],
  ])('rejects %s claims', async (_label, claims) => {
    mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
    mocks.findUnique.mockResolvedValue(profileRow)
    mocks.getClaims.mockResolvedValue({ data: { claims }, error: null })

    await expect(requireVerifiedSessionIdentity()).rejects.toMatchObject({
      reason: 'unauthorized',
      status: 401,
    })
  })
})

describe('requireOwnership', () => {
  it('is a no-op when ids match', () => {
    expect(() => requireOwnership(USER_ID, USER_ID)).not.toThrow()
  })

  it('throws ApiProblemError with reason=forbidden on mismatch', () => {
    let caught: unknown
    try {
      requireOwnership(USER_ID, 'other-user-id')
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ApiProblemError)
    expect((caught as ApiProblemError).reason).toBe('forbidden')
    expect((caught as ApiProblemError).status).toBe(403)
  })
})
